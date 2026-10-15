// The map editor (editor.html): paint terrain, draw walls and hedges along hex
// edges corner to corner, put parapets on hex sides, place the BLUFOR start,
// the objective and OPFOR teams, then play the map. The map and its rules are
// in model.js; this file draws it (in 3D, render/world3d.js) and
// takes input. The draft is kept in the browser (store.js) as you go.

import { toScreen } from '../render/camera.js';
import { COLORS, drawHexMarks } from '../render/hexmap.js';
import { mapStill } from '../render/still.js';
import { TERRAIN } from '../text.js';
import { createWorld } from '../render/world3d.js';
import { center, corners, hexAt, SIDES } from '../sim/hex.js';
import { parseMap } from '../sim/map.js';
import { unitType } from '../sim/state.js';
import {
  ENEMY_TEAMS, TERRAINS, clone, drawEdges, edgePath, eraseEdge, fitMap, formation, fromMapJson, graph,
  inside, moveObjective, nearestEdge, nearestVertex, newModel, paint, problems, randomize, startNear, terrainAt, toggleEnemy,
  toggleParapet, toMapJson,
} from './model.js';
import { connectHub, hub, hubHome, hubIdOf, hubMapPage, hubSrc } from '../hub.js';
import { LOCAL, deleteMap, listMaps, loadDraft, loadMap, saveDraft, saveMap } from './store.js';

const WHEEL_ZOOM = 1.15;
const CLICK_SLOP_PX = 4;
const FIT_GAP = 16;
const HISTORY = 100;                        // undo steps kept
const REACH = { vertex: 0.42, edge: 0.45 }; // world units: how near a corner or an edge the pointer must be
const NEAR_CORNERS = 3.2;                   // corners shown within this many world units of the pointer
const STROKE_STEP = 0.35;                   // world units between samples along a drag
const SQUAD_LABEL = 0.55;                   // the start's A / B / SL labels: text height in world units
const SAVE_DELAY_MS = 400;
const HUB_SAVE_DELAY_MS = 1500;             // an open hub draft saves itself this long after the last change
const ARROW_PAN_PX = 140;                   // an arrow key pans the view this far
const ARROWS = { ArrowLeft: [ARROW_PAN_PX, 0], ArrowRight: [-ARROW_PAN_PX, 0], ArrowUp: [0, ARROW_PAN_PX], ArrowDown: [0, -ARROW_PAN_PX] };
const TOAST_MS = 2600;
const BUILT_IN = [['trenchline', 'Миссия 1: Trench Line']]; // not the training ground: a 12 x 12 sandbox with no mission
const TERRAIN_KEYS = '12345678';
const TOOL_KEYS = { w: 'wall', h: 'hedge', p: 'parapet', x: 'erase', b: 'start', o: 'objective', f: 'enemy' };
const INK = {
  start: '#5996dc', objective: '#f4db50', enemy: '#e25a55', brush: '#ffffff', label: '#ffffff', under: 'rgba(13, 15, 17, 0.7)',
  wall: '#f3eee2', hedge: '#8fe36b', remove: '#f26f63', parapet: '#e8c77e', corner: 'rgba(255, 255, 255, 0.75)',
};
const LABELS = Object.fromEntries(Object.entries(TERRAIN).map(([k, t]) => [k, t.name])); // the palette's names (text.js)

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Не удалось загрузить ${path}: ${res.status}`);
  return res.json();
}

// A map by its ?map= name: a built-in file or one saved in this browser.
async function openNamed(name) {
  if (name.startsWith(LOCAL)) {
    const json = loadMap(name.slice(LOCAL.length));
    if (!json) throw new Error(`Карта «${name.slice(LOCAL.length)}» не сохранена в этом браузере`);
    return json;
  }
  return loadJson(`data/maps/${encodeURIComponent(name)}.json`);
}

async function main() {
  const [balance, hubLink] = await Promise.all([loadJson('data/balance.json'), connectHub()]);
  const params = new URLSearchParams(location.search);

  const ed = {
    model: null,
    id: null,          // where it is saved in My maps (this browser), once it is
    hub: hubLink && !hubLink.error ? hubLink : null, // the TS Hub, when it serves the editor: { name, maps }
    hubId: null,       // the hub draft this map is, once saved there
    hubState: 'none',  // none (not in the hub yet), saving, saved, unsaved, error
    hubError: '',
    tool: 'terrain',
    terrain: 'woods',
    chain: null,       // wall or hedge being drawn: the corner it has got to
    hover: null,       // { p, hex, vertex, edge, side }
    undo: [],
    redo: [],
    version: 0,        // bumped on every change, for the 3D marks layer
  };

  // The map to start from: from the hub ?draft= (one of yours) or ?src= (a map JSON on this site: your
  // draft goes on, anyone else's map or a published one opens as a new map); ?map= (from the game's Edit
  // button); else the draft in this browser; else a new one.
  const draft = loadDraft();
  const wanted = params.get('map');
  const src = params.get('src');
  const fromHub = params.get('draft') ?? (src && hubIdOf(src));
  const ownDraft = (id) => !!id && !!ed.hub?.maps.some((x) => x.id === id && x.status === 'draft');
  if (params.get('draft') || src) {
    if (ownDraft(fromHub)) {
      ed.model = fromMapJson(await hub.load(fromHub));
      ed.hubId = fromHub;
      ed.hubState = 'saved';
    } else {
      ed.model = fromMapJson(await loadJson(src ?? hubSrc(fromHub)));
    }
    for (const k of ['draft', 'src']) params.delete(k);
    history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}`);
  } else if (wanted) {
    if (draft?.model && !draft.id) saveMap(toMapJson(draft.model, balance)); // don't lose an unsaved draft
    ed.model = fromMapJson(await openNamed(wanted));
    ed.id = wanted.startsWith(LOCAL) ? wanted.slice(LOCAL.length) : null;
    params.delete('map');
    history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}`);
  } else if (draft?.model) {
    // A draft from when maps had other sizes, a turn limit or a briefing of their own.
    ed.model = fitMap(draft.model);
    delete ed.model.turns;
    delete ed.model.brief;
    ed.id = draft.id ?? null;
    if (ownDraft(draft.hubId)) {
      ed.hubId = draft.hubId;
      ed.hubState = 'unsaved'; // this browser's copy may be newer than the hub's: saved again below
    }
  } else {
    ed.model = newModel();
  }

  const canvas = $('board');
  const world = createWorld(canvas, renderMap(), { pickCounters: false });
  const cam = world.camera; // toWorld, zoomAt, panBy, orbit, turn, fit
  let gameMap = renderMap();
  let edgeGraph = graph(ed.model.width, ed.model.height);
  let graphSize = `${ed.model.width}x${ed.model.height}`;
  let counters = makeCounters();
  let worldDirty = false;
  let pendingFit = false; // fit once the board has been rebuilt at its new size
  const rosterOf = (u) => unitType(balance, u).roles;

  // The map as the renderers want it: parsed like a game map, without units.
  function renderMap() {
    return parseMap({ ...toMapJson(ed.model, balance), units: [] }, balance);
  }

  // The forces, drawn as the game draws counters.
  function makeCounters() {
    const m = ed.model;
    const out = [];
    const counter = (id, side, team, kind, hex) => ({
      unit: { id, side, team, kind, type: null, soldiers: [...unitType(balance, { kind, type: null }).roles], status: 'ok', activated: false, exposed: false, moved: false },
      pos: center(hex), selected: false, ghost: false, stackedWithTeam: false,
    });
    const f = formation(m.start);
    out.push(counter(0, 'BLUFOR', 'ALPHA', 'team', f.ALPHA), counter(1, 'BLUFOR', 'BRAVO', 'team', f.BRAVO), counter(2, 'BLUFOR', 'SL', 'leader', f.SL));
    m.enemies.forEach((e, i) => out.push(counter(10 + i, 'OPFOR', ENEMY_TEAMS[i], 'team', e)));
    return out.filter((c) => inside(m, hexAt(c.pos)));
  }

  // ---- changes, undo, saving ----

  let saveTimer = null;
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveDraft({ model: ed.model, id: ed.id, hubId: ed.hubId }), SAVE_DELAY_MS);
    hubSaveSoon();
  }

  // ---- the hub: drafts, playtest, publish ----

  // A still of the map for its card in the hub: BLUFOR and the objective, never OPFOR.
  const still = () => mapStill(renderMap(), toMapJson(ed.model, balance).units, balance);

  function setHubState(state, error = '') {
    ed.hubState = state;
    ed.hubError = error;
    renderHubState();
  }

  function renderHubState() {
    if (!ed.hub) return;
    const s = $('hubState');
    const text = { none: 'Ещё не в хабе', saving: 'Сохраняем…', saved: 'Черновик сохранён', unsaved: 'Есть несохранённое', error: 'Не сохранено' }[ed.hubState];
    s.textContent = text;
    s.title = ed.hubError || (ed.hubId ? 'Черновики видите только вы, пока не опубликуете.' : '«Сохранить черновик» сохранит карту в хабе.');
    s.className = ed.hubState === 'error' ? 'bad' : '';
  }

  // An open hub draft saves itself shortly after each change.
  let hubTimer = null;
  function hubSaveSoon() {
    if (!ed.hub || !ed.hubId) return;
    setHubState('unsaved');
    clearTimeout(hubTimer);
    hubTimer = setTimeout(() => saveToHub({ quiet: true }), HUB_SAVE_DELAY_MS);
  }

  // Saves go one after another, each with the map as it was when asked for.
  let hubQueue = Promise.resolve(true);
  function saveToHub({ quiet = false, thumb = false } = {}) {
    clearTimeout(hubTimer);
    const body = { name: ed.model.name, json: toMapJson(ed.model, balance) };
    const model = ed.model;
    hubQueue = hubQueue.then(async () => {
      setHubState('saving');
      try {
        if (thumb) body.thumb = await still();
        if (ed.hubId) await hub.save(ed.hubId, body);
        else ed.hubId = (await hub.create(body)).id;
        if (ed.model === model) saveDraft({ model: ed.model, id: ed.id, hubId: ed.hubId });
        setHubState(ed.model === model ? 'saved' : 'unsaved');
        if (!quiet) toast('Черновик сохранён в хабе. Пока вы его не опубликуете, его видите только вы.');
        return true;
      } catch (err) {
        if (err.status === 404 || err.status === 409) ed.hubId = null; // deleted or published elsewhere: this is a new map now
        setHubState('error', err.message);
        if (!quiet) toast(`Не удалось сохранить черновик: ${err.message}`, true);
        return false;
      }
    });
    return hubQueue;
  }

  function changed({ refit = false } = {}) {
    ed.version++;
    const size = `${ed.model.width}x${ed.model.height}`;
    if (size !== graphSize) {
      edgeGraph = graph(ed.model.width, ed.model.height);
      graphSize = size;
      refit = true;
    }
    gameMap = renderMap();
    counters = makeCounters();
    worldDirty = true;
    pendingFit ||= refit;
    renderPanel();
    saveSoon();
  }

  function remember(before = JSON.stringify(ed.model)) {
    ed.undo.push(before);
    if (ed.undo.length > HISTORY) ed.undo.shift();
    ed.redo = [];
  }

  // Run a change; it goes on the undo stack only when it changed something.
  function edit(fn, opts) {
    const before = JSON.stringify(ed.model);
    fn(ed.model);
    if (JSON.stringify(ed.model) === before) return false;
    remember(before);
    changed(opts);
    return true;
  }

  function undo() {
    if (!ed.undo.length) return;
    ed.redo.push(JSON.stringify(ed.model));
    ed.model = JSON.parse(ed.undo.pop());
    ed.chain = null;
    changed({ refit: true });
  }

  function redo() {
    if (!ed.redo.length) return;
    ed.undo.push(JSON.stringify(ed.model));
    ed.model = JSON.parse(ed.redo.pop());
    ed.chain = null;
    changed({ refit: true });
  }

  // Replace the whole map (new, opened, imported); undo brings the old one back.
  // hubId: the hub draft it is (opened from My drafts), else it is a new map as far as the hub goes.
  function replaceModel(model, id = null, hubId = null) {
    if (ed.hubState === 'unsaved' && ed.hubId) saveToHub({ quiet: true }); // the open draft's last changes first
    remember();
    ed.model = model;
    ed.id = id;
    ed.hubId = hubId;
    ed.chain = null;
    changed({ refit: true });
    clearTimeout(hubTimer); // a draft just opened is as the hub has it
    setHubState(hubId ? 'saved' : 'none');
  }

  let toastTimer = null;
  function toast(text, bad = false) {
    const t = $('toast');
    t.textContent = text;
    t.className = bad ? 'bad' : '';
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      t.hidden = true;
    }, TOAST_MS);
  }

  // ---- the panel ----

  const palette = $('palette');
  TERRAINS.forEach((t, i) => {
    const b = el('button', 'tile');
    b.dataset.terrain = t;
    b.title = `${LABELS[t]} (${TERRAIN_KEYS[i]})`;
    const sw = el('span', 'sw');
    sw.style.background = COLORS.terrain[t];
    b.append(sw, document.createTextNode(LABELS[t]), el('kbd', '', TERRAIN_KEYS[i]));
    b.onclick = () => pickTerrain(t);
    palette.append(b);
  });

  function pickTerrain(t) {
    ed.terrain = t;
    setTool('terrain');
  }

  function setTool(tool) {
    ed.tool = tool;
    ed.chain = null;
    renderPanel();
  }

  for (const b of document.querySelectorAll('.tool')) b.onclick = () => setTool(b.dataset.tool);

  $('mapName').oninput = () => {
    ed.model.name = $('mapName').value;
    document.title = `${ed.model.name || 'Без названия'} · Редактор карт · Fix and Flank`;
    saveSoon();
  };

  $('randomize').onclick = () => {
    edit((m) => randomize(m, 1 + Math.floor(Math.random() * 1e9)));
    toast('Новая случайная карта. Ctrl+Z вернёт прежнюю.');
  };
  $('undo').onclick = undo;
  $('redo').onclick = redo;

  const HELP = {
    terrain: () => `Рисуем: ${TERRAIN[ed.terrain].word}. Нажмите или проведите по гексам. Клавиши 1–8 выбирают местность. Правая кнопка или стрелки двигают вид, средняя кнопка или Q/E поворачивают, колесо — масштаб.`,
    wall: () => (ed.chain ? 'Нажмите на другой угол: стена пройдёт к нему по краям гексов. Правая кнопка или Esc — закончить. Повторная стена по тем же краям снимает её.' : 'Нажмите на угол гекса, чтобы начать стену.'),
    hedge: () => (ed.chain ? 'Нажмите на другой угол: изгородь пройдёт к нему по краям гексов. Правая кнопка или Esc — закончить. Повторная изгородь по тем же краям снимает её.' : 'Нажмите на угол гекса, чтобы начать изгородь.'),
    parapet: () => 'Нажмите у стороны гекса: бруствер встанет внутри гекса и прикроет эту сторону. Ещё одно нажатие снимает его.',
    erase: () => 'Нажмите или проведите по краям гексов, чтобы убрать стены, изгороди и брустверы.',
    start: () => 'Наведите туда, где начнёт отделение: ALPHA и BRAVO рядом, командир отделения позади. Нажмите, чтобы поставить.',
    objective: () => 'Нажмите на гекс объекта. Группа OPFOR, державшая прежний объект, перейдёт вместе с ним.',
    enemy: () => `Нажмите на гекс, чтобы поставить группу OPFOR (до ${ENEMY_TEAMS.length}); нажатие на группу убирает её.`,
  };

  function renderPanel() {
    const m = ed.model;
    for (const b of document.querySelectorAll('.tile')) b.classList.toggle('on', ed.tool === 'terrain' && b.dataset.terrain === ed.terrain);
    for (const b of document.querySelectorAll('.tool')) b.classList.toggle('on', b.dataset.tool === ed.tool);
    if (document.activeElement !== $('mapName')) $('mapName').value = m.name;
    $('undo').disabled = !ed.undo.length;
    $('redo').disabled = !ed.redo.length;
    $('help').textContent = HELP[ed.tool]();
    renderWhere();
    const issues = problems(m, balance);
    const check = $('check');
    check.className = issues.length ? 'bad' : 'ready';
    check.replaceChildren(el('i'), document.createTextNode(issues.length ? `${issues[0]}${issues.length > 1 ? ` (и ещё ${issues.length - 1})` : ''}` : 'Можно играть'));
    check.title = issues.join('\n');
    document.title = `${m.name || 'Без названия'} · Редактор карт · Fix and Flank`;
  }

  // ---- menu, play ----

  const menu = $('mapsMenu');
  function closeMenu() {
    menu.hidden = true;
    $('mapsBtn').setAttribute('aria-expanded', 'false');
  }
  function openMenu() {
    const item = (label, fn, note) => {
      const b = el('button', 'item', label);
      if (note) b.append(el('small', '', note));
      b.onclick = () => {
        closeMenu();
        fn();
      };
      return b;
    };
    if (ed.hub) {
      hubMenu(item);
      return;
    }
    const mine = listMaps();
    const rows = [
      item('Новая карта', () => replaceModel(newModel())),
      item('Сохранить в «Мои карты»', saveToLibrary, ed.id ? 'уже сохранялась' : ''),
      el('hr'),
      el('div', 'eyebrow', 'Мои карты'),
    ];
    if (!mine.length) rows.push(el('div', 'empty', 'Пока ничего нет. «Играть» или «Сохранить» кладут карту сюда.'));
    for (const s of mine) {
      const b = item(s.name, () => replaceModel(fromMapJson(loadMap(s.id)), s.id));
      const del = el('span', 'del', '×');
      del.title = 'Удалить из «Моих карт»';
      del.onclick = (e) => {
        e.stopPropagation();
        if (!confirm(`Удалить «${s.name}» из «Моих карт»?`)) return;
        deleteMap(s.id);
        if (ed.id === s.id) ed.id = null;
        openMenu();
      };
      b.append(del);
      rows.push(b);
    }
    rows.push(el('hr'), el('div', 'eyebrow', 'Начать с миссии'));
    for (const [file, name] of BUILT_IN) rows.push(item(name, async () => replaceModel(fromMapJson(await loadJson(`data/maps/${file}.json`)))));
    rows.push(el('hr'), item('Загрузить файл карты…', () => $('importFile').click(), '.json'), item('Выгрузить эту карту', exportJson, '.json'));
    menu.replaceChildren(...rows);
    menu.hidden = false;
    $('mapsBtn').setAttribute('aria-expanded', 'true');
  }
  // The Maps menu when the hub serves the editor: your drafts there and your published maps, not this browser's.
  function hubMenu(item) {
    const drafts = ed.hub.maps.filter((x) => x.status === 'draft');
    const published = ed.hub.maps.filter((x) => x.status === 'published');
    const rows = [
      item('Новая карта', () => replaceModel(newModel())),
      item('Сохранить черновик', () => saveToHub({ thumb: true }), ed.hubId ? 'в хабе' : 'ещё нет'),
      el('hr'),
      el('div', 'eyebrow', 'Мои черновики'),
    ];
    if (!drafts.length) rows.push(el('div', 'empty', 'Черновиков пока нет. «Сохранить черновик» сохранит карту в хабе, видимой только вам.'));
    for (const d of drafts) {
      const b = item(d.name, async () => {
        try {
          replaceModel(fromMapJson(await hub.load(d.id)), null, d.id);
        } catch (err) {
          toast(`Не удалось открыть черновик: ${err.message}`, true);
        }
      }, d.id === ed.hubId ? 'открыт' : '');
      const del = el('span', 'del', '×');
      del.title = 'Удалить черновик';
      del.onclick = async (e) => {
        e.stopPropagation();
        if (!confirm(`Удалить черновик «${d.name}»? Это нельзя отменить.`)) return;
        try {
          await hub.remove(d.id);
          if (ed.hubId === d.id) {
            ed.hubId = null;
            setHubState('none');
          }
          await refreshHubMaps();
          openMenu();
        } catch (err) {
          toast(`Не удалось удалить черновик: ${err.message}`, true);
        }
      };
      b.append(del);
      rows.push(b);
    }
    if (published.length) {
      rows.push(el('hr'), el('div', 'eyebrow', 'Опубликованные (не меняются)'));
      for (const p of published) rows.push(item(p.name, () => { location.href = hubMapPage(p.id); }, 'страница'));
    }
    rows.push(el('hr'), el('div', 'eyebrow', 'Начать с миссии'));
    for (const [file, name] of BUILT_IN) rows.push(item(name, async () => replaceModel(fromMapJson(await loadJson(`data/maps/${file}.json`)))));
    rows.push(el('hr'), item('Загрузить файл карты…', () => $('importFile').click(), '.json'), item('Выгрузить эту карту', exportJson, '.json'));
    menu.replaceChildren(...rows);
    menu.hidden = false;
    $('mapsBtn').setAttribute('aria-expanded', 'true');
  }

  async function refreshHubMaps() {
    try {
      ed.hub.maps = (await hub.mine()).maps;
    } catch {
      // keep the list we have
    }
  }

  $('mapsBtn').onclick = (e) => {
    e.stopPropagation();
    if (!menu.hidden) {
      closeMenu();
      return;
    }
    openMenu();
    if (ed.hub) refreshHubMaps().then(() => !menu.hidden && openMenu());
  };
  document.addEventListener('click', (e) => {
    if (!menu.hidden && !menu.contains(e.target)) closeMenu();
  });

  function saveToLibrary() {
    const id = saveMap(toMapJson(ed.model, balance), ed.id);
    if (!id) {
      toast('Не удалось сохранить: этот браузер не даёт сайту хранить данные.', true);
      return null;
    }
    ed.id = id;
    saveDraft({ model: ed.model, id });
    toast(`«${ed.model.name || 'Без названия'}» сохранена в «Мои карты».`);
    return id;
  }

  function exportJson() {
    const json = toMapJson(ed.model, balance);
    const blob = new Blob([`${JSON.stringify(json, null, 2)}\n`], { type: 'application/json' });
    const a = el('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(json.name || 'map').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'map'}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  $('importFile').onchange = async () => {
    const file = $('importFile').files[0];
    $('importFile').value = '';
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      parseMap(json, balance); // a map the game can read, or an error saying why not
      replaceModel(fromMapJson(json));
      toast(`Загружена «${json.name ?? file.name}».`);
    } catch (err) {
      toast(`Это не файл карты: ${err.message}`, true);
    }
  };

  // Hub: play your own draft (saved first); playtests aren't recorded.
  $('playtest').onclick = async () => {
    const issues = problems(ed.model, balance);
    if (issues.length) {
      toast(issues.join(' '), true);
      return;
    }
    if (!(await saveToHub({ quiet: true, thumb: true }))) {
      toast(`Не удалось сохранить черновик: ${ed.hubError}`, true);
      return;
    }
    location.href = `index.html?${new URLSearchParams({ src: hubSrc(ed.hubId), playtest: '1' })}`;
  };

  // Hub: put the map up for everyone, locked for good, then go to its page.
  $('publish').onclick = async () => {
    const issues = problems(ed.model, balance);
    const name = ed.model.name.trim();
    if (issues.length || !name) {
      toast(issues.length ? issues.join(' ') : 'Сначала дайте карте название.', true);
      return;
    }
    if (!confirm(`Опубликовать «${name}»?\n\nКарта станет доступна всем в хабе. Опубликованную карту больше нельзя менять — так прохождения и рекорды остаются сравнимыми.`)) return;
    $('publish').disabled = true;
    try {
      if (!ed.hubId && !(await saveToHub({ quiet: true }))) throw new Error(ed.hubError);
      await hubQueue;
      const id = ed.hubId;
      await hub.publish(id, { name, json: toMapJson(ed.model, balance), thumb: await still() });
      clearTimeout(saveTimer);
      clearTimeout(hubTimer);
      saveDraft({ model: newModel(), id: null, hubId: null }); // back in the editor: a new map
      location.href = hubMapPage(id);
    } catch (err) {
      toast(`Не удалось опубликовать: ${err.message}`, true);
      $('publish').disabled = false;
    }
  };

  $('saveDraft').onclick = () => saveToHub({ thumb: true });

  $('play').onclick = () => {
    const issues = problems(ed.model, balance);
    if (issues.length) {
      toast(issues.join(' '), true);
      return;
    }
    const id = saveToLibrary();
    if (!id) return;
    location.href = `index.html?map=${encodeURIComponent(LOCAL + id)}`;
  };

  // ---- map controls ----

  function freeArea(width) {
    const box = (id) => $(id).getBoundingClientRect();
    const stage = box('stage');
    const pad = {
      left: box('tools').right - stage.left + FIT_GAP,
      right: stage.right - box('hud').left + FIT_GAP,
      top: FIT_GAP,
      bottom: stage.bottom - box('dock').top + FIT_GAP,
    };
    return pad.left + pad.right > width / 2 ? { left: 0, right: 0, top: 0, bottom: 0 } : pad;
  }
  function fit() {
    const { clientWidth: width, clientHeight: height } = canvas;
    cam.fit(width, height, freeArea(width));
  }
  const zoomCenter = (factor) => {
    const { clientWidth: width, clientHeight: height } = canvas;
    const pad = freeArea(width);
    cam.zoomAt(pad.left + (width - pad.left - pad.right) / 2, pad.top + (height - pad.top - pad.bottom) / 2, factor);
  };
  $('zoomIn').onclick = () => zoomCenter(WHEEL_ZOOM * WHEEL_ZOOM);
  $('zoomOut').onclick = () => zoomCenter(1 / (WHEEL_ZOOM * WHEEL_ZOOM));
  $('fitBtn').onclick = fit;
  $('turnLeft').onclick = () => cam.turn(-1);
  $('turnRight').onclick = () => cam.turn(1);
  window.addEventListener('resize', fit);

  // ---- tools on the board ----


  // The side of hex h nearest point p.
  function sideAt(h, p) {
    const pts = corners(h);
    let best = 0;
    let bestD = Infinity;
    pts.forEach((a, i) => {
      const b = pts[(i + 1) % 6];
      const d = Math.hypot((a.x + b.x) / 2 - p.x, (a.y + b.y) / 2 - p.y);
      if (d < bestD) {
        best = i;
        bestD = d;
      }
    });
    return SIDES[best];
  }

  function hoverAt(p) {
    const hex = hexAt(p);
    return {
      p,
      hex: inside(ed.model, hex) ? hex : null,
      vertex: nearestVertex(edgeGraph, p, REACH.vertex),
      edge: nearestEdge(edgeGraph, p, REACH.edge),
      side: inside(ed.model, hex) ? sideAt(hex, p) : null,
      start: startNear(ed.model, p), // where the start tool would put the squad
    };
  }

  // Dragging tools: paint or erase at a point.
  function strokeAt(p) {
    const m = ed.model;
    if (ed.tool === 'terrain') {
      const hex = hexAt(p);
      return inside(m, hex) && paint(m, [hex], ed.terrain);
    }
    if (ed.tool === 'erase') {
      const e = nearestEdge(edgeGraph, p, REACH.edge);
      return !!e && eraseEdge(m, e);
    }
    return false;
  }

  // Click tools.
  function clickAt(p) {
    const h = hoverAt(p);
    const m = ed.model;
    switch (ed.tool) {
      case 'wall':
      case 'hedge': {
        if (!h.vertex) return;
        if (!ed.chain) {
          ed.chain = h.vertex.key;
        } else if (h.vertex.key === ed.chain) {
          ed.chain = null;
        } else {
          const path = edgePath(edgeGraph, ed.chain, h.vertex.key);
          let result = null;
          if (path?.length) edit((mm) => { result = drawEdges(mm, path, ed.tool); });
          if (result === 'removed') toast(`${ed.tool === 'wall' ? 'Стена снята' : 'Изгородь снята'}.`);
          ed.chain = h.vertex.key;
        }
        renderPanel();
        return;
      }
      case 'parapet':
        if (h.hex) edit((mm) => toggleParapet(mm, h.hex, h.side));
        return;
      case 'start': {
        if (!h.start) return;
        const squad = Object.values(formation(h.start));
        if (m.enemies.some((e) => squad.some((x) => x.col === e.col && x.row === e.row))) toast('Там стоит группа OPFOR.', true);
        else edit((mm) => { mm.start = { ...h.start }; });
        return;
      }
      case 'objective':
        if (h.hex) edit((mm) => moveObjective(mm, h.hex));
        return;
      case 'enemy': {
        if (!h.hex) return;
        let r = null;
        edit((mm) => { r = toggleEnemy(mm, h.hex); });
        if (r === 'full') toast(`Не больше ${ENEMY_TEAMS.length} групп OPFOR.`, true);
        return;
      }
      default:
    }
  }

  // ---- input ----

  let drag = null;
  const local = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    const s = local(e);
    drag = { x: s.x, y: s.y, sx: s.x, sy: s.y, button: e.button, moved: false, stroke: null };
    if (e.button === 0 && (ed.tool === 'terrain' || ed.tool === 'erase')) {
      const p = cam.toWorld(s.x, s.y);
      drag.stroke = { before: JSON.stringify(ed.model), last: p, changed: strokeAt(p) };
      if (drag.stroke.changed) changedLive();
    }
  });
  // While a stroke goes on, redraw without filling the undo stack; the stroke is one undo step.
  function changedLive() {
    ed.version++;
    gameMap = renderMap();
    counters = makeCounters();
    worldDirty = true;
    renderWhere();
  }
  // The hex under the pointer and its terrain, by the help line; again after an edit, which may have repainted it.
  function renderWhere() {
    const hex = ed.hover?.hex;
    $('where').textContent = hex && inside(ed.model, hex) ? `${hex.col},${hex.row} · ${LABELS[terrainAt(ed.model, hex)]}` : '';
  }
  canvas.addEventListener('pointermove', (e) => {
    const s = local(e);
    const p = cam.toWorld(s.x, s.y);
    ed.hover = hoverAt(p);
    renderWhere();
    if (!drag) return;
    if (drag.stroke) {
      // Sample along the drag so a fast stroke leaves no gaps.
      const a = drag.stroke.last;
      const n = Math.max(1, Math.ceil(Math.hypot(p.x - a.x, p.y - a.y) / STROKE_STEP));
      let any = false;
      for (let i = 1; i <= n; i++) any = strokeAt({ x: a.x + ((p.x - a.x) * i) / n, y: a.y + ((p.y - a.y) * i) / n }) || any;
      drag.stroke.last = p;
      if (any) {
        drag.stroke.changed = true;
        changedLive();
      }
      return;
    }
    const dx = s.x - drag.x;
    const dy = s.y - drag.y;
    if (!drag.moved && Math.hypot(s.x - drag.sx, s.y - drag.sy) <= CLICK_SLOP_PX) return;
    drag.moved = true;
    if (drag.button === 1) cam.orbit(dx, dy); // middle drag turns the view
    else if (drag.button !== 0) cam.panBy(dx, dy);
    drag.x = s.x;
    drag.y = s.y;
  });
  canvas.addEventListener('pointerup', (e) => {
    const d = drag;
    drag = null;
    if (!d) return;
    if (d.stroke) {
      if (d.stroke.changed) {
        remember(d.stroke.before);
        changed();
      }
      return;
    }
    if (d.moved) return;
    if (d.button === 2) {
      ed.chain = null; // right click: stop drawing
      renderPanel();
      return;
    }
    if (d.button === 0) {
      const s = local(e);
      clickAt(cam.toWorld(s.x, s.y));
    }
  });
  canvas.addEventListener('pointerleave', () => {
    ed.hover = null;
    renderWhere();
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const s = local(e);
    cam.zoomAt(s.x, s.y, e.deltaY < 0 ? WHEEL_ZOOM : 1 / WHEEL_ZOOM);
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && !typing) {
      if (k === 'z' && !e.shiftKey) undo();
      else if (k === 'y' || (k === 'z' && e.shiftKey)) redo();
      else if (k === 's') {
        if (ed.hub) saveToHub({ thumb: true });
        else saveToLibrary();
      }
      else return;
      e.preventDefault();
      return;
    }
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (k === 'escape') {
      ed.chain = null;
      closeMenu();
      renderPanel();
    } else if (TERRAIN_KEYS.includes(k)) pickTerrain(TERRAINS[TERRAIN_KEYS.indexOf(k)]);
    else if (TOOL_KEYS[k]) setTool(TOOL_KEYS[k]);
    else if (k === 'r') $('randomize').click();
    else if (k === 'home' || k === '0') fit();
    else if (k === 'q' || k === 'e') cam.turn(k === 'q' ? -1 : 1);
    else if (ARROWS[e.key]) cam.panBy(...ARROWS[e.key]);
    else return;
    e.preventDefault();
  });

  // ---- drawing ----

  // Marks over the map: the start, and what the tool under the pointer would do.
  // The same code draws on the flat map and on the 3D ground.
  function paintMarks(ctx, c) {
    const m = ed.model;
    const P = (pt) => toScreen(c, pt.x, pt.y);
    const seg = (a, b, color, width, dash = null) => {
      for (const [ink, w] of [[INK.under, width + 3], [color, width]]) {
        ctx.strokeStyle = ink;
        ctx.lineWidth = w;
        ctx.lineCap = 'round';
        ctx.setLineDash(dash ?? []);
        ctx.beginPath();
        ctx.moveTo(P(a).x, P(a).y);
        ctx.lineTo(P(b).x, P(b).y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.lineCap = 'butt';
    };
    const dot = (pt, r, fill, ring = null) => {
      const s = P(pt);
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (ring) {
        ctx.strokeStyle = ring;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
    };
    const outline = (hexes, color, width = 2.5, dashed = false) => {
      drawHexMarks(ctx, c, hexes.map((hex) => ({ hex, color: INK.under, width: width + 3, inset: 0.04, dashed })));
      drawHexMarks(ctx, c, hexes.map((hex) => ({ hex, color, width, inset: 0.04, dashed })));
    };

    // The squad's three hexes, each with who starts there.
    const squad = (start, width, dashed) => {
      const f = formation(start);
      outline(Object.values(f).filter((x) => inside(m, x)), INK.start, width, dashed);
      ctx.font = `700 ${Math.round(c.scale * SQUAD_LABEL)}px Roboto, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      for (const [who, hex] of Object.entries({ A: f.ALPHA, B: f.BRAVO, SL: f.SL })) {
        const s = P(center(hex));
        ctx.lineWidth = 6;
        ctx.strokeStyle = INK.under;
        ctx.strokeText(who, s.x, s.y);
        ctx.fillStyle = INK.label;
        ctx.fillText(who, s.x, s.y);
      }
    };
    const h = ed.hover;
    if (ed.tool === 'start' && h?.start) squad(h.start, 3, false);
    else outline(Object.values(formation(m.start)).filter((x) => inside(m, x)), INK.start, 2.5, true);
    if (!h) return;
    switch (ed.tool) {
      case 'terrain':
        if (h.hex && inside(m, h.hex)) outline([h.hex], INK.brush, 2);
        break;
      case 'objective':
      case 'enemy':
        if (h.hex) outline([h.hex], INK[ed.tool], 3);
        break;
      case 'wall':
      case 'hedge': {
        for (const v of edgeGraph.vertices.values()) {
          if (Math.hypot(v.x - h.p.x, v.y - h.p.y) < NEAR_CORNERS) dot(v, 2.5, INK.corner);
        }
        const from = ed.chain && edgeGraph.vertices.get(ed.chain);
        if (from && h.vertex && h.vertex.key !== ed.chain) {
          const path = edgePath(edgeGraph, ed.chain, h.vertex.key) ?? [];
          const removing = path.length && path.every((k) => m.edges[k] === ed.tool);
          for (const k of path) {
            const e = edgeGraph.edges.get(k);
            seg(e.a, e.b, removing ? INK.remove : INK[ed.tool], 5, removing ? [6, 6] : null);
          }
        }
        if (from) dot(from, 6, INK.objective);
        if (h.vertex) dot(h.vertex, 7, null, INK.objective);
        break;
      }
      case 'parapet':
        if (h.hex) {
          const i = SIDES.indexOf(h.side);
          const pts = corners(h.hex);
          const cc = center(h.hex);
          const inset = (pt) => ({ x: pt.x + (cc.x - pt.x) * 0.12, y: pt.y + (cc.y - pt.y) * 0.12 });
          const on = m.parapets.includes(`${h.hex.col},${h.hex.row},${h.side}`);
          seg(inset(pts[i]), inset(pts[(i + 1) % 6]), on ? INK.remove : INK.parapet, 5, on ? [6, 6] : null);
        }
        break;
      case 'erase':
        if (h.edge) seg(h.edge.a, h.edge.b, INK.remove, 5);
        break;
      default:
    }
  }

  const marksSig = () => {
    const h = ed.hover;
    return [ed.version, ed.tool, ed.terrain, ed.chain, h?.hex && `${h.hex.col},${h.hex.row}`, h?.vertex?.key, h?.edge?.key, h?.side, h?.start && `${h.start.col},${h.start.row}`].join('|');
  };

  function frame(now) {
    try {
      if (worldDirty) {
        world.setMap(gameMap);
        worldDirty = false;
      }
      if (pendingFit) {
        pendingFit = false;
        fit();
      }
      world.render(now, { counters, rosterOf, bangs: [], shots: [], sig: marksSig(), paint: paintMarks });
    } catch (err) {
      console.error(err);
      $('status').textContent = `Ошибка отображения: ${err.message}`;
    }
    requestAnimationFrame(frame);
  }

  // Served by the hub: its buttons instead of Play, and the brand leads back to the game's page there.
  if (ed.hub) {
    for (const id of ['hubState', 'saveDraft', 'playtest', 'publish']) $(id).hidden = false;
    $('play').hidden = true;
    const brand = document.querySelector('.brand');
    brand.classList.add('home');
    brand.title = 'Fix & Flank в хабе';
    brand.onclick = () => {
      location.href = hubHome;
    };
    renderHubState();
    if (ed.hubState === 'unsaved') saveToHub({ quiet: true });
  } else if (hubLink?.error) {
    toast(`Карты хранятся в этом браузере: ${hubLink.error}`, true);
  }

  renderPanel();
  fit();
  requestAnimationFrame(frame);
  window.editor = { ed, balance, cam, world, renderMap, toMapJson: () => toMapJson(ed.model, balance), clone }; // for debugging in the console
}

main().catch((err) => {
  console.error(err);
  document.getElementById('status').textContent = `Ошибка: ${err.message}`;
});
