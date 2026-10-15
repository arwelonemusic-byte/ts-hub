// The map editor's model: a map being made, as plain data (so it can be
// stored, copied for undo and compared), and the pure functions that change
// it. No DOM: editor.js draws it and takes input. toMapJson turns it into the
// format of data/maps/*.json, which parseMap reads; fromMapJson reads one back.
//
// Every map made here is SIZE (14 x 16) for now, and its mission is always to
// take and hold the objective (missionBrief): no size or briefing to set.
//
// model = {
//   name, description,
//   width, height,                     // SIZE
//   terrain: ['open', ...],            // row-major, width x height
//   edges: { edgeKey: 'wall' | 'hedge' }, // on the edge between two hexes (or the board's edge)
//   parapets: ['col,row,SIDE', ...],   // just inside one hex, facing out of that side
//   start: { col, row },               // BLUFOR: the SL here, ALPHA and BRAVO in front of him (formation)
//   objective: { col, row },
//   enemies: [{ col, row }, ...],      // OPFOR fireteams
// }

import { SIDES, corners, distance, hexAt, neighborOn, sidesFacing } from '../sim/hex.js';
import { count } from '../text.js';
import { createRng } from '../sim/rng.js';

export const TERRAINS = ['open', 'road', 'scrub', 'woods', 'rubble', 'building', 'trench', 'water'];
export const LEGEND = { '.': 'open', '=': 'road', ':': 'scrub', T: 'woods', '%': 'rubble', B: 'building', n: 'trench', '~': 'water' };
const CHAR = Object.fromEntries(Object.entries(LEGEND).map(([c, t]) => [t, c]));
export const EDGE_FEATURES = ['wall', 'hedge'];
export const SIZE = { width: 14, height: 16 }; // every map, for now (user decision 2026-10-15)
export const ENEMY_TEAMS = ['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA'];

// The random map: smooth noise fields, a stream or a pond, a road, farms,
// hedgerows and yard walls, and the two sides at opposite ends.
const GEN = {
  cell: 3.2,          // hexes per noise cell: the size of woods and scrub patches
  woods: 0.6,         // noise above this: woods
  scrub: 0.5,         // ... above this: scrub
  scatter: 0.8,       // a second field, above this: lone scrub
  stream: 0.5,        // chance of a stream down the map (else maybe a pond)
  pond: 0.7,          // chance of a pond when there is no stream
  pondSize: [3, 7],
  meander: 0.28,      // chance a stream or road drifts sideways at a row instead of going straight on
  road: 0.75,
  farms: [1, 2],      // farm clusters: a building and one or two more beside it
  ruin: 0.5,          // chance a farm has a ruin next to it
  hedgerows: 1 / 30,  // field boundaries per hex of map
  hedgeLen: [2, 5],   // hex edges per field boundary
  fieldWall: 0.2,     // chance a field boundary is a stone wall, not a hedge
  yardWalls: [1, 2],  // walls per farm, along its buildings
  yardWallLen: [1, 3],
  band: 0.2,          // each side starts in this share of the map at its end
  cover: ['building', 'rubble', 'woods', 'scrub'], // where OPFOR would rather hold the objective
  parapet: 0.6,       // chance OPFOR's position (outside a building) has parapets toward BLUFOR
};
const between = (rng, [lo, hi]) => lo + rng.int(hi - lo + 1);

const same = (a, b) => a && b && a.col === b.col && a.row === b.row;
export const inside = (m, h) => !!h && h.col >= 0 && h.row >= 0 && h.col < m.width && h.row < m.height;
export const terrainAt = (m, h) => m.terrain[h.row * m.width + h.col];

export function newModel({ name = 'Новая карта' } = {}) {
  const { width, height } = SIZE;
  const mid = Math.floor(width / 2);
  return {
    name,
    description: '',
    width,
    height,
    terrain: new Array(width * height).fill('open'),
    edges: {},
    parapets: [],
    start: { col: mid, row: height - 2 },
    objective: { col: mid, row: 2 },
    enemies: [{ col: mid, row: 2 }],
  };
}

export function clone(m) {
  return JSON.parse(JSON.stringify(m));
}

// ---- the squad's start ----

// How BLUFOR starts (user decision 2026-10-15): ALPHA and BRAVO side by side,
// the SL behind them, touching both. model.start is the SL's hex; the teams
// are on its NW and NE sides, toward the top of the map.
export function formation(start) {
  return { ALPHA: neighborOn(start, 'NW'), BRAVO: neighborOn(start, 'NE'), SL: { col: start.col, row: start.row } };
}

const fits = (m, start) => Object.values(formation(start)).every((h) => inside(m, h));

// The nearest start (to a hex) whose three hexes are all on the map.
function nearestFit(m, from) {
  let best = null;
  for (let row = 0; row < m.height; row++) {
    for (let col = 0; col < m.width; col++) {
      const h = { col, row };
      if (fits(m, h) && (!best || distance(h, from) < distance(best, from))) best = h;
    }
  }
  return best;
}

// Placing the start with the pointer: the formation centered nearest a world
// point. Its center is the corner its three hexes share, the top corner of
// the SL's hex; every hex has three such corners (its top one, and its lower
// left and lower right ones, where it is a team and the SL is below it).
// By the map's bottom corners none of those fit: the nearest start that does.
// Null off the map.
export function startNear(m, p) {
  const h = hexAt(p);
  if (!inside(m, h)) return null;
  const TOP = 5; // corners() index of a hex's top corner
  let best = null;
  let bestD = Infinity;
  for (const sl of [h, neighborOn(h, 'SW'), neighborOn(h, 'SE')]) {
    if (!fits(m, sl)) continue;
    const c = corners(sl)[TOP];
    const d = Math.hypot(c.x - p.x, c.y - p.y);
    if (d < bestD) {
      best = sl;
      bestD = d;
    }
  }
  return best ?? nearestFit(m, h);
}

// ---- corners and edges ----

const vkey = (p) => `${Math.round(p.x * 100)},${Math.round(p.y * 100)}`;
export const edgeKey = (a, b) => [vkey(a), vkey(b)].sort().join('|');

// The map's hex corners and edges, for drawing walls and hedges corner to corner.
// vertices: key -> { x, y, next: Map(vertexKey -> edgeKey) }
// edges: key -> { a, b, owners: [{ hex, side }] } (one owner on the board's edge, else two)
export function graph(width, height) {
  const vertices = new Map();
  const edges = new Map();
  const vertex = (p) => {
    const k = vkey(p);
    if (!vertices.has(k)) vertices.set(k, { key: k, x: p.x, y: p.y, next: new Map() });
    return vertices.get(k);
  };
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const hex = { col, row };
      const pts = corners(hex);
      SIDES.forEach((side, i) => {
        const a = vertex(pts[i]);
        const b = vertex(pts[(i + 1) % 6]);
        const k = edgeKey(a, b);
        if (!edges.has(k)) edges.set(k, { key: k, a, b, owners: [] });
        edges.get(k).owners.push({ hex, side });
        a.next.set(b.key, k);
        b.next.set(a.key, k);
      });
    }
  }
  return { vertices, edges };
}

// The corner nearest a world point, within reach (world units), or null.
export function nearestVertex(g, p, reach) {
  let best = null;
  let bestD = reach;
  for (const v of g.vertices.values()) {
    const d = Math.hypot(v.x - p.x, v.y - p.y);
    if (d < bestD) {
      best = v;
      bestD = d;
    }
  }
  return best;
}

// The edge whose midpoint is nearest a world point, within reach, or null.
export function nearestEdge(g, p, reach) {
  let best = null;
  let bestD = reach;
  for (const e of g.edges.values()) {
    const d = Math.hypot((e.a.x + e.b.x) / 2 - p.x, (e.a.y + e.b.y) / 2 - p.y);
    if (d < bestD) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

// The fewest edges from one corner to another (vertex keys), or null.
export function edgePath(g, from, to) {
  if (from === to) return [];
  const back = new Map([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const k = queue.shift();
    for (const [n, e] of g.vertices.get(k).next) {
      if (back.has(n)) continue;
      back.set(n, { prev: k, edge: e });
      if (n === to) {
        const path = [];
        for (let at = to; back.get(at); at = back.get(at).prev) path.unshift(back.get(at).edge);
        return path;
      }
      queue.push(n);
    }
  }
  return null;
}

// Put a wall or hedge on these edges; when every one of them already has it, take it off instead.
export function drawEdges(m, keys, feature) {
  const off = keys.length > 0 && keys.every((k) => m.edges[k] === feature);
  for (const k of keys) {
    if (off) delete m.edges[k];
    else m.edges[k] = feature;
  }
  return off ? 'removed' : 'added';
}

export function toggleParapet(m, hex, side) {
  const k = `${hex.col},${hex.row},${side}`;
  const i = m.parapets.indexOf(k);
  if (i === -1) m.parapets.push(k);
  else m.parapets.splice(i, 1);
}

// Everything on one edge goes: its wall or hedge and the parapets on either side.
export function eraseEdge(m, edge) {
  let changed = !!m.edges[edge.key];
  delete m.edges[edge.key];
  for (const { hex, side } of edge.owners) {
    const k = `${hex.col},${hex.row},${side}`;
    const i = m.parapets.indexOf(k);
    if (i !== -1) {
      m.parapets.splice(i, 1);
      changed = true;
    }
  }
  return changed;
}

// ---- terrain and size ----

export function paint(m, hexes, terrain) {
  let changed = false;
  for (const h of hexes) {
    if (!inside(m, h) || terrainAt(m, h) === terrain) continue;
    m.terrain[h.row * m.width + h.col] = terrain;
    changed = true;
  }
  return changed;
}

// A map from elsewhere (saved by an older editor, or imported) made what the
// editor makes. Another size becomes SIZE: the hexes that fit keep their
// terrain (new ones are grass); walls, hedges, parapets and enemies off the
// map go; the objective moves onto it. And the squad's start moves to the
// nearest place where its three hexes are on the map.
export function fitMap(m) {
  const { width: w, height: h } = SIZE;
  if (m.width !== w || m.height !== h) resize(m, w, h);
  if (!fits(m, m.start)) m.start = nearestFit(m, m.start);
  return m;
}

function resize(m, w, h) {
  const terrain = new Array(w * h).fill('open');
  for (let row = 0; row < Math.min(h, m.height); row++) {
    for (let col = 0; col < Math.min(w, m.width); col++) terrain[row * w + col] = m.terrain[row * m.width + col];
  }
  const g = graph(w, h);
  const clampHex = (x) => ({ col: Math.min(x.col, w - 1), row: Math.min(x.row, h - 1) });
  const fits = (x) => x.col < w && x.row < h;
  m.width = w;
  m.height = h;
  m.terrain = terrain;
  m.edges = Object.fromEntries(Object.entries(m.edges).filter(([k]) => g.edges.has(k)));
  m.parapets = m.parapets.filter((k) => {
    const [col, row] = k.split(',').map(Number);
    return fits({ col, row });
  });
  m.start = clampHex(m.start);
  m.objective = clampHex(m.objective);
  m.enemies = m.enemies.filter(fits);
  return m;
}

// Smooth value noise over the hex centers: one random value per cell, eased between.
function noise(seed, cell) {
  const at = (ix, iy) => {
    let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const ease = (t) => t * t * (3 - 2 * t);
  return (h) => {
    const x = (h.col + 0.5 * (h.row & 1)) / cell;
    const y = (h.row * 0.866) / cell;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = ease(x - ix);
    const fy = ease(y - iy);
    const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * fx;
    const bottom = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * fx;
    return top + (bottom - top) * fy;
  };
}

// A whole new random map, the same for the same seed: woods and scrub in
// patches, a stream or a pond, a farm track, farms, hedgerows and yard walls;
// BLUFOR starts at the bottom, and one OPFOR team holds the objective near
// the top. Everything on the map before goes; the name stays.
export function randomize(m, seed) {
  const rng = createRng(seed);
  m.edges = {};
  m.parapets = [];
  const wood = noise(seed, GEN.cell);
  const spots = noise(seed + 1, GEN.cell / 2);
  const all = [];
  for (let row = 0; row < m.height; row++) for (let col = 0; col < m.width; col++) all.push({ col, row });
  const set = (h, t) => {
    if (inside(m, h)) m.terrain[h.row * m.width + h.col] = t;
  };
  for (const h of all) {
    const n = wood(h);
    set(h, n > GEN.woods ? 'woods' : n > GEN.scrub || spots(h) > GEN.scatter ? 'scrub' : 'open');
  }
  // A line of hexes from one end row to the other, each beside the last
  // (ahead: the two sides toward the next row). Taking them in turn goes
  // straight on; now and then it takes the same one again and drifts a column.
  const lane = (from, ahead, lo, hi) => {
    const out = [from];
    let lean = rng.int(2);
    for (let h = from; ;) {
      if (!rng.chance(GEN.meander)) lean = 1 - lean;
      let next = neighborOn(h, ahead[lean]);
      if (next.col < lo || next.col > hi) next = neighborOn(h, ahead[1 - lean]);
      if (!inside(m, next)) return out;
      out.push(next);
      h = next;
    }
  };
  // Water: a stream down one side, or a pond.
  const third = Math.max(1, Math.floor(m.width / 3));
  if (rng.chance(GEN.stream)) {
    const col = rng.chance(0.5) ? rng.int(third) : m.width - 1 - rng.int(third);
    for (const h of lane({ col, row: 0 }, ['SW', 'SE'], 0, m.width - 1)) set(h, 'water');
  } else if (rng.chance(GEN.pond)) {
    let h = { col: rng.int(m.width), row: rng.int(m.height) };
    const n = between(rng, GEN.pondSize);
    for (let i = 0; i < n; i++) {
      set(h, 'water');
      const next = neighborOn(h, SIDES[rng.int(6)]);
      if (inside(m, next)) h = next;
    }
  }
  // A farm track from the bottom edge to the top, crossing water at a ford.
  const roadCols = [];
  if (rng.chance(GEN.road)) {
    const col = third + rng.int(Math.max(1, m.width - 2 * third));
    for (const h of lane({ col, row: m.height - 1 }, ['NW', 'NE'], 1, m.width - 2)) {
      set(h, 'road');
      roadCols.push(h);
    }
  }
  // Farms, beside the track when there is one.
  const yards = [];
  const farms = between(rng, GEN.farms);
  for (let f = 0; f < farms; f++) {
    const near = roadCols.length ? roadCols[rng.int(roadCols.length)] : all[rng.int(all.length)];
    const yard = neighborOn(near, SIDES[rng.int(6)]);
    if (!inside(m, yard) || terrainAt(m, yard) === 'road') continue;
    set(yard, 'building');
    yards.push(yard);
    const more = 1 + rng.int(2);
    for (let i = 0; i < more; i++) {
      const b = neighborOn(yard, SIDES[rng.int(6)]);
      if (inside(m, b) && terrainAt(m, b) !== 'road') set(b, 'building');
    }
    if (rng.chance(GEN.ruin)) {
      const r = neighborOn(yard, SIDES[rng.int(6)]);
      if (inside(m, r) && terrainAt(m, r) !== 'road') set(r, 'rubble');
    }
  }

  // The two ends: BLUFOR's is the bottom, OPFOR's the top. depth: 0 on the bottom row, 1 on the top one.
  const depth = (h) => (m.height - 1 - h.row) / (m.height - 1);
  const pickFrom = (hexes) => hexes[rng.int(hexes.length)];
  // BLUFOR's start near its edge, the squad's three hexes on dry ground (made dry if there is none).
  const near = all.filter((h) => depth(h) <= GEN.band && fits(m, h));
  const dryNear = near.filter((h) => Object.values(formation(h)).every((x) => terrainAt(m, x) !== 'water'));
  m.start = { ...pickFrom(dryNear.length ? dryNear : near) };
  for (const h of Object.values(formation(m.start))) if (terrainAt(m, h) === 'water') set(h, 'open');
  // The objective near the far end but off the board's edge (so it can be
  // flanked either way), on cover when there is some; one OPFOR team holds it.
  const onEdge = (h) => h.col === 0 || h.row === 0 || h.col === m.width - 1 || h.row === m.height - 1;
  const far = all.filter((h) => depth(h) >= 1 - GEN.band);
  const holdable = far.filter((h) => !onEdge(h) && !['water', 'road'].includes(terrainAt(m, h)));
  const covered = holdable.filter((h) => GEN.cover.includes(terrainAt(m, h)));
  m.objective = { ...pickFrom(covered.length ? covered : holdable.length ? holdable : far) };
  if (terrainAt(m, m.objective) === 'water') set(m.objective, 'open');
  m.enemies = [{ ...m.objective }];

  // Hexsides along the hex edges, never on the board's edge or by water.
  const g = graph(m.width, m.height);
  const free = (e, also) => e.owners.length === 2 && !m.edges[e.key]
    && e.owners.every((o) => terrainAt(m, o.hex) !== 'water') && also(e.owners.map((o) => terrainAt(m, o.hex)));
  // A run of `len` edges from a corner, heading one way (a hedgerow) or wandering (heading null).
  const run = (from, len, feature, heading, also) => {
    let v = from;
    let prev = null;
    for (let i = 0; i < len; i++) {
      const options = [...v.next].filter(([n, k]) => n !== prev && free(g.edges.get(k), also));
      if (!options.length) return;
      const score = ([n]) => {
        const w = g.vertices.get(n);
        return heading ? (w.x - v.x) * Math.cos(heading) + (w.y - v.y) * Math.sin(heading) : 0;
      };
      const [n, k] = heading ? options.reduce((a, b) => (score(b) > score(a) ? b : a)) : pickFrom(options);
      m.edges[k] = feature;
      prev = v.key;
      v = g.vertices.get(n);
    }
  };
  const cornerOf = (h) => {
    const pts = corners(h);
    return g.vertices.get(vkey(pts[rng.int(6)]));
  };
  // Field boundaries: hedgerows (now and then a stone wall) between fields
  // and along the track, not in the woods, where they would not show.
  const FIELD = ['open', 'scrub', 'road'];
  const fields = all.filter((h) => ['open', 'scrub'].includes(terrainAt(m, h)));
  const hedgerows = Math.round(m.width * m.height * GEN.hedgerows);
  for (let i = 0; fields.length && i < hedgerows; i++) {
    const feature = rng.chance(GEN.fieldWall) ? 'wall' : 'hedge';
    const across = (ts) => ts.every((t) => FIELD.includes(t)) && !ts.every((t) => t === 'road');
    run(cornerOf(pickFrom(fields)), between(rng, GEN.hedgeLen), feature, rng.next() * 2 * Math.PI, across);
  }
  // Yard walls along the farms' buildings.
  for (const yard of yards) {
    const walls = between(rng, GEN.yardWalls);
    const yardSide = (ts) => ts.includes('building') && !ts.every((t) => t === 'building');
    for (let i = 0; i < walls; i++) run(cornerOf(yard), between(rng, GEN.yardWallLen), 'wall', null, yardSide);
  }
  // OPFOR's position: parapets on the side(s) facing BLUFOR's start, unless it holds a building.
  if (terrainAt(m, m.objective) !== 'building' && rng.chance(GEN.parapet)) {
    for (const side of sidesFacing(m.objective, m.start)) m.parapets.push(`${m.objective.col},${m.objective.row},${side}`);
  }
  return m;
}

// ---- forces ----

const passable = (m, balance, h) => inside(m, h) && balance.terrain[terrainAt(m, h)].move !== 'impassable';

// Where the squad starts (formation), or null when one of its hexes is off
// the map, ground nobody can enter, or held by an OPFOR team.
export function deployment(m, balance) {
  const f = formation(m.start);
  const free = (h) => passable(m, balance, h) && !m.enemies.some((e) => same(e, h));
  return Object.values(f).every(free) ? f : null;
}

// Click with the enemy tool: a team there goes, else one comes (up to four).
export function toggleEnemy(m, hex) {
  const i = m.enemies.findIndex((e) => same(e, hex));
  if (i !== -1) {
    m.enemies.splice(i, 1);
    return 'removed';
  }
  if (m.enemies.length >= ENEMY_TEAMS.length) return 'full';
  m.enemies.push({ col: hex.col, row: hex.row });
  return 'added';
}

// A new objective; an enemy team that held the old one moves with it.
export function moveObjective(m, hex) {
  const holder = m.enemies.find((e) => same(e, m.objective));
  if (holder && !m.enemies.some((e) => same(e, hex))) Object.assign(holder, hex);
  m.objective = { col: hex.col, row: hex.row };
}

// The briefing of every map made here: the mission is always to take and
// hold the objective (user decision 2026-10-15).
export function missionBrief(m) {
  const n = m.enemies.length;
  return `Захватить и удержать цель на ${m.objective.col},${m.objective.row}. ${n === 1 ? 'Её обороняет одна группа OPFOR' : `Её обороняют ${count(n, 'группа', 'группы', 'групп')} OPFOR`}.`;
}

// A brief the editor wrote itself (missionBrief), also as it read while maps
// had a turn limit ("... at 5,1 within 12 turns. ...").
const AUTO_BRIEF = /^Take and hold the objective at \d+,\d+(?: within \d+ turns)?\. (?:One OPFOR fireteam defends|\d+ OPFOR fireteams defend) the area\.$/;

const isAutoBrief = (text) => AUTO_BRIEF.test(text ?? '');

// A map saved while there was a turn limit: the limit goes, and so does
// "within N turns" from a brief the editor wrote, also one saved again later
// as fixed text. A brief someone wrote stays as it is.
export function upgradeMapJson(json) {
  const old = json?.mission;
  if (!old) return json;
  const { turns, ...mission } = old;
  if (isAutoBrief(mission.brief)) mission.brief = mission.brief.replace(/ within \d+ turns\./, '.');
  if (turns === undefined && mission.brief === old.brief) return json;
  return { ...json, mission };
}

// What stops the map from being played, in words. Empty: ready.
export function problems(m, balance) {
  const out = [];
  if (!inside(m, m.objective)) out.push('Поставьте цель.');
  else if (!passable(m, balance, m.objective)) out.push('Цель стоит там, куда не пройти.');
  const squad = Object.values(formation(m.start));
  if (!squad.every((h) => inside(m, h))) out.push('Поставьте старт BLUFOR: там отделение не помещается на карте.');
  else if (!squad.every((h) => passable(m, balance, h))) out.push('Подразделение BLUFOR начало бы там, куда не пройти.');
  if (!m.enemies.length) out.push('Поставьте хотя бы одну группу OPFOR.');
  m.enemies.forEach((e, i) => {
    if (!passable(m, balance, e)) out.push(`OPFOR ${ENEMY_TEAMS[i]} стоит там, куда не пройти.`);
  });
  if (squad.some((h) => m.enemies.some((e) => same(e, h)))) out.push('Группа OPFOR стоит там, где начинает BLUFOR.');
  return out;
}

// ---- to and from the map format ----

export function toMapJson(m, balance) {
  const rows = [];
  for (let row = 0; row < m.height; row++) rows.push(m.terrain.slice(row * m.width, (row + 1) * m.width).map((t) => CHAR[t]).join(''));
  // Hexsides: each edge once, on one of its hexes (walls and hedges are shared with the hex beside it).
  const g = graph(m.width, m.height);
  const groups = new Map();
  const put = (hex, side, feature) => {
    const k = `${hex.col},${hex.row},${feature}`;
    if (!groups.has(k)) groups.set(k, { hex: [hex.col, hex.row], sides: [], feature });
    groups.get(k).sides.push(side);
  };
  for (const [k, feature] of Object.entries(m.edges)) {
    const e = g.edges.get(k);
    if (e) put(e.owners[0].hex, e.owners[0].side, feature);
  }
  for (const p of m.parapets) {
    const [col, row, side] = p.split(',');
    put({ col: Number(col), row: Number(row) }, side, 'parapet');
  }
  const units = [];
  const d = deployment(m, balance);
  if (d) {
    units.push({ side: 'BLUFOR', team: 'ALPHA', pos: [d.ALPHA.col, d.ALPHA.row] });
    units.push({ side: 'BLUFOR', team: 'BRAVO', pos: [d.BRAVO.col, d.BRAVO.row] });
    units.push({ side: 'BLUFOR', team: 'SL', kind: 'leader', pos: [d.SL.col, d.SL.row] });
  }
  m.enemies.forEach((e, i) => units.push({ side: 'OPFOR', team: ENEMY_TEAMS[i], pos: [e.col, e.row] }));
  return {
    name: m.name || 'Без названия',
    description: m.description,
    mission: { attacker: 'BLUFOR', defender: 'OPFOR', brief: missionBrief(m) },
    width: m.width,
    height: m.height,
    legend: LEGEND,
    rows,
    objective: [m.objective.col, m.objective.row], // a mission cannot be without one
    hexsides: [...groups.values()],
    units,
  };
}

// What is played on a map, as one string: its terrain, hexsides, BLUFOR's
// start, OPFOR's teams and the objective, not its name or description, and in
// no particular order. Two maps with the same key are the same map: the hub
// won't publish a map that is already published (user decision 2026-10-15).
export function layoutKey(m) {
  const at = (h) => (h ? `${h.col},${h.row}` : '-');
  return JSON.stringify({
    size: [m.width, m.height],
    terrain: m.terrain.map((t) => CHAR[t]).join(''),
    edges: Object.entries(m.edges).map(([k, f]) => `${k}=${f}`).sort(),
    parapets: [...m.parapets].sort(),
    start: at(m.start),
    enemies: m.enemies.map(at).sort(),
    objective: at(m.objective),
  });
}

// A map in the data/maps format, as a model, made what the editor makes
// (fitMap). The editor's squad is ALPHA, BRAVO and the SL in their formation:
// other BLUFOR units (the HMG) are left out, and the start is where the SL
// stood (else the hex behind ALPHA). The briefing is not kept
// (missionBrief writes it); a map without an objective gets one under its
// first OPFOR team.
export function fromMapJson(json) {
  const legend = json.legend ?? LEGEND;
  const terrain = [];
  for (const r of json.rows) for (const c of r) terrain.push(legend[c] ?? 'open');
  const m = newModel({ name: json.name ?? 'Без названия' });
  m.description = json.description ?? '';
  m.width = json.width;
  m.height = json.height;
  m.terrain = terrain;
  for (const entry of json.hexsides ?? []) {
    const hex = { col: entry.hex[0], row: entry.hex[1] };
    for (const side of entry.sides ?? []) {
      if (entry.feature === 'parapet') {
        m.parapets.push(`${hex.col},${hex.row},${side}`);
      } else if (EDGE_FEATURES.includes(entry.feature)) {
        const i = SIDES.indexOf(side);
        const pts = corners(hex);
        m.edges[edgeKey(pts[i], pts[(i + 1) % 6])] = entry.feature;
      }
    }
  }
  const pos = (u) => ({ col: u.pos[0], row: u.pos[1] });
  const blufor = (json.units ?? []).filter((u) => u.side === 'BLUFOR' && (u.kind ?? 'team') === 'team' && !u.type);
  const leader = (json.units ?? []).find((u) => u.side === 'BLUFOR' && u.kind === 'leader');
  if (leader) m.start = pos(leader);
  else if (blufor.length) m.start = neighborOn(pos(blufor[0]), 'SE');
  m.enemies = (json.units ?? []).filter((u) => u.side === 'OPFOR' && (u.kind ?? 'team') === 'team').slice(0, ENEMY_TEAMS.length).map(pos);
  if (json.objective) m.objective = { col: json.objective[0], row: json.objective[1] };
  else if (m.enemies.length) m.objective = { ...m.enemies[0] };
  return fitMap(m);
}
