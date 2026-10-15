// The map editor (editor.html): paint terrain, draw walls and hedges along hex
// edges corner to corner, put parapets on hex sides, place the BLUFOR start,
// the objective and OPFOR teams, then play the map. The map and its rules are
// in model.js; this file draws it (in 3D, render/world3d.js) and
// takes input. The draft is kept in the browser (store.js) as you go.

import { toScreen } from '../render/camera.js';
import { COLORS, drawHexMarks } from '../render/hexmap.js';
import { createWorld } from '../render/world3d.js';
import { center, corners, hexAt, neighbors, SIDES } from '../sim/hex.js';
import { parseMap } from '../sim/map.js';
import { unitType } from '../sim/state.js';
import {
  ENEMY_TEAMS, SIZE, TERRAINS, clone, defaultBrief, deployment, drawEdges, edgePath, eraseEdge, fromMapJson, graph,
  inside, moveObjective, nearestEdge, nearestVertex, newModel, paint, problems, randomize, resize, terrainAt, toggleEnemy,
  toggleParapet, toMapJson,
} from './model.js';
import { LOCAL, deleteMap, listMaps, loadDraft, loadMap, saveDraft, saveMap } from './store.js';

const WHEEL_ZOOM = 1.15;
const CLICK_SLOP_PX = 4;
const FIT_GAP = 16;
const HISTORY = 100;                        // undo steps kept
const REACH = { vertex: 0.42, edge: 0.45 }; // world units: how near a corner or an edge the pointer must be
const NEAR_CORNERS = 3.2;                   // corners shown within this many world units of the pointer
const STROKE_STEP = 0.35;                   // world units between brush samples along a drag
const SAVE_DELAY_MS = 400;
const TOAST_MS = 2600;
const BUILT_IN = [['trenchline', 'Mission 1: Trench Line'], ['training', 'Training ground']];
const TERRAIN_KEYS = '12345678';
const TOOL_KEYS = { w: 'wall', h: 'hedge', p: 'parapet', x: 'erase', b: 'start', o: 'objective', f: 'enemy' };
const INK = {
  start: '#5996dc', objective: '#f4db50', enemy: '#e25a55', brush: '#ffffff', under: 'rgba(13, 15, 17, 0.7)',
  wall: '#f3eee2', hedge: '#8fe36b', remove: '#f26f63', parapet: '#e8c77e', corner: 'rgba(255, 255, 255, 0.75)',
};
const LABELS = { open: 'Grass', road: 'Road', scrub: 'Scrub', woods: 'Woods', rubble: 'Rubble', building: 'Building', trench: 'Trench', water: 'Water' };

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

// A map by its ?map= name: a built-in file or one saved in this browser.
async function openNamed(name) {
  if (name.startsWith(LOCAL)) {
    const json = loadMap(name.slice(LOCAL.length));
    if (!json) throw new Error(`Map "${name.slice(LOCAL.length)}" is not saved in this browser`);
    return json;
  }
  return loadJson(`data/maps/${encodeURIComponent(name)}.json`);
}

async function main() {
  const balance = await loadJson('data/balance.json');
  const params = new URLSearchParams(location.search);

  const ed = {
    model: null,
    id: null,          // where it is saved in My maps, once it is
    tool: 'terrain',
    terrain: 'woods',
    brush: 1,
    chain: null,       // wall or hedge being drawn: the corner it has got to
    hover: null,       // { p, hex, vertex, edge, side }
    undo: [],
    redo: [],
    version: 0,        // bumped on every change, for the 3D marks layer
  };

  // The map to start from: ?map= (from the game's Edit button), else the draft, else a new one.
  const draft = loadDraft();
  const wanted = params.get('map');
  if (wanted) {
    if (draft?.model && !draft.id) saveMap(toMapJson(draft.model, balance)); // don't lose an unsaved draft
    ed.model = fromMapJson(await openNamed(wanted));
    ed.id = wanted.startsWith(LOCAL) ? wanted.slice(LOCAL.length) : null;
    params.delete('map');
    history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}`);
  } else if (draft?.model) {
    ed.model = draft.model;
    delete ed.model.turns; // drafts saved while maps still had a turn limit
    ed.id = draft.id ?? null;
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
    const counter = (id, side, team, kind, hex, stacked = false) => ({
      unit: { id, side, team, kind, type: null, soldiers: [...unitType(balance, { kind, type: null }).roles], status: 'ok', activated: false, exposed: false, moved: false },
      pos: center(hex), selected: false, ghost: false, stackedWithTeam: stacked,
    });
    const d = deployment(m, balance);
    if (d) out.push(counter(0, 'BLUFOR', 'ALPHA', 'team', d.ALPHA), counter(1, 'BLUFOR', 'BRAVO', 'team', d.BRAVO));
    else if (inside(m, m.start)) out.push(counter(0, 'BLUFOR', 'ALPHA', 'team', m.start));
    m.enemies.forEach((e, i) => out.push(counter(10 + i, 'OPFOR', ENEMY_TEAMS[i], 'team', e)));
    if (d) out.push(counter(2, 'BLUFOR', 'SL', 'leader', d.SL, true)); // last: drawn on top
    return out;
  }

  // ---- changes, undo, saving ----

  let saveTimer = null;
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveDraft({ model: ed.model, id: ed.id }), SAVE_DELAY_MS);
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
  function replaceModel(model, id = null) {
    remember();
    ed.model = model;
    ed.id = id;
    ed.chain = null;
    changed({ refit: true });
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
  for (const b of document.querySelectorAll('#brush button')) {
    b.onclick = () => {
      ed.brush = Number(b.dataset.brush);
      renderPanel();
    };
  }

  // Width and height: steppers with a number field.
  const limits = { width: [SIZE.min, SIZE.max], height: [SIZE.min, SIZE.max] };
  function setNumber(field, value) {
    const [lo, hi] = limits[field];
    const v = Math.max(lo, Math.min(hi, Math.round(value)));
    if (!Number.isFinite(v)) return;
    edit((m) => resize(m, field === 'width' ? v : m.width, field === 'height' ? v : m.height), { refit: true });
    renderPanel();
  }
  for (const s of document.querySelectorAll('.stepper')) {
    const field = s.dataset.field;
    for (const b of s.querySelectorAll('button')) b.onclick = () => setNumber(field, ed.model[field] + Number(b.dataset.step));
    const input = s.querySelector('input');
    input.min = limits[field][0];
    input.max = limits[field][1];
    input.onchange = () => setNumber(field, Number(input.value));
  }

  $('mapName').oninput = () => {
    ed.model.name = $('mapName').value;
    document.title = `${ed.model.name || 'Untitled'} · Map editor · Fix and Flank`;
    saveSoon();
  };
  $('brief').onchange = () => edit((m) => { m.brief = $('brief').value.trim(); });

  $('randomize').onclick = () => {
    edit((m) => randomize(m, 1 + Math.floor(Math.random() * 1e9)));
    toast('New random terrain. Ctrl+Z brings the old one back.');
  };
  $('fill').onclick = () => {
    const all = [];
    for (let row = 0; row < ed.model.height; row++) for (let col = 0; col < ed.model.width; col++) all.push({ col, row });
    edit((m) => paint(m, all, ed.terrain));
  };
  $('undo').onclick = undo;
  $('redo').onclick = redo;

  const HELP = {
    terrain: () => `Paint ${LABELS[ed.terrain].toLowerCase()}: click or drag over hexes. Keys 1–8 pick terrain. Right drag pans, middle drag or Q/E turns, wheel zooms.`,
    wall: () => (ed.chain ? 'Click another corner: the wall runs along the hex edges to it. Right click or Esc to stop. Drawing over a wall takes it off.' : 'Click a hex corner to start a wall.'),
    hedge: () => (ed.chain ? 'Click another corner: the hedge runs along the hex edges to it. Right click or Esc to stop. Drawing over a hedge takes it off.' : 'Click a hex corner to start a hedge.'),
    parapet: () => 'Click near a side of a hex: a parapet just inside it, covering that side. Click again to take it off.',
    erase: () => 'Click or drag over hex edges to clear their walls, hedges and parapets.',
    start: () => 'Click a hex: ALPHA and the squad leader start there, BRAVO beside them.',
    objective: () => 'Click a hex for the objective. An OPFOR team holding the old one moves with it.',
    enemy: () => `Click a hex to place an OPFOR fireteam (up to ${ENEMY_TEAMS.length}); click one to remove it.`,
  };

  function renderPanel() {
    const m = ed.model;
    for (const b of document.querySelectorAll('.tile')) b.classList.toggle('on', ed.tool === 'terrain' && b.dataset.terrain === ed.terrain);
    for (const b of document.querySelectorAll('.tool')) b.classList.toggle('on', b.dataset.tool === ed.tool);
    for (const b of document.querySelectorAll('#brush button')) b.classList.toggle('on', Number(b.dataset.brush) === ed.brush);
    for (const f of ['width', 'height']) if (document.activeElement !== $(f)) $(f).value = m[f];
    if (document.activeElement !== $('mapName')) $('mapName').value = m.name;
    if (document.activeElement !== $('brief')) $('brief').value = m.brief;
    $('brief').placeholder = defaultBrief(m);
    $('undo').disabled = !ed.undo.length;
    $('redo').disabled = !ed.redo.length;
    $('help').textContent = HELP[ed.tool]();
    const issues = problems(m, balance);
    const check = $('check');
    check.className = issues.length ? 'bad' : 'ready';
    check.replaceChildren(el('i'), document.createTextNode(issues.length ? `${issues[0]}${issues.length > 1 ? ` (+${issues.length - 1} more)` : ''}` : 'Ready to play'));
    check.title = issues.join('\n');
    document.title = `${m.name || 'Untitled'} · Map editor · Fix and Flank`;
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
    const mine = listMaps();
    const rows = [
      item('New map', () => replaceModel(newModel())),
      item('Save to My maps', saveToLibrary, ed.id ? 'saved before' : ''),
      el('hr'),
      el('div', 'eyebrow', 'My maps'),
    ];
    if (!mine.length) rows.push(el('div', 'empty', 'Nothing saved yet. Play or Save puts the map here.'));
    for (const s of mine) {
      const b = item(s.name, () => replaceModel(fromMapJson(loadMap(s.id)), s.id), s.size);
      const del = el('span', 'del', '×');
      del.title = 'Delete from My maps';
      del.onclick = (e) => {
        e.stopPropagation();
        if (!confirm(`Delete "${s.name}" from My maps?`)) return;
        deleteMap(s.id);
        if (ed.id === s.id) ed.id = null;
        openMenu();
      };
      b.append(del);
      rows.push(b);
    }
    rows.push(el('hr'), el('div', 'eyebrow', 'Start from a mission'));
    for (const [file, name] of BUILT_IN) rows.push(item(name, async () => replaceModel(fromMapJson(await loadJson(`data/maps/${file}.json`)))));
    rows.push(el('hr'), item('Import a map file…', () => $('importFile').click(), '.json'), item('Export this map', exportJson, '.json'));
    menu.replaceChildren(...rows);
    menu.hidden = false;
    $('mapsBtn').setAttribute('aria-expanded', 'true');
  }
  $('mapsBtn').onclick = (e) => {
    e.stopPropagation();
    if (menu.hidden) openMenu();
    else closeMenu();
  };
  document.addEventListener('click', (e) => {
    if (!menu.hidden && !menu.contains(e.target)) closeMenu();
  });

  function saveToLibrary() {
    const id = saveMap(toMapJson(ed.model, balance), ed.id);
    if (!id) {
      toast('Could not save: this browser blocks site storage.', true);
      return null;
    }
    ed.id = id;
    saveDraft({ model: ed.model, id });
    toast(`Saved "${ed.model.name || 'Untitled'}" to My maps.`);
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
      toast(`Imported "${json.name ?? file.name}".`);
    } catch (err) {
      toast(`Not a map file: ${err.message}`, true);
    }
  };

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

  const brushHexes = (hex) => (ed.brush > 1 ? [hex, ...neighbors(hex)] : [hex]);

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
    };
  }

  // Dragging tools: paint or erase at a point.
  function strokeAt(p) {
    const m = ed.model;
    if (ed.tool === 'terrain') {
      const hex = hexAt(p);
      return inside(m, hex) && paint(m, brushHexes(hex), ed.terrain);
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
          if (result === 'removed') toast(`${ed.tool === 'wall' ? 'Wall' : 'Hedge'} taken off.`);
          ed.chain = h.vertex.key;
        }
        renderPanel();
        return;
      }
      case 'parapet':
        if (h.hex) edit((mm) => toggleParapet(mm, h.hex, h.side));
        return;
      case 'start':
        if (!h.hex) return;
        if (m.enemies.some((e) => e.col === h.hex.col && e.row === h.hex.row)) toast('An OPFOR team stands there.', true);
        else edit((mm) => { mm.start = { ...h.hex }; });
        return;
      case 'objective':
        if (h.hex) edit((mm) => moveObjective(mm, h.hex));
        return;
      case 'enemy': {
        if (!h.hex) return;
        let r = null;
        edit((mm) => { r = toggleEnemy(mm, h.hex); });
        if (r === 'full') toast(`Up to ${ENEMY_TEAMS.length} OPFOR teams.`, true);
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
  }
  canvas.addEventListener('pointermove', (e) => {
    const s = local(e);
    const p = cam.toWorld(s.x, s.y);
    ed.hover = hoverAt(p);
    $('where').textContent = ed.hover.hex ? `${ed.hover.hex.col},${ed.hover.hex.row} · ${LABELS[terrainAt(ed.model, ed.hover.hex)]}` : '';
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
    $('where').textContent = '';
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
      else if (k === 's') saveToLibrary();
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

    if (inside(m, m.start)) outline([m.start], INK.start, 2.5, true);
    const h = ed.hover;
    if (!h) return;
    switch (ed.tool) {
      case 'terrain':
        if (h.hex) outline(brushHexes(h.hex).filter((x) => inside(m, x)), INK.brush, 2);
        break;
      case 'start':
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
    return [ed.version, ed.tool, ed.terrain, ed.brush, ed.chain, h?.hex && `${h.hex.col},${h.hex.row}`, h?.vertex?.key, h?.edge?.key, h?.side].join('|');
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
      $('status').textContent = `Display error: ${err.message}`;
    }
    requestAnimationFrame(frame);
  }

  renderPanel();
  fit();
  requestAnimationFrame(frame);
  window.editor = { ed, balance, cam, world, renderMap, toMapJson: () => toMapJson(ed.model, balance), clone }; // for debugging in the console
}

main().catch((err) => {
  console.error(err);
  document.getElementById('status').textContent = `Error: ${err.message}`;
});
