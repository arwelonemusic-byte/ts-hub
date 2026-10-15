// The map editor's model: a map being made, as plain data (so it can be
// stored, copied for undo and compared), and the pure functions that change
// it. No DOM: editor.js draws it and takes input. toMapJson turns it into the
// format of data/maps/*.json, which parseMap reads; fromMapJson reads one back.
//
// model = {
//   name, description, brief,          // brief: '' = written from the map (defaultBrief)
//   width, height,
//   terrain: ['open', ...],            // row-major, width x height
//   edges: { edgeKey: 'wall' | 'hedge' }, // on the edge between two hexes (or the board's edge)
//   parapets: ['col,row,SIDE', ...],   // just inside one hex, facing out of that side
//   start: { col, row },               // BLUFOR: ALPHA and the SL here, BRAVO beside them
//   objective: { col, row },
//   enemies: [{ col, row }, ...],      // OPFOR fireteams
// }

import { SIDES, corners, neighborOn } from '../sim/hex.js';
import { createRng } from '../sim/rng.js';

export const TERRAINS = ['open', 'road', 'scrub', 'woods', 'rubble', 'building', 'trench', 'water'];
export const LEGEND = { '.': 'open', '=': 'road', ':': 'scrub', T: 'woods', '%': 'rubble', B: 'building', n: 'trench', '~': 'water' };
const CHAR = Object.fromEntries(Object.entries(LEGEND).map(([c, t]) => [t, c]));
export const EDGE_FEATURES = ['wall', 'hedge'];
export const SIZE = { min: 6, max: 30, width: 14, height: 16 };
export const ENEMY_TEAMS = ['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA'];
const DEPLOY = ['E', 'W', 'NE', 'NW', 'SE', 'SW']; // where BRAVO starts beside ALPHA, in order of preference

// The random map: smooth noise fields, a stream or a pond, a road, farms.
const GEN = {
  cell: 3.2,          // hexes per noise cell: the size of woods and scrub patches
  woods: 0.6,         // noise above this: woods
  scrub: 0.5,         // ... above this: scrub
  scatter: 0.8,       // a second field, above this: lone scrub
  stream: 0.5,        // chance of a stream down the map (else maybe a pond)
  pond: 0.7,          // chance of a pond when there is no stream
  pondSize: [3, 7],
  meander: 0.28,      // chance a stream or road shifts a column at each row
  road: 0.75,
  farms: [1, 2],      // farm clusters: a building and one or two more beside it
  ruin: 0.5,          // chance a farm has a ruin next to it
};

const same = (a, b) => a && b && a.col === b.col && a.row === b.row;
export const inside = (m, h) => !!h && h.col >= 0 && h.row >= 0 && h.col < m.width && h.row < m.height;
export const terrainAt = (m, h) => m.terrain[h.row * m.width + h.col];

export function newModel({ width = SIZE.width, height = SIZE.height, name = 'New map' } = {}) {
  const mid = Math.floor(width / 2);
  return {
    name,
    description: '',
    brief: '',
    width,
    height,
    terrain: new Array(width * height).fill('open'),
    edges: {},
    parapets: [],
    start: { col: mid - 1, row: height - 2 },
    objective: { col: mid, row: 2 },
    enemies: [{ col: mid, row: 2 }],
  };
}

export function clone(m) {
  return JSON.parse(JSON.stringify(m));
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

// A new size: the hexes that fit keep their terrain (new ones are grass);
// walls, hedges, parapets and enemies off the map go; the start and the
// objective move onto it.
export function resize(m, width, height) {
  const w = Math.max(SIZE.min, Math.min(SIZE.max, width));
  const h = Math.max(SIZE.min, Math.min(SIZE.max, height));
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

// Random terrain, the same for the same seed: woods and scrub in patches, a
// stream or a pond, a farm track, farms. Walls, hedges and the forces stay;
// the hexes the forces stand on are never water.
export function randomize(m, seed) {
  const rng = createRng(seed);
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
  // Water: a stream down one side, or a pond.
  const third = Math.max(1, Math.floor(m.width / 3));
  if (rng.chance(GEN.stream)) {
    let col = rng.chance(0.5) ? rng.int(third) : m.width - 1 - rng.int(third);
    for (let row = 0; row < m.height; row++) {
      set({ col, row }, 'water');
      if (rng.chance(GEN.meander)) col = Math.max(0, Math.min(m.width - 1, col + (rng.chance(0.5) ? 1 : -1)));
    }
  } else if (rng.chance(GEN.pond)) {
    let h = { col: rng.int(m.width), row: rng.int(m.height) };
    const n = GEN.pondSize[0] + rng.int(GEN.pondSize[1] - GEN.pondSize[0] + 1);
    for (let i = 0; i < n; i++) {
      set(h, 'water');
      const next = neighborOn(h, SIDES[rng.int(6)]);
      if (inside(m, next)) h = next;
    }
  }
  // A farm track from the bottom edge to the top, crossing water at a ford.
  const roadCols = [];
  if (rng.chance(GEN.road)) {
    let col = third + rng.int(Math.max(1, m.width - 2 * third));
    for (let row = m.height - 1; row >= 0; row--) {
      set({ col, row }, 'road');
      roadCols.push({ col, row });
      if (rng.chance(GEN.meander)) col = Math.max(1, Math.min(m.width - 2, col + (rng.chance(0.5) ? 1 : -1)));
    }
  }
  // Farms, beside the track when there is one.
  const farms = GEN.farms[0] + rng.int(GEN.farms[1] - GEN.farms[0] + 1);
  for (let f = 0; f < farms; f++) {
    const near = roadCols.length ? roadCols[rng.int(roadCols.length)] : all[rng.int(all.length)];
    const yard = neighborOn(near, SIDES[rng.int(6)]);
    if (!inside(m, yard)) continue;
    set(yard, 'building');
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
  // Nobody starts in the water.
  for (const h of [m.start, m.objective, ...m.enemies]) {
    if (inside(m, h) && terrainAt(m, h) === 'water') set(h, 'open');
  }
  const bravo = DEPLOY.map((s) => neighborOn(m.start, s)).find((h) => inside(m, h));
  if (bravo && terrainAt(m, bravo) === 'water') set(bravo, 'open');
  return m;
}

// ---- forces ----

const passable = (m, balance, h) => inside(m, h) && balance.terrain[terrainAt(m, h)].move !== 'impassable';

// Where the squad starts: ALPHA and the SL on the start hex, BRAVO on the
// first open hex beside it. Null when the start or every hex beside it is blocked.
export function deployment(m, balance) {
  if (!passable(m, balance, m.start) || m.enemies.some((e) => same(e, m.start))) return null;
  const bravo = DEPLOY.map((s) => neighborOn(m.start, s)).find((h) => passable(m, balance, h) && !m.enemies.some((e) => same(e, h)));
  return bravo ? { ALPHA: m.start, BRAVO: bravo, SL: m.start } : null;
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

export function defaultBrief(m) {
  const n = m.enemies.length;
  const o = m.objective ? `${m.objective.col},${m.objective.row}` : '?';
  return `Take and hold the objective at ${o}. ${n === 1 ? 'One OPFOR fireteam defends' : `${n} OPFOR fireteams defend`} the area.`;
}

// A brief the editor wrote itself (defaultBrief), also as it read while maps
// had a turn limit ("... at 5,1 within 12 turns. ...").
const AUTO_BRIEF = /^Take and hold the objective at \d+,\d+(?: within \d+ turns)?\. (?:One OPFOR fireteam defends|\d+ OPFOR fireteams defend) the area\.$/;

export const isAutoBrief = (text) => AUTO_BRIEF.test(text ?? '');

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
  if (!inside(m, m.objective)) out.push('Place the objective.');
  else if (!passable(m, balance, m.objective)) out.push('The objective is on ground nobody can enter.');
  if (!inside(m, m.start)) out.push('Place the BLUFOR start.');
  else if (!passable(m, balance, m.start)) out.push('The BLUFOR start is on ground nobody can enter.');
  else if (!deployment(m, balance)) out.push('BRAVO has no open hex beside the BLUFOR start.');
  if (!m.enemies.length) out.push('Place at least one OPFOR team.');
  m.enemies.forEach((e, i) => {
    if (!passable(m, balance, e)) out.push(`OPFOR ${ENEMY_TEAMS[i]} is on ground nobody can enter.`);
  });
  const d = deployment(m, balance);
  if (d && m.enemies.some((e) => same(e, d.ALPHA) || same(e, d.BRAVO))) out.push('An OPFOR team stands where BLUFOR starts.');
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
    name: m.name || 'Untitled',
    description: m.description,
    mission: { attacker: 'BLUFOR', defender: 'OPFOR', brief: m.brief || defaultBrief(m) },
    width: m.width,
    height: m.height,
    legend: LEGEND,
    rows,
    objective: inside(m, m.objective) ? [m.objective.col, m.objective.row] : null,
    hexsides: [...groups.values()],
    units,
  };
}

// A map in the data/maps format, as a model. The editor's squad is ALPHA,
// BRAVO and the SL: other BLUFOR units (the HMG) are left out, and the start
// is where ALPHA stood.
export function fromMapJson(json) {
  const width = json.width;
  const height = json.height;
  const legend = json.legend ?? LEGEND;
  const terrain = [];
  for (const r of json.rows) for (const c of r) terrain.push(legend[c] ?? 'open');
  const m = newModel({ width, height, name: json.name ?? 'Untitled' });
  m.description = json.description ?? '';
  const brief = json.mission?.brief ?? '';
  m.brief = isAutoBrief(brief) ? '' : brief; // the editor's own brief is written again from the map
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
  if (blufor.length) m.start = pos(blufor[0]);
  m.enemies = (json.units ?? []).filter((u) => u.side === 'OPFOR' && (u.kind ?? 'team') === 'team').slice(0, ENEMY_TEAMS.length).map(pos);
  if (json.objective) m.objective = { col: json.objective[0], row: json.objective[1] };
  return m;
}
