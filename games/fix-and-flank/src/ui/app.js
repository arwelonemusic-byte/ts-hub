// Browser UI: in each of BLUFOR's phases give every unit an order, see each
// preview, commit them all. The sim is only touched through planning helpers
// (moveOptions, projectOrders, checkPlan) and commitOrders. OPFOR's orders
// come from src/ai.

import { moveOptions, validateAction } from '../sim/actions.js';
import { assaultVia } from '../sim/assault.js';
import { center, distance, hexAt, key, neighbors, same } from '../sim/hex.js';
import { visibleFrom } from '../sim/los.js';
import { inBounds, terrainName, terrainOf } from '../sim/map.js';
import { fireDice } from '../sim/combat.js';
import { checkPlan, commitOrders, projectOrders } from '../sim/orders.js';
import { createRng } from '../sim/rng.js';
import { knownEnemies } from '../sim/spotting.js';
import { canActivate, currentPhase, unitType, unitsAt } from '../sim/state.js';
import { chooseOrders } from '../ai/basic.js';
import { commitTurn, RUN_LIMITS } from '../ai/run.js';
import { COLORS, counterLabel, drawFire, drawHexMarks, drawSuspected } from '../render/hexmap.js';
import { createWorld } from '../render/world3d.js';
import { hub, hubHome, hubIdOf, hubMapPage, servedByHub } from '../hub.js';
import { positionAlong } from './anim.js';
import { createDiceTray } from './dice.js';
import { assaultFigures, assaultSummary, eventText, fireFigures, fireSummary, phaseLabel, previewAction, rallyPreview, unitName } from './describe.js';
import { agree, diceText, FEATURE, menText, ROLE, sideName, statusText, TERRAIN, turnsText, typeName, unitName as shortName } from '../text.js';

const PLAYER_SIDE = 'BLUFOR';
// Pointer cursors over the board: a scope (fire) and an arrow onto a hex (move), hotspot where they point.
const svgCursor = (svg, x, y, fallback) => `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${x} ${y}, ${fallback}`;
const CURSOR = {
  scope: svgCursor(`<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><g fill='none' stroke-linecap='round'><g stroke='#0d0f11' stroke-width='4.5'><circle cx='16' cy='16' r='9'/><path d='M16 2v8M16 22v8M2 16h8M22 16h8'/></g><g stroke='#ffffff' stroke-width='2'><circle cx='16' cy='16' r='9'/><path d='M16 2v8M16 22v8M2 16h8M22 16h8'/></g></g><circle cx='16' cy='16' r='2' fill='#ff5a4f' stroke='#0d0f11' stroke-width='1'/></svg>`, 16, 16, 'crosshair'),
  move: svgCursor(`<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><g fill='none' stroke-linecap='round' stroke-linejoin='round'><g stroke='#0d0f11' stroke-width='4.5'><path d='M16 2v12M11 9.5l5 5 5-5'/><path d='M16 18.5l5.6 3.2v6.4L16 31.3l-5.6-3.2v-6.4z'/></g><g stroke='#ffffff' stroke-width='2'><path d='M16 2v12M11 9.5l5 5 5-5'/><path d='M16 18.5l5.6 3.2v6.4L16 31.3l-5.6-3.2v-6.4z'/></g></g></svg>`, 16, 25, 'pointer'),
};
const CLICK_SLOP_PX = 4;
const ARROW_PAN_PX = 140;   // an arrow key pans the view this far
const TIP_OFFSET = { x: 14, y: 18 }; // px from the pointer to the "click to select" tag
const WHEEL_ZOOM = 1.15;
const MOVE_ANIM_MS = 220;   // per hex
const DICE_ROLL_MS = 1100;  // dice tumble this long before they settle
const DICE_STAGGER_MS = 350; // a second row (casualty rolls, the defender) settles this much later
const DICE_HOLD_MS = 2400;  // the settled roll stays on screen this long (user requests 2026-10-15: long enough to read)
const RALLY_ROLL_MS = 700;
const RALLY_HOLD_MS = 1500;
const BANG_MS = 900;        // a bang marker's life
const COMMENT_MAX = 2000;   // the hub's limit for a comment on a map (FNF_COMMENT_MAX)
const STEP_GAP_MS = 120;    // between steps without moves
const AI_DELAY_MS = 450;    // pause before OPFOR commits, so it can be followed
const REPLAY_PAUSE_MS = 900; // «Повтор»: pause before the player's next recorded commit
const FIT_GAP = 16;          // px between the fitted map and the floating panels
const HINT_ROOM = 48;        // px kept clear above the action bar (the dice tray rises there)
const TERRAIN_NOTES = {
  open: 'Открытая местность', road: 'Полевая дорога', scrub: 'Кустарник и бурьян', woods: 'Лесной массив',
  rubble: 'Разрушенные постройки', building: 'Хозяйственные постройки', trench: 'Окопы', water: 'Пруд и ручей',
};
const MOVE_TEXT = { normal: 'Обычное', rough: 'Трудное: прерывает перебежку', impassable: 'Непроходимо' };
const COVER = { 4: 'Без укрытия', 5: 'Лёгкое укрытие', 6: 'Надёжное укрытие' }; // by the roll a hit needs to become a casualty
const HOVER = { color: 'rgba(255, 255, 255, 0.9)', width: 2.5 }; // the hovered hex on the ground

const $ = (id) => document.getElementById(id);
// Arrow keys pan: the view moves that way (the map the other).
const ARROWS = { ArrowLeft: [ARROW_PAN_PX, 0], ArrowRight: [-ARROW_PAN_PX, 0], ArrowUp: [0, ARROW_PAN_PX], ArrowDown: [0, -ARROW_PAN_PX] };

// The board is drawn in 3D (render/world3d.js) under the board canvas, which takes the input.
// recorder: a run on a hub map being recorded ({ commit(orders), finish() }, main.js); replay: a run played back
// ({ mapId, commits, at, player, result, turns, sameRules }); unrecorded: why a hub map's game isn't recorded.
// «Повтор»: where each turn of a run starts (the board, and how many of the player's commits come before it), and
// its end. The same play-through as the hub's (ai/run.js), so a jump to a turn shows what playing up to it would.
function replayMarks(state, commits) {
  const marks = [];
  let s = state;
  let at = 0;
  for (let i = 0; i < RUN_LIMITS.steps && !s.result && s.activeSide; i++) {
    if (s.activeSide === PLAYER_SIDE) {
      if (marks.at(-1)?.turn !== s.turn) marks.push({ turn: s.turn, at, state: s });
      if (at >= commits.length) break;
      s = commitTurn(s, commits[at++]);
    } else {
      s = commitTurn(s, chooseOrders(s, s.activeSide));
    }
  }
  if (marks.at(-1)?.state !== s) marks.push({ turn: s.turn, at, state: s, end: true });
  return marks;
}

export function startApp(initialState, { reveal = false, recorder = null, replay = null, unrecorded = '' } = {}) {
  const world = createWorld($('board'), initialState.map);
  const app = {
    reveal,            // debug: draw unseen OPFOR faintly (?reveal=1)
    view: false,       // shade hexes the selected unit cannot see (V)
    viewCache: null,
    state: initialState,
    cam: world.camera,  // world3d's: toWorld, zoomAt, panBy, orbit, turn, fit
    selected: null,
    plan: [],          // BLUFOR's orders for this turn, in the order they will run
    anim: [],
    shots: [],         // lines of fire being shown: { from, to, start, ms, side, tag }
    bangs: [],         // bang markers being shown: { hex, start, k }
    playing: false,    // a commit is being played back
    dragUnit: null,    // your unit being dragged to a hex (a drop there orders it, like a click)
    final: null,       // the state the commit being played back ends in
    timers: [],        // what playback has scheduled: cleared to stop it (a replay's pause or jump)
    fireCache: null,
    hover: null,
    hoverUnit: null,   // your unit under the pointer that a click would select
    hoverSight: null,  // the unit under the pointer whose line of sight the view shows (yours, or a spotted enemy)
    message: '',
    aiPending: false,
    recorder,
    replay,
    unrecorded,
    runNote: '',       // what the hub said about the finished run, for the debrief
    runRecorded: false, // the hub took the run: it can be played back («Повтор»)
    comment: { text: '', sent: false, error: '' }, // the debrief's comment on the map (a real game in the hub)
    finishing: null,   // the run being sent to the hub
  };
  const canvas = $('board');
  const tray = createDiceTray($('dice'));
  // A replay has its own controls instead of the orders' (user request 2026-10-15): pause, play, a turn back or
  // forward, and the way out.
  $('actions').hidden = !!replay;
  $('replayBar').hidden = !replay;
  if (replay) Object.assign(replay, { paused: false, marks: replayMarks(initialState, replay.commits) });
  // The part of the board the floating panels leave free: a fit centers the map in it.
  function freeArea(width) {
    const box = (id) => $(id).getBoundingClientRect();
    const stage = box('stage');
    const pad = {
      left: box('phaseCard').right - stage.left + FIT_GAP,
      right: stage.right - Math.min(box('hud').left, box('hexcard').left) + FIT_GAP,
      top: FIT_GAP,
      bottom: stage.bottom - box(replay ? 'replayBar' : 'actions').top + HINT_ROOM,
    };
    return pad.left + pad.right > width / 2 ? { left: 0, right: 0, top: 0, bottom: 0 } : pad;
  }
  const fit = () => {
    const { clientWidth: width, clientHeight: height } = canvas;
    app.cam.fit(width, height, freeArea(width));
  };
  fit();

  const unit = (id) => app.state.units[id];
  const planning = () => !app.replay && !app.playing && !app.state.result && app.state.activeSide === PLAYER_SIDE && !app.aiPending && !app.anim.length;
  const myUnits = () => app.state.units.filter((u) => u.side === PLAYER_SIDE && canActivate(app.state, u));
  const orderIndex = (id) => app.plan.findIndex((a) => a.unit === id);
  const spotted = (u) => app.state.contacts[PLAYER_SIDE]?.[u.id]?.level === 'spotted';
  const shown = (u) => u.side === PLAYER_SIDE || spotted(u);

  // The state a unit's order is planned against: the orders before it applied.
  function projectedFor(id) {
    const i = orderIndex(id);
    return projectOrders(app.state, i === -1 ? app.plan : app.plan.slice(0, i));
  }

  // Selection: left click a unit to select it, right click (or Esc) to deselect.
  function select(id) {
    app.selected = id;
    app.message = '';
    render();
  }

  function deselect() {
    app.selected = null;
    app.message = '';
    render();
  }

  // ---- planning ----

  function options() {
    if (app.selected === null || !planning()) return { moves: [], fast: new Map(), fire: new Set(), assault: [], from: null };
    const p = projectedFor(app.selected);
    const u = p.units[app.selected];
    const assault = neighbors(u.pos).filter((h) => assaultVia(p, { type: 'move', unit: u.id, to: h })
      && validateAction(p, { type: 'move', unit: u.id, to: h }).ok);
    return { ...moveOptions(p, u), fire: fireTargets(p, u), assault, from: u.pos };
  }

  // Hexes the unit can fire at (keys). Cached: it checks line of sight to every hex in range.
  function fireTargets(p, u) {
    const k = `${u.id}|${JSON.stringify(app.plan)}`;
    if (app.fireCache?.state === app.state && app.fireCache.k === k) return app.fireCache.set;
    const set = new Set();
    if (firefight()) {
      for (let row = 0; row < p.map.height; row++) {
        for (let col = 0; col < p.map.width; col++) {
          if (validateAction(p, { type: 'fire', unit: u.id, target: { col, row } }).ok) set.add(`${col},${row}`);
        }
      }
    }
    app.fireCache = { state: app.state, k, set };
    return set;
  }

  // Give (or replace) the selected unit's order. A replaced order keeps its place.
  function setOrder(action) {
    const i = orderIndex(action.unit);
    if (i === -1) app.plan.push(action);
    else app.plan[i] = action;
    app.message = '';
    app.selected = null; // order given: the next click picks the next unit
    render();
  }

  // The order a click on hex h gives the selected unit, or null. In the
  // movement phase the distance decides: a next hex is a move, a hex two away
  // a fast move. In the firefight, any hex it can fire at.
  function orderFor(h) {
    if (app.selected === null) return null;
    const id = app.selected;
    const o = options();
    if (o.fire.has(key(h))) return { type: 'fire', unit: id, target: h };
    if (o.assault.some((m) => same(m, h))) return { type: 'move', unit: id, to: h };
    if (o.moves.some((m) => same(m, h))) return { type: 'move', unit: id, to: h };
    if (o.fast.has(key(h))) return { type: 'fastMove', unit: id, path: o.fast.get(key(h)) };
    return null;
  }

  function holdSelected() {
    if (app.selected === null || !planning()) return;
    const i = orderIndex(app.selected);
    if (i !== -1) app.plan.splice(i, 1);
    render();
  }

  function clearAll() {
    if (!planning()) return;
    app.plan = [];
    render();
  }

  // ---- commit ----

  // ---- playback: one step at a time, dice first, then the result ----

  // Is this event's roll something the player gets to see?
  const seen = (state, e) => !!eventText(state, e, PLAYER_SIDE);
  const rolls = (e) => (e.type === 'fire' || e.type === 'assault' || (e.type === 'rally' && e.roll !== null && !e.blocked));
  const label = (u) => counterLabel(u);

  function diceSpec(state, e) {
    if (e.type === 'fire') {
      const shooter = state.units[e.unit];
      const target = e.target === null ? null : state.units[e.target];
      const known = target && (target.side === PLAYER_SIDE || e.aimed || state.contacts[PLAYER_SIDE]?.[target.id]?.level === 'spotted');
      const rows = [{ label: `Попадание · нужно ${e.tn}+`, values: e.dice, need: e.tn }];
      if (known && e.casualtyRolls.length) rows.push({ label: `Потери · нужно ${e.casualtyOn}+`, values: e.casualtyRolls.map((c) => c.roll), need: e.casualtyOn });
      return {
        title: `${unitName(shooter)} ${e.aimed ? 'ведёт огонь по' : 'ведёт огонь на подавление по'} ${key(e.hex)}`,
        rows, result: fireSummary(state, e, PLAYER_SIDE), rollMs: DICE_ROLL_MS, staggerMs: DICE_STAGGER_MS,
      };
    }
    if (e.type === 'assault') {
      const a = state.units[e.unit];
      const d = state.units[e.defender];
      return {
        title: `${unitName(a)} штурмует ${unitName(d)} на ${key(e.hex)}`,
        rows: [
          { label: `${unitName(a)} · нужно ${e.attackTn}+`, values: e.attackRolls, need: e.attackTn },
          e.defendRolls.length
            ? { label: `${unitName(d)} · нужно ${e.defendTn}+`, values: e.defendRolls, need: e.defendTn }
            : { label: unitName(d), values: [], note: `${statusText(d, 'pinned')}: ответить не может` },
        ],
        result: assaultSummary(state, e), rollMs: DICE_ROLL_MS, staggerMs: 0,
      };
    }
    const u = state.units[e.unit];
    return {
      title: `${unitName(u)}: восстановление`,
      rows: [{ label: `Нужно ${e.need}+`, values: [e.roll], need: e.need }],
      result: e.success ? `Теперь ${statusText(u, e.to)}.` : `По-прежнему ${statusText(u, e.from)}.`, rollMs: RALLY_ROLL_MS, staggerMs: 0,
    };
  }

  // How long a roll stays on screen.
  const diceMs = (spec) => spec.rollMs + spec.staggerMs * (spec.rows.length - 1) + (spec.rollMs === RALLY_ROLL_MS ? RALLY_HOLD_MS : DICE_HOLD_MS);

  // Animate this step's moves (of units the player can see), one unit after another. Returns the time it takes.
  function animateMoves(state, events) {
    let delay = 0;
    const byUnit = new Map();
    for (const e of events.filter((x) => x.type === 'moved')) {
      const u = state.units[e.unit];
      if (u.side !== PLAYER_SIDE && state.contacts[PLAYER_SIDE]?.[u.id]?.level !== 'spotted') continue;
      if (!byUnit.has(e.unit)) byUnit.set(e.unit, [e.from]);
      byUnit.get(e.unit).push(e.to);
    }
    const now = performance.now();
    for (const [id, hexes] of byUnit) {
      app.anim.push({ id, points: hexes.map(center), start: now + delay });
      delay += (hexes.length - 1) * MOVE_ANIM_MS;
    }
    return delay;
  }

  // Carry out the orders, then play them back: each step's dice, then its
  // result on the map, the roster and the log, then its moves. `done` runs at the end.
  function run(actions, done) {
    const before = app.state;
    const steps = [];
    const final = commitOrders(before, actions, createRng(before.rngState), (state, events) => steps.push({ state, events })).state;
    app.final = final;
    app.playing = true;
    render();
    let t = 0;
    const later = (ms, fn) => app.timers.push(setTimeout(fn, ms));
    for (const step of steps) {
      for (const e of step.events.filter((x) => rolls(x) && seen(step.state, x))) {
        const spec = diceSpec(step.state, e);
        const ms = diceMs(spec);
        later(t, () => {
          tray.show(spec);
          const now = performance.now();
          if (e.type === 'fire' || e.type === 'assault') {
            const shooter = step.state.units[e.unit];
            app.shots.push({ from: e.from, to: e.hex, start: now, ms, side: shooter.side, tag: label(shooter) });
            app.bangs.push({ hex: e.hex, start: now, k: 0 });
            const second = e.type === 'assault' || e.hits > 0; // a second bang when the dice show hits
            if (second) app.bangs.push({ hex: e.hex, start: now + spec.rollMs * 0.85, k: 1 });
          }
        });
        t += ms;
      }
      const reveal = t;
      later(reveal, () => {
        tray.hide();
        app.state = step.state;
        animateMoves(step.state, step.events);
        render();
      });
      t += Math.max(STEP_GAP_MS, moveTime(step));
    }
    later(t, () => {
      tray.hide();
      app.state = final;
      app.playing = false;
      app.timers = [];
      render();
      done?.();
    });
  }

  function moveTime(step) {
    let ms = 0;
    const byUnit = new Map();
    for (const e of step.events.filter((x) => x.type === 'moved')) {
      const u = step.state.units[e.unit];
      if (u.side !== PLAYER_SIDE && step.state.contacts[PLAYER_SIDE]?.[u.id]?.level !== 'spotted') continue;
      byUnit.set(e.unit, (byUnit.get(e.unit) ?? 0) + 1);
    }
    for (const n of byUnit.values()) ms += n * MOVE_ANIM_MS;
    return ms;
  }

  function commit() {
    if (app.state.result) {
      showResult();
      return;
    }
    if (!planning()) return;
    const bad = checkPlan(app.state, app.plan).filter((c) => !c.ok);
    if (bad.length) {
      app.message = `Сначала исправьте или снимите эти приказы: ${bad.map((c) => `${shortName(unit(c.action.unit))} (${c.reason})`).join('; ')}.`;
      render();
      return;
    }
    app.message = '';
    const plan = app.plan;
    app.plan = [];
    app.selected = null;
    app.recorder?.commit(plan);
    run(plan, enemyTurn);
  }

  // «Повтор»: the player's next recorded commit, after a pause.
  function replayNext() {
    if (app.replay.paused || app.state.result || app.state.activeSide !== PLAYER_SIDE) return;
    const orders = app.replay.commits[app.replay.at++];
    if (!orders) {
      app.message = 'Запись на этом заканчивается.';
      render();
      return;
    }
    run(orders, enemyTurn);
  }

  // The run is over: the hub plays it through itself and says how it went.
  function finishRun() {
    app.finishing = app.recorder.finish().then(
      (r) => {
        app.runRecorded = true;
        if (r.result === 'won') {
          const extra = r.record ? ' Новый рекорд карты!' : r.personalBest ? ' Ваш лучший результат на этой карте.' : '';
          app.runNote = `Засчитано: победа за ${turnsText(r.turns)}.${extra}`;
        } else app.runNote = 'Засчитано как неудачная попытка.';
      },
      (err) => {
        app.runNote = `Прохождение не засчитано: ${err.message}`;
      },
    ).then(() => {
      const note = document.getElementById('runNote');
      if (note) note.textContent = app.runNote;
      showReplayButton();
    });
  }

  function enemyTurn() {
    if (app.replay?.paused) {
      render();
      return;
    }
    if (app.state.activeSide === PLAYER_SIDE || app.state.activeSide === null) {
      if (app.replay && app.state.activeSide === PLAYER_SIDE) app.timers.push(setTimeout(replayNext, REPLAY_PAUSE_MS));
      render();
      return;
    }
    app.aiPending = true;
    render();
    app.timers.push(setTimeout(() => {
      app.aiPending = false;
      const side = app.state.activeSide;
      run(chooseOrders(app.state, side), enemyTurn);
    }, AI_DELAY_MS));
  }

  // ---- «Повтор»: pause, play, a turn back or forward ----

  // Stop whatever playback has scheduled, mid-commit too.
  function stopPlayback() {
    for (const t of app.timers) clearTimeout(t);
    app.timers = [];
    app.playing = false;
    app.aiPending = false;
    app.anim = [];
    app.shots = [];
    app.bangs = [];
    tray.hide();
  }

  // Pause at once: the commit being shown jumps to its end.
  function pauseReplay() {
    if (app.replay.paused) return;
    const playing = app.playing;
    stopPlayback();
    if (playing) app.state = app.final;
    app.replay.paused = true;
    render();
  }

  // Go on from where the board is; at the end, from the start.
  function playReplay() {
    if (app.state.result) replayJump(0);
    app.replay.paused = false;
    render();
    enemyTurn(); // the side to act next acts: the player's next commit, or the AI
  }

  const togglePause = () => (app.replay.paused || app.state.result ? playReplay() : pauseReplay());

  // The turn shown: the last mark the board has reached.
  function replayIndex() {
    const { marks, at } = app.replay;
    let i = 0;
    marks.forEach((m, k) => {
      if (m.at <= at && m.turn <= app.state.turn) i = k;
    });
    return i;
  }

  // The board is exactly at mark i: a turn's start (or the end), not partway through it.
  function atMark(i) {
    const m = app.replay.marks[i];
    return !app.playing && app.replay.at === m.at && app.state.turn === m.turn && !!app.state.result === !!m.state.result
      && currentPhase(app.state).name === currentPhase(m.state).name;
  }

  // Back: to the start of this turn, or of the one before when already there. Forward: to the next turn's start.
  // A step pauses: the board waits to be looked at.
  function replayStep(dir) {
    const i = replayIndex();
    replayJump(dir < 0 ? (atMark(i) ? i - 1 : i) : i + 1);
  }

  function replayJump(i) {
    const m = app.replay.marks[Math.max(0, Math.min(i, app.replay.marks.length - 1))];
    stopPlayback();
    Object.assign(app.replay, { paused: true, at: m.at });
    app.state = m.state;
    app.debriefed = false; // reaching the end again shows the debrief again
    render();
  }

  function renderReplayBar() {
    const r = app.replay;
    const i = replayIndex();
    const playing = !r.paused && !app.state.result;
    $('replayBack').disabled = i === 0 && atMark(0);
    $('replayFwd').disabled = i >= r.marks.length - 1;
    $('replayIconPause').hidden = !playing;
    $('replayIconPlay').hidden = playing;
    $('replayPlayLabel').textContent = app.state.result ? 'С начала' : playing ? 'Пауза' : 'Смотреть';
    $('replayTurn').textContent = `Ход ${app.state.turn} из ${r.marks.at(-1).turn}`;
  }

  function toggleView() {
    app.view = !app.view;
    render();
  }

  function nextUnit() {
    const ready = myUnits();
    if (!ready.length) return;
    const i = ready.findIndex((u) => u.id === app.selected);
    select(ready[(i + 1) % ready.length].id);
  }

  // ---- panel ----

  function orderLine(u) {
    const i = orderIndex(u.id);
    if (!canActivate(app.state, u)) {
      return rallyPreview(app.state, u) ?? (u.moved ? `${movedWord(u)}: в этот ход не стреляет` : reloading(u) ? `перезарядка: не стреляет ${u.fired ? 'в следующий ход' : 'в этот ход'}` : '');
    }
    if (i === -1) return firefight() ? 'нет приказа: не стреляет' : 'нет приказа: на месте';
    const check = checkPlan(app.state, app.plan)[i];
    return check.ok ? `${i + 1}. ${previewAction(projectedFor(u.id), app.plan[i]).replace(new RegExp(`^${shortName(u)} `), '')}` : `${i + 1}. ${NOT_POSSIBLE}: ${check.reason}`;
  }

  // Still reloading on its side's next turn (the HMG after firing). Every unit's
  // reload runs until its side's next turn starts; only one that lasts longer is shown.
  const reloading = (u) => (u.fired ? u.reload > 1 : u.reload > 0);
  const movedWord = (u) => agree(u, { team: 'двигалась', leader: 'двигался' });
  const NOT_POSSIBLE = 'НЕВОЗМОЖНО';
  const firefight = () => !(currentPhase(app.state).actions ?? []).includes('move');

  function phaseTitle() {
    const s = app.state;
    if (s.result) return s.result.winner === PLAYER_SIDE ? 'Задача выполнена' : 'Задача провалена';
    if (s.activeSide !== PLAYER_SIDE) return 'Ход противника';
    return phaseLabel(currentPhase(s).name);
  }

  // Header: the turn's phases, the current one lit.
  function renderPhases() {
    const s = app.state;
    const spans = s.balance.turn.phases.map((p, i) => {
      const el = document.createElement('span');
      el.textContent = phaseLabel(p.name);
      el.title = `${p.side}${p.automatic ? ', автоматически' : ''}`;
      const cls = [];
      if (p.side !== PLAYER_SIDE) cls.push('enemy');
      if (i < s.phase || s.result) cls.push('done');
      if (i === s.phase && s.activeSide !== null) cls.push('now');
      el.className = cls.join(' ');
      return el;
    });
    $('phases').replaceChildren(...spans);
  }

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs) => {
    const e = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  };

  // A small counter for the roster: the NATO frame with the infantry X and the echelon mark.
  function chip(u) {
    const svg = svgEl('svg', { class: 'chipsvg', viewBox: '0 0 62 48', 'aria-hidden': 'true' });
    const ink = COLORS.ink;
    const mark = 'currentColor';
    if (u.kind === 'leader') svg.append(svgEl('circle', { cx: 31, cy: 6, r: 3, fill: mark }));
    else {
      svg.append(svgEl('circle', { cx: 31, cy: 7, r: 4.5, fill: 'none', stroke: mark, 'stroke-width': 2 }));
      svg.append(svgEl('line', { x1: 24, y1: 14, x2: 38, y2: 0, stroke: mark, 'stroke-width': 2 }));
    }
    const fill = u.status === 'eliminated' ? '#b9b5a8' : COLORS.blufor;
    svg.append(svgEl('rect', { x: 2, y: 15, width: 58, height: 31, fill, stroke: ink, 'stroke-width': 3 }));
    svg.append(svgEl('path', { d: 'M2 15 L60 46 M60 15 L2 46', stroke: ink, 'stroke-width': 2.5 }));
    if (u.type === 'hmg') svg.append(svgEl('path', { d: 'M31 42 L31 19 M25 25 L31 19 L37 25', fill: 'none', stroke: ink, 'stroke-width': 2.5 }));
    return svg;
  }

  const ROLE_NAMES = ROLE; // short role labels (text.js)

  function unitCard(s, u) {
    const b = el('button', 'unit');
    if (u.id === app.selected) b.classList.add('selected');
    const ready = canActivate(s, u) && planning();
    b.disabled = !ready;
    if (!ready) b.classList.add('idle');
    const who = el('div');
    const name = el('div', 'name', u.kind === 'leader' ? 'Командир отделения' : u.team);
    const roles = el('div', 'roles');
    const roster = unitType(s.balance, u).roles;
    for (const r of roster) {
      const alive = u.soldiers.includes(r);
      const span = el('span', alive ? '' : 'lost');
      span.append(el('i', alive ? 'on' : ''), document.createTextNode(ROLE_NAMES[r] ?? r));
      roles.append(span);
    }
    if (u.exposed) roles.append(el('span', 'exposed', 'на виду'));
    who.append(name, roles);
    // Once the mission is over only a lasting state is worth a tag.
    const status = u.status !== 'ok' ? u.status : s.result ? '' : u.moved ? 'moved' : reloading(u) ? 'reloading' : 'ready';
    const label = { moved: movedWord(u), reloading: 'перезарядка', ready: agree(u, { team: 'готова', leader: 'готов' }) }[status] ?? (status ? statusText(u, status) : '');
    const tag = el('span', `chip status ${status}`, label);
    tag.hidden = !status;
    const order = el('div', 'order', u.status === 'eliminated' || s.result ? '' : orderLine(u));
    if (order.textContent.includes(NOT_POSSIBLE)) order.classList.add('bad');
    b.append(chip(u), who, tag, order);
    b.onclick = () => select(u.id);
    return b;
  }

  function render() {
    const s = app.state;
    $('mission').textContent = s.map.name;
    $('phaseName').textContent = phaseTitle();
    $('phaseKicker').textContent = app.replay && !s.result
      ? `Повтор · ${app.replay.player} · ход ${s.turn}`
      : s.result ? 'Задача завершена' : planning() ? `Ваши приказы · ход ${s.turn}` : s.activeSide === PLAYER_SIDE ? 'Приказы выполняются' : 'Ход противника';
    $('phaseCard').className = `panel thin ${s.result ? (s.result.winner === PLAYER_SIDE ? 'won' : 'lost') : ''}`;
    renderPhases();
    const ready = planning() ? myUnits().length : 0;
    $('progress').style.width = `${ready ? (100 * Math.min(app.plan.length, ready)) / ready : 0}%`;

    $('units').replaceChildren(...s.units.filter((u) => u.side === PLAYER_SIDE).map((u) => unitCard(s, u)));

    const sel = app.selected !== null ? unit(app.selected) : null;
    if (app.replay) renderReplayBar();
    $('clear').disabled = !planning() || !app.plan.length;
    $('commit').disabled = !planning() && !s.result;
    $('commitLabel').textContent = s.result ? 'Итоги' : firefight() ? 'Открыть огонь' : 'Выполнить движение';
    $('view').classList.toggle('on', app.view);
    const contacts = knownEnemies(s, PLAYER_SIDE);
    const sp = contacts.filter((c) => c.level === 'spotted').length;
    $('turn').textContent = `${s.turn}`;
    $('contacts').textContent = (contacts.length ? `обнаружено: ${sp} · предполагаемых: ${contacts.length - sp}` : 'Контакта нет') + (app.reveal ? ' · отладка: показан весь OPFOR' : '');
    $('contacts').classList.toggle('hot', contacts.length > 0);
    $('preview').textContent = hint(sel);
    $('message').textContent = app.message;
    $('hint').classList.toggle('empty', !$('preview').textContent && !app.message);
    if (s.result && app.recorder && !app.finishing) finishRun();
    if (s.result && !app.debriefed) {
      app.debriefed = true;
      showResult();
    }
    renderHover(); // the hex card follows the state too, not only the pointer
    if (app.pointer) {
      app.hoverUnit = selectableAt(app.pointer.x, app.pointer.y);
      app.hoverSight = sightAt(app.pointer.x, app.pointer.y);
    }
    renderUnitTip();
  }

  // Your unit whose counter or figures are under a screen point, if a click would select it now.
  function selectableAt(sx, sy) {
    const id = world.pickUnit(sx, sy);
    const u = id === null ? null : unit(id);
    return u && u.side === PLAYER_SIDE && planning() && canActivate(app.state, u) ? u.id : null;
  }

  // Any unit you can see whose counter or figures are under a screen point: yours, or a spotted enemy.
  function sightAt(sx, sy) {
    const id = world.pickUnit(sx, sy);
    const u = id === null ? null : unit(id);
    return u && u.status !== 'eliminated' && shown(u) ? u.id : null;
  }

  // The order a click (or a drop) on the hex under the pointer would give the selected unit, or null.
  function hoverOrder() {
    return app.selected !== null && planning() && app.hover && inBounds(app.state.map, app.hover) ? orderFor(app.hover) : null;
  }

  // The pointer (user request 2026-10-15): a scope over a hex the selected unit would fire at, an arrow onto a hex
  // over one it would move to, a hand over a unit you can pick; dragging a unit, not-allowed where it can't go.
  function cursorFor() {
    const order = hoverOrder();
    const of = (o) => (o.type === 'fire' ? CURSOR.scope : CURSOR.move);
    if (app.dragUnit !== null) return order ? of(order) : 'not-allowed';
    if (app.hoverUnit !== null) return 'pointer';
    return order ? of(order) : '';
  }

  // Over a unit a click would select: a pointer cursor, its counter lit (world3d), and a tag.
  function renderUnitTip() {
    const tip = $('unitTip');
    const id = app.hoverUnit;
    canvas.style.cursor = cursorFor();
    const show = id !== null && id !== app.selected && app.pointer && !app.pointer.dragging;
    tip.hidden = !show;
    if (!show) return;
    tip.replaceChildren(el('b', '', shortName(unit(id))), document.createTextNode('нажмите, чтобы выбрать'));
    tip.style.left = `${app.pointer.x + TIP_OFFSET.x}px`;
    tip.style.top = `${app.pointer.y + TIP_OFFSET.y}px`;
  }

  function hint(u) {
    if (!planning()) return '';
    if (!u) return 'Нажмите на своё подразделение (фишку или бойцов), чтобы выбрать его.';
    const deselect = ' Правая кнопка снимает выбор.';
    const chosen = `${agree(u, { team: 'Выбрана', leader: 'Выбран' })} ${shortName(u)}`;
    if (firefight()) {
      return `${chosen} (${fireDiceText(u)}). Наведите на гекс, чтобы увидеть шансы; нажмите, чтобы открыть огонь. Синее кольцо: обнаруженный противник (прицельный огонь). Красное кольцо в соседнем гексе: штурм. В остальной закрашенной зоне: огонь на подавление.${deselect}`;
    }
    const lead = u.kind === 'leader' ? ' Группы в его гексе наверняка придут в себя в фазе восстановления; дальше бросок должен превысить расстояние до него. Чтобы встать к группе, нажмите на её гекс рядом с фишкой.' : '';
    const o = options();
    const assault = o.assault.length ? ' Красное кольцо: штурм противника (наведите, чтобы увидеть шансы).' : '';
    const type = unitType(app.state.balance, u);
    const moves = type.fastMove ? 'Синий гекс — движение на 1 гекс, жёлтый — перебежка на 2.' : `Синий гекс — движение на 1 гекс (${typeName(type.name)} не делает перебежек).`;
    return `${chosen}. ${moves}${assault}${lead}${deselect}`;
  }

  const fireDiceText = (u) => diceText(fireDice(app.state.balance, u));

  // The hex card, docked bottom right: what the hex under the pointer is,
  // what stands there and, with a unit selected, what an order there would
  // do. Rebuilt only when something it shows changes.
  let cardKey = null;
  function renderHover() {
    if (planning() && app.selected !== null) $('preview').textContent = hint(unit(app.selected));
    $('hint').classList.toggle('empty', !$('preview').textContent && !app.message);
    const card = $('hexcard');
    const h = app.hover && inBounds(app.state.map, app.hover) ? app.hover : null;
    const k = h ? [key(h), app.selected, app.plan.length, app.state.turn, app.state.phase, app.playing].join('|') : 'none';
    if (k === cardKey) return;
    cardKey = k;
    card.replaceChildren(...(h ? hexCard(h) : [el('div', 'eyebrow', 'Гекс'), el('p', 'hc-empty', 'Наведите на гекс: местность, укрытие и кто там.')]));
  }

  function hexCard(h) {
    const s = app.state;
    const t = terrainName(s.map, h);
    const info = terrainOf(s.map, s.balance, h);
    const head = el('div', 'hc-head');
    const swatch = el('span', 'hc-swatch');
    swatch.style.background = COLORS.terrain[t];
    const title = el('div', 'hc-title');
    title.append(el('b', '', TERRAIN[t]?.name ?? t), el('span', '', `${TERRAIN_NOTES[t] ?? ''} · гекс ${s.balance.map.hexMeters} м`));
    head.append(swatch, title, el('span', 'hc-coord', key(h)));

    const tags = el('div', 'hc-tags');
    const tag = (text, tone = '') => tags.append(el('span', `chip ${tone}`, text));
    const cover = COVER[info.casualtyOn] ?? `Потери на ${info.casualtyOn}+`;
    tag(cover, info.casualtyOn >= 6 ? 'good' : info.casualtyOn === 5 ? 'warn' : '');
    if (info.concealing) tag('Скрывает', 'good');
    if (info.blocksLos) tag('Закрывает обзор');
    if (info.move === 'rough') tag('Трудно пройти', 'warn');
    if (info.move === 'impassable') tag('Непроходимо', 'bad');

    const rows = el('dl', 'hc-rows');
    const row = (label, value) => rows.append(el('dt', '', label), el('dd', '', value));
    row('Движение', MOVE_TEXT[info.move] ?? info.move);
    row('Потери', `на ${info.casualtyOn}+`);
    row('Скрытность', info.concealing ? 'Да' : 'Нет');
    row('Обзор', info.blocksLos ? 'Закрыт' : 'Открыт');
    const out = [head, tags, rows];

    const sides = Object.entries(s.map.sides[key(h)] ?? {});
    if (sides.length) {
      const list = el('div', 'hc-list');
      for (const [side, f] of sides) {
        const hs = s.balance.hexsides[f];
        const line = el('div');
        line.append(el('i', 'side'), el('span', '', `${FEATURE[f]?.name ?? f} на стороне ${sideName(side)}: потери на ${hs.casualtyOn}+ с той стороны${hs.blocksLos ? ', закрывает обзор' : ''}`));
        list.append(line);
      }
      out.push(list);
    }

    const here = unitsAt(s, h).filter(shown);
    const suspect = knownEnemies(s, PLAYER_SIDE).find((c) => c.level === 'suspected' && same(c.pos, h));
    if (here.length || suspect) {
      const list = el('div', 'hc-list');
      for (const u of here) {
        const line = el('div');
        const men = u.soldiers.length;
        line.append(el('i', u.side), el('span', '', `${unitName(u)} · ${menText(men)} · ${statusText(u)}${u.moved ? ` · ${movedWord(u)}` : ''}`));
        list.append(line);
      }
      if (suspect) {
        const line = el('div');
        line.append(el('i', 'suspect'), el('span', '', 'Предполагаемый противник (последняя известная позиция)'));
        list.append(line);
      }
      out.push(list);
    }

    // What clicking here would order the selected unit to do.
    const order = planning() ? orderFor(h) : null;
    if (order) out.push(orderBox(order, h));
    return out;
  }

  // An order's preview: its dice and odds as figures for fire and assault, in words for moves.
  function orderBox(order, h) {
    const p = projectedFor(order.unit);
    const u = p.units[order.unit];
    const assault = assaultVia(p, order);
    const kind = order.type === 'fire' ? 'Огонь' : order.type === 'fastMove' ? 'Перебежка' : assault ? 'Штурм' : 'Движение';
    const box = el('div', 'hc-order');
    box.append(el('div', 'eyebrow', `Нажатие: ${kind} · ${unitName(u)}`));
    const stats = (pairs) => {
      const g = el('div', 'hc-stats');
      for (const [label, value] of pairs) {
        const c = el('div');
        c.append(el('b', '', value), el('span', '', label));
        g.append(c);
      }
      return g;
    };
    const f = order.type === 'fire' && !order.second ? fireFigures(p, u, h) : null;
    const a = assault ? assaultFigures(p, u, h) : null;
    if (f) {
      box.append(
        el('div', 'hc-what', f.target ? `Прицельный огонь по ${f.target}` : 'Огонь на подавление: обнаруженного противника там нет'),
        stats([['кубики', `${f.dice}`], ['попадание', `${f.tn}+`], ['хоть одно', f.anyHit], ['прижать', f.pin]]),
        el('div', 'hc-note', `Сложность: ${f.mods}.`),
        el('div', 'hc-note', `Потери на ${f.casualtyOn}+ (${f.cover}), в среднем ${f.expected}.${f.target ? '' : ' Шансы для полной группы, если она там.'}`),
      );
    } else if (a) {
      box.append(
        el('div', 'hc-what', `Штурм: ${a.defender} (${a.status})`),
        stats([['кубики', `${a.dice}`], ['попадание', `${a.tn}+`], ['кубики врага', a.defendDice ? `${a.defendDice} на ${a.defendTn}+` : 'нет'], ['взять гекс', a.take]]),
        el('div', 'hc-note', `Иначе ${shortName(u)} откатится, ${statusText(u, 'pinned')}.${a.wiped ? ` ${a.wiped}, что ${agree(u, { team: 'её', leader: 'его' })} уничтожат.` : ''} Ожидаемые потери: ${shortName(u)} ${a.losses}, противник ${a.kills}.`),
      );
    } else {
      box.append(el('div', '', previewAction(p, order)));
    }
    return box;
  }

  // ---- drawing ----

  function positionOf(u, now) {
    const a = app.anim.find((x) => x.id === u.id);
    if (!a) return center(u.pos);
    return positionAlong(a.points, (now - a.start) / MOVE_ANIM_MS);
  }

  // Draw every frame; an error is shown instead of silently stopping the loop.
  function frame(now) {
    try {
      draw(now);
    } catch (err) {
      console.error(err);
      $('message').textContent = `Ошибка отображения: ${err.message}`;
    }
    requestAnimationFrame(frame);
  }

  function draw(now) {
    const s = app.state;

    const marks = [];
    const o = options();
    for (const h of o.moves) marks.push({ hex: h, color: COLORS.move });
    for (const path of o.fast.values()) {
      const end = path[path.length - 1];
      if (!o.moves.some((m) => same(m, end))) marks.push({ hex: end, color: COLORS.fast });
    }
    const spottedHere = (h) => s.units.some((u) => u.side !== PLAYER_SIDE && spotted(u) && u.status !== 'eliminated' && same(u.pos, h));
    for (const k of o.fire) {
      const [col, row] = k.split(',').map(Number);
      const h = { col, row };
      const ring = !spottedHere(h) ? null : o.from && distance(o.from, h) === 1 ? COLORS.assault : COLORS.fireInk;
      marks.push(ring ? { hex: h, color: ring, width: 3, fill: COLORS.fireZone } : { hex: h, color: null, fill: COLORS.fireZone, inset: 0 });
    }
    for (const h of o.assault) marks.push({ hex: h, color: COLORS.assault, width: 4 });
    if (app.hover && inBounds(s.map, app.hover)) marks.push({ hex: app.hover, color: HOVER.color, width: HOVER.width, inset: 0.02 });
    if (app.view) {
      // From the unit under the pointer, else the selected unit, else every unit of the squad together.
      // One of yours sees from where its order starts; an enemy from where it is.
      const eye = (id) => (unit(id).side === PLAYER_SIDE && planning() ? projectedFor(id).units[id].pos : unit(id).pos);
      const one = app.hoverSight ?? app.selected;
      const eyes = one !== null
        ? [eye(one)]
        : s.units.filter((u) => u.side === PLAYER_SIDE && u.status !== 'eliminated').map((u) => u.pos);
      const k = eyes.map(key).join(';');
      if (app.viewCache?.k !== k) {
        const seen = new Set();
        for (const from of eyes) for (const h of visibleFrom(s.map, s.balance, from)) seen.add(key(h));
        app.viewCache = { k, seen };
      }
      for (let row = 0; row < s.map.height; row++) {
        for (let col = 0; col < s.map.width; col++) {
          if (!app.viewCache.seen.has(`${col},${row}`)) marks.unshift({ hex: { col, row }, color: null, fill: COLORS.shade, inset: 0 });
        }
      }
    }
    const suspected = knownEnemies(s, PLAYER_SIDE).filter((c) => c.level === 'suspected').map((c) => c.pos);

    // Every planned order: a move arrow (an arch to the hex it moves to, drawn by the world), or a line of fire
    // from where the unit will be when it runs. Lines of fire go on top of the counters (drawn last), so the
    // crosshair shows on its target.
    const arrows = [];
    const fires = [];
    if (planning()) {
      const checks = checkPlan(s, app.plan);
      app.plan.forEach((a, i) => {
        if (a.type === 'pass') return;
        const from = projectOrders(s, app.plan.slice(0, i)).units[a.unit].pos;
        if (a.type === 'fire' || assaultVia(projectOrders(s, app.plan.slice(0, i)), a)) {
          const to = a.type === 'fire' ? a.target : a.to;
          const color = !checks[i].ok ? COLORS.invalid : a.type === 'move' ? COLORS.assault : a.unit === app.selected ? COLORS.plan : COLORS.fireInk;
          const tag = counterLabel(unit(a.unit));
          fires.push({ from, to, color, tag });
          if (a.second) fires.push({ from, to: a.second, color, tag });
          return;
        }
        arrows.push({ from, to: a.type === 'move' ? a.to : a.path[a.path.length - 1], kind: checks[i].ok ? 'plan' : 'invalid' });
      });
      // While deciding (pointing, or dragging the unit): the arrow to the hex a click or a drop would move it to.
      const would = hoverOrder();
      if (would && (would.type === 'move' || would.type === 'fastMove') && !assaultVia(projectedFor(would.unit), would)) {
        arrows.push({ from: projectedFor(would.unit).units[would.unit].pos, to: would.type === 'move' ? would.to : would.path[would.path.length - 1], kind: 'hover' });
      }
    }

    const animating = app.anim.length;
    app.anim = app.anim.filter((a) => (now - a.start) / MOVE_ANIM_MS < a.points.length - 1);
    if (animating && !app.anim.length) render(); // the panel waits for moves to finish
    const counters = s.units.filter((u) => shown(u) || app.reveal).map((u) => ({
      unit: u,
      ghost: !shown(u),
      pos: positionOf(u, now),
      selected: u.id === app.selected && planning(),
      stackedWithTeam: u.kind === 'leader' && unitsAt(s, u.pos).some((x) => x.kind === 'team'),
    }));
    // Teams first so the SL sits on top.
    counters.sort((a, b) => (a.unit.kind === 'leader') - (b.unit.kind === 'leader'));
    const rosterOf = (u) => unitType(s.balance, u).roles;
    app.shots = app.shots.filter((x) => now < x.start + x.ms);
    app.bangs = app.bangs.filter((b) => now < b.start + BANG_MS);
    const shotAlpha = (t) => (t < 0.75 ? 1 : (1 - t) * 4);
    const shotInk = (x) => (x.side === PLAYER_SIDE ? COLORS.fireInk : COLORS.hostileFireInk);

    // The marks, paths and lines of fire are painted on the ground (repainted
    // only when they change); the world draws the units and bangs itself.
    const shots = app.shots.map((x) => ({ from: x.from, to: x.to, side: x.side, t: (now - x.start) / x.ms }));
    world.render(now, {
      counters,
      rosterOf,
      bangs: app.bangs.map((b) => ({ hex: b.hex, k: b.k, t: (now - b.start) / BANG_MS })),
      hoverUnit: app.hoverUnit,
      shots,
      arrows,
      sig: JSON.stringify([marks, suspected, fires, shots.length ? now : 0]),
      paint: (ctx, cam) => {
        drawHexMarks(ctx, cam, marks);
        drawSuspected(ctx, cam, suspected);
        for (const f of fires) drawFire(ctx, cam, f.from, f.to, f.color, 1, f.tag);
        for (const x of app.shots) {
          const t = (now - x.start) / x.ms;
          if (t >= 0) drawFire(ctx, cam, x.from, x.to, shotInk(x), shotAlpha(t), x.tag);
        }
      },
    });
  }

  // ---- input ----

  // A left drag that starts on one of your units moves that unit: dropped on a hex, it gets the order a click there
  // would give (user request 2026-10-15). Any other drag moves the view (middle: turns it).
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    const r = canvas.getBoundingClientRect();
    const grab = e.button === 0 ? selectableAt(e.clientX - r.left, e.clientY - r.top) : null;
    drag = { x: e.clientX, y: e.clientY, moved: false, button: e.button, unit: grab };
  });
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    app.pointer = { x: e.clientX - r.left, y: e.clientY - r.top, dragging: !!drag?.moved };
    app.hover = hexAt(app.cam.toWorld(e.clientX - r.left, e.clientY - r.top));
    app.hoverUnit = drag?.moved ? null : selectableAt(app.pointer.x, app.pointer.y);
    app.hoverSight = drag?.moved ? null : sightAt(app.pointer.x, app.pointer.y);
    if (drag) {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (drag.moved || Math.hypot(dx, dy) > CLICK_SLOP_PX) {
        if (drag.unit !== null) {
          if (!drag.moved && app.selected !== drag.unit) select(drag.unit);
          app.dragUnit = drag.unit;
        } else if (drag.button === 1) app.cam.orbit(dx, dy); // middle drag turns the view
        else app.cam.panBy(dx, dy);                          // left or right drag moves it
        drag.moved = true;
        drag.x = e.clientX;
        drag.y = e.clientY;
      }
    }
    renderHover();
    renderUnitTip();
  });
  canvas.addEventListener('pointerup', (e) => {
    const d = drag;
    drag = null;
    const r0 = canvas.getBoundingClientRect();
    if (d?.moved && d.unit !== null) {
      app.dragUnit = null;
      const h = hexAt(app.cam.toWorld(e.clientX - r0.left, e.clientY - r0.top));
      // Dropped back where it stands: nothing to do.
      if (planning() && !same(h, projectedFor(d.unit).units[d.unit].pos)) orderOn(h);
      else render();
      return;
    }
    if (!d || d.moved || !planning()) return;
    if (d.button === 2) {
      deselect();
      return;
    }
    if (d.button !== 0) return;
    const r = canvas.getBoundingClientRect();
    // A click on one of your units (its counter or its soldiers) selects that unit...
    const picked = selectableAt(e.clientX - r.left, e.clientY - r.top);
    if (picked !== null) {
      select(picked);
      return;
    }
    // ...a click on a hex the selected unit can be ordered to gives the order.
    orderOn(hexAt(app.cam.toWorld(e.clientX - r.left, e.clientY - r.top)));
  });

  // A click or a drop on hex h: the selected unit's order there, or why it can't go.
  function orderOn(h) {
    if (!inBounds(app.state.map, h)) return;
    const order = orderFor(h);
    if (order) {
      setOrder(order);
      return;
    }
    if (app.selected !== null) {
      const why = firefight() ? validateAction(projectedFor(app.selected), { type: 'fire', unit: app.selected, target: h }).reason : null;
      app.message = firefight()
        ? `Туда стрелять нельзя: ${why}. Правая кнопка снимает выбор.`
        : 'До этого гекса не добраться. Синий — движение, жёлтый — перебежка. Правая кнопка снимает выбор.';
      render();
    }
  }
  canvas.addEventListener('pointerleave', () => {
    app.hover = null;
    app.pointer = null;
    app.hoverUnit = null;
    app.hoverSight = null;
    renderHover();
    renderUnitTip();
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    app.cam.zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? WHEEL_ZOOM : 1 / WHEEL_ZOOM);
  }, { passive: false });
  window.addEventListener('resize', fit);

  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (app.modal) {
      if (e.target instanceof HTMLTextAreaElement && k !== 'escape') return; // typing a comment in the debrief
      if (k === 'escape' || k === 'enter' || k === ' ') {
        e.preventDefault();
        closeModal();
      }
      return;
    }
    if (k === 'f1' || k === '?') {
      e.preventDefault();
      showHelp();
    } else if (k === ' ' || k === 'enter') {
      e.preventDefault(); // also stops a focused button from being clicked by Space
      if (app.replay && k === ' ') togglePause();
      else commit();
    } else if (k === 'tab') {
      e.preventDefault();
      nextUnit();
    } else if (k === 'escape') deselect();
    else if (k === 'backspace' || k === 'delete') holdSelected();
    else if (k === 'v') toggleView();
    else if (k === 'home' || k === '0') fit();
    else if (k === 'q' || k === 'e') app.cam.turn(k === 'q' ? -1 : 1);
    else if (ARROWS[e.key]) {
      e.preventDefault();
      app.cam.panBy(...ARROWS[e.key]);
    }
  });

  if (replay) {
    $('replayPlay').onclick = togglePause;
    $('replayBack').onclick = () => replayStep(-1);
    $('replayFwd').onclick = () => replayStep(1);
    $('replayExit').onclick = () => {
      location.href = hubBack();
    };
  }
  $('clear').onclick = clearAll;
  $('commit').onclick = commit;
  $('view').onclick = toggleView;

  // Map controls. Zoom about the middle of the free area.
  const zoomCenter = (factor) => {
    const { clientWidth: width, clientHeight: height } = canvas;
    const pad = freeArea(width);
    app.cam.zoomAt(pad.left + (width - pad.left - pad.right) / 2, pad.top + (height - pad.top - pad.bottom) / 2, factor);
  };
  $('zoomIn').onclick = () => zoomCenter(WHEEL_ZOOM * WHEEL_ZOOM);
  $('zoomOut').onclick = () => zoomCenter(1 / (WHEEL_ZOOM * WHEEL_ZOOM));
  $('fitBtn').onclick = fit;
  $('turnLeft').onclick = () => app.cam.turn(-1);
  $('turnRight').onclick = () => app.cam.turn(1);

  // The editor, opening this map. In the hub only a draft its author is trying (?src=…&playtest=1) goes back there: a
  // published map is only played, never opened in the editor or copied (user decision 2026-10-15).
  const here = new URLSearchParams(location.search);
  const editable = !servedByHub() || (!replay && !!here.get('src') && here.has('playtest'));
  $('editBtn').hidden = !editable;
  if (editable) $('editBtn').href = `editor.html?${new URLSearchParams(here.get('src') ? { src: here.get('src') } : { map: here.get('map') ?? 'trenchline' })}`;

  $('helpBtn').onclick = showHelp;

  // ---- dialogs: help, debrief ----

  function openModal(dialog) {
    const m = $('modal');
    m.replaceChildren(dialog);
    m.hidden = false;
    app.modal = true;
    for (const b of m.querySelectorAll('[data-close]')) b.onclick = closeModal;
    m.onclick = (e) => {
      if (e.target === m) closeModal();
    };
    dialog.querySelector('.btn.primary')?.focus();
  }

  function closeModal() {
    $('modal').hidden = true;
    $('modal').replaceChildren();
    app.modal = false;
  }

  function dialog(kicker, title, body, buttons) {
    const d = el('div', 'dialog');
    d.setAttribute('role', 'dialog');
    d.setAttribute('aria-modal', 'true');
    const head = el('header');
    const t = el('div');
    t.append(el('div', 'eyebrow', kicker), el('h2', '', title));
    head.append(t);
    const foot = el('footer');
    for (const [label, primary, fn, id] of buttons) {
      const b = el('button', primary ? 'btn primary' : 'btn', label);
      if (id) b.id = id;
      if (primary) b.style.minWidth = '0';
      if (fn) b.onclick = fn;
      else b.dataset.close = '';
      foot.append(b);
    }
    const main = el('div', 'body');
    main.append(...body);
    d.append(head, main, foot);
    return d;
  }

  const facts = (pairs) => {
    const f = el('div', 'facts');
    f.style.gridTemplateColumns = `repeat(${pairs.length}, minmax(0, 1fr))`;
    for (const [label, value] of pairs) {
      const c = el('div');
      c.append(el('span', 'eyebrow', label), el('b', '', value));
      f.append(c);
    }
    return f;
  };

  function showHelp() {
    openModal($('helpTpl').content.firstElementChild.cloneNode(true));
  }

  function showResult() {
    const s = app.state;
    if (!s.result) return;
    const won = s.result.winner === PLAYER_SIDE;
    const squad = s.units.filter((u) => u.side === PLAYER_SIDE);
    const men = squad.reduce((n, u) => n + u.soldiers.length, 0);
    const full = squad.reduce((n, u) => n + unitType(s.balance, u).roles.length, 0);
    const newDice = () => {
      const q = new URLSearchParams(location.search);
      q.set('seed', String(1 + Math.floor(Math.random() * 9999)));
      location.search = q.toString();
    };
    const note = app.recorder ? app.runNote || 'Прохождение засчитывается…' : app.unrecorded ? `Не засчитывается: ${app.unrecorded}` : '';
    const body = [
      el('div', `stamp ${won ? 'won' : 'lost'}`, won ? 'Задача выполнена' : 'Задача провалена'),
      el('p', '', `${s.result.why.charAt(0).toUpperCase()}${s.result.why.slice(1)}.`),
      facts([['Ход', `${s.turn}`], ['Осталось бойцов', `${men} из ${full}`]]),
    ];
    if (note) body.push(Object.assign(el('p', 'runNote', note), { id: 'runNote' }));
    const mapId = realGameMap();
    if (mapId) body.push(commentBox(mapId));
    // Then (user decisions 2026-10-15): back to the editor after a playtest (or a game run on its own), back to the hub
    // after a game there (the map's page, where the run shows in «Рейтинг»); «Повтор» of a recorded run once the hub
    // has it; and again: a recorded run with new dice from the hub, any other game with new dice of its own.
    // Moving on sends a comment typed but not sent; if it can't go, the debrief stays with the error.
    const onward = (fn) => async () => {
      if (mapId && !(await sendComment(mapId))) return;
      fn();
    };
    const go = (href) => onward(() => {
      location.href = href;
    });
    const buttons = [['Посмотреть карту', false, null], editable ? ['Обратно в редактор', false, go($('editBtn').href)] : ['Обратно в Хаб', false, go(hubBack())]];
    if (app.recorder) buttons.push(['Повтор', false, go(`?${new URLSearchParams({ replay: app.recorder.id })}`), 'replayBtn']);
    buttons.push(app.replay ? ['Смотреть снова', true, () => location.reload()] : ['Ещё раз', true, onward(app.recorder ? () => location.reload() : newDice)]);
    openModal(dialog(app.replay ? 'Повтор' : 'Итоги', s.map.name, body, buttons));
    showReplayButton();
  }

  // The hub map of a real game (a published map in the hub, not a playtest or a replay), or null.
  function realGameMap() {
    return servedByHub() && !app.replay && !here.has('playtest') ? hubIdOf(here.get('src') ?? '') : null;
  }

  // «Оставить комментарий (необязательно)» after a real game (user request 2026-10-15): a comment on the map, as on
  // its page in the hub. The text is kept while the debrief is closed and opened again.
  function commentBox(mapId) {
    const box = el('div', 'comment');
    if (app.comment.sent) {
      box.append(el('p', 'sent', 'Комментарий отправлен, он на странице карты.'));
      return box;
    }
    const label = el('label', '', 'Оставить комментарий (необязательно)');
    const area = el('textarea');
    area.id = label.htmlFor = 'debriefComment';
    area.rows = 3;
    area.maxLength = COMMENT_MAX;
    area.value = app.comment.text;
    const status = el('span', `status${app.comment.error ? ' bad' : ''}`, app.comment.error);
    const send = el('button', 'btn', 'Отправить');
    send.disabled = !area.value.trim();
    area.oninput = () => {
      app.comment.text = area.value;
      send.disabled = !area.value.trim();
    };
    send.onclick = async () => {
      send.disabled = true;
      if (await sendComment(mapId)) box.replaceWith(commentBox(mapId));
      else send.disabled = false;
    };
    const row = el('div', 'row');
    row.append(status, send);
    box.append(label, area, row);
    return box;
  }

  // Send the comment typed, if any. False when it couldn't go (the debrief shows why).
  async function sendComment(mapId) {
    const text = app.comment.text.trim();
    if (!text || app.comment.sent) return true;
    try {
      await hub.comment(mapId, text);
      app.comment = { text: '', sent: true, error: '' };
      return true;
    } catch (err) {
      app.comment.error = `Не отправлен: ${err.message}`;
      const status = document.querySelector('#modal .comment .status');
      if (status) {
        status.textContent = app.comment.error;
        status.className = 'status bad';
      }
      return false;
    }
  }

  // The hub page this game came from: its map's page, or the game's page when there is no hub map.
  function hubBack() {
    const id = app.replay?.mapId ?? hubIdOf(here.get('src') ?? '');
    return id ? hubMapPage(id) : hubHome;
  }

  // «Повтор» waits for the hub to take the run, and goes when it couldn't.
  function showReplayButton() {
    const b = document.getElementById('replayBtn');
    if (!b) return;
    b.disabled = !app.runRecorded;
    b.hidden = !!app.runNote && !app.runRecorded;
    b.title = app.runRecorded ? 'Посмотреть это прохождение с начала' : 'Будет доступен, когда прохождение засчитают';
  }


  if (app.replay) {
    const r = app.replay;
    app.message = `Повтор прохождения ${r.player}: ${r.result === 'won' ? `победа за ${turnsText(r.turns)}` : 'неудачная попытка'}.`
      + (r.sameRules ? '' : ' С тех пор правила игры менялись, повтор может пойти иначе.');
  }
  render();
  renderHover();
  enemyTurn(0);
  requestAnimationFrame(frame);
  // No briefing dialog at the start (user decision 2026-10-15): the objective and the brief are in the panel.
  return app;
}
