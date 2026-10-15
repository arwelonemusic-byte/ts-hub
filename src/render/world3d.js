// The board, in 3D: a low-poly diorama drawn with three.js (vendor/three).
// The only map view, in the game and in the editor.
//
// The terrain is built from the map (again whenever the editor changes it):
// hexes of faceted ground on a slab of earth, with trees, houses, a ruin,
// walls, hedges, parapets and the trench standing on it. The marks (moves,
// fire zones, paths, lines of fire, suspected contacts) are drawn by
// render/hexmap.js onto a canvas that the ground's shader lays over the
// terrain. Units are little figures, one per soldier (crouched when
// suppressed, prone when pinned), with their counter floating above them.
// The camera (createWorld().camera) picks, pans, zooms, turns and fits.

import * as THREE from '../../vendor/three/three.module.js';
import { center, corners, mapBounds, neighbors, SIDES } from '../sim/hex.js';
import { inBounds, terrainName } from '../sim/map.js';
import { drawBang, drawCounters, drawObjective } from './hexmap.js';

const SQRT3 = Math.sqrt(3);
const UP = new THREE.Vector3(0, 1, 0);

// ---- look ----

const SKY = '#171b1e';    // background and fog: the dark of the TS apps
const TABLE = '#1f2427';  // what the board stands on
const LIGHT = {
  sky: '#eaf4ff', ground: '#5b5236', hemi: 1.25,
  sun: '#fff0d4', power: 2.7, from: [-0.48, 0.78, -0.4], // from the upper left (north-west), like the other views
  fill: '#cfe0ff', fillPower: 0.35,
  shadowMap: 4096, bias: -0.0004, normalBias: 0.025, radius: 3,
};
const FOG = { near: 10, far: 48 }; // past the camera's target
const EXPOSURE = 1.05;

// Heights (world units: a hex has circumradius 1).
const LEVEL = { bed: -0.3, water: -0.09, base: -1.05, lip: -0.07, road: 0.014, trench: 0.01, bank: 0.05 };
const EARTH = [{ to: -0.36, color: '#6e4a2b' }, { to: -0.7, color: '#8b6340' }, { to: LEVEL.base, color: '#a0774f' }];
// Ground relief: each hex's triangles are lifted or sunk by up to half this.
const BUMP = { open: 0.05, road: 0, scrub: 0.06, woods: 0.07, rubble: 0.06, building: 0.02, trench: 0, water: 0.04 };
const INNER = 0.52; // inner ring of a hex's triangles, as a share of the way to its side midpoints
const SHADE = { ground: 0.1, object: 0.12 }; // each triangle's colour varies by this much

const GROUND = {
  open: ['#8dc455', '#84bb4c', '#96cb5d', '#7eb348'],
  road: ['#8dc455', '#84bb4c', '#96cb5d', '#7eb348'],
  scrub: ['#a6b95c', '#9aaf52', '#b0c266'],
  woods: ['#5e9b3e', '#559137', '#67a545'],
  rubble: ['#a89d88', '#9c917c', '#b3a893'],
  building: ['#9bc85c', '#91bf54', '#a5cf66'],
  trench: ['#a2b25c', '#a9a764', '#99ab56'],
  water: ['#2e7a86', '#28707c', '#33838f'], // the bed, seen through the water
};
const WATER = { colors: ['#3aa8d8', '#43b1df', '#3399ca'], glass: '#2f8fbf', opacity: 0.84, wave: 0.022, speed: 1.3 };
const ROAD = { width: 0.38, colors: ['#d6b47d', '#cca874', '#dcbc88'] };

const TREE = {
  trunk: '#7a5232',
  conifer: ['#2f7d3b', '#3a8c45', '#276f37', '#45944a'],
  broadleaf: ['#6db33f', '#82c043', '#5ea43a', '#93c84a'],
  coniferShare: 0.6,
  woods: { n: 7, ring: 0.6, size: [0.85, 1.2] }, // a ring of trees round a clearing where units stand
};
const BUSH = ['#4f8f35', '#5e9e3c', '#3f7d2e', '#6aa845'];
const ROCK = ['#9a958b', '#8a857c', '#aaa59a'];
const TUFT = ['#6fae3e', '#7cba45', '#64a338'];
const FLOWER = ['#ffe066', '#fff7e8', '#d7a6ff'];
const HOUSES = [
  { w: 0.78, d: 0.52, h: 0.38, roof: 0.28, wall: '#f1e6cf', top: '#c8553d', chimney: true },
  { w: 0.9, d: 0.58, h: 0.42, roof: 0.3, wall: '#a8473a', top: '#5f5c58', barn: true },
  { w: 0.72, d: 0.55, h: 0.4, roof: 0.26, wall: '#e9e4d8', top: '#4f5b66', chimney: true },
];
const HOUSE = { back: 0.36, eave: 0.06, door: '#6b4226', window: '#3c5873', chimney: '#9a8d7e' };
const RUIN = { w: 0.8, d: 0.55, h: 0.36, thick: 0.06, plaster: '#d4c8ae', brick: '#a85d42', beam: '#4a3b2c', debris: ['#8e877c', '#a39b8e', '#a85d42'] };
const WALL = { stones: 5, height: 0.17, thick: 0.1, cap: 0.035, colors: ['#aaa397', '#948d81', '#bcb5a8'] };
const HEDGE = { n: 7, r: 0.12, colors: ['#3e7a2e', '#4c8a36', '#356d28'] };
const BAGS = { perRow: 6, rows: 2, h: 0.06, d: 0.1, inset: 0.12, colors: ['#c8ad78', '#bba06a', '#d1b886'] };
const TRENCH = { zig: 0.15, width: 0.24, floor: '#4b3826', berm: 0.11, bermH: 0.07, colors: ['#9a7b52', '#8d7049'] };
const FLAG = { at: { x: 0.42, y: -0.45 }, height: 0.95, w: 0.36, h: 0.22, color: '#d93a2b', pole: '#e2ddd0', ball: '#e8b830' };
const OBJECTIVE_INK = '#ffd34d';

// Units.
const FIGURE = {
  scale: 1.15,
  BLUFOR: { uniform: '#3f74ad', pants: '#2f5682', helmet: '#24466e', pack: '#355c84' },
  OPFOR: { uniform: '#b0473a', pants: '#83352c', helmet: '#6a2820', pack: '#8c4034' },
  skin: '#e3b48a', gun: '#2a2a2a', ghost: 0.35,
  slots: [[0, -0.2], [-0.24, 0], [0.24, 0.02], [0.02, 0.22]], // TL in front; forward is -z before turning
  proneSpread: 1.3,
  stack: { x: -0.36, y: 0.58 }, // the SL's spot when he shares a hex with a team: in front, so the counters do not overlap
  bob: 0.035, stride: 24, turnRate: 7,
};
// A unit is picked by its counter and the figures below it: a column from
// the counter (half sizes in counter units; the SL's counter is smaller) down
// to `foot` world units below where it stands.
const BANNER = {
  px: 256, scale: 120, size: 1.35, lift: { team: 0.8, leader: 0.56 }, // the SL's smaller counter floats lower
  pick: { team: { w: 0.62, h: 0.56 }, leader: { w: 0.42, h: 0.4 }, foot: 0.12 },
  hover: { grow: 1.1 }, // the counter under the pointer: a little bigger, with a yellow halo (hexmap.js)
};
const SELECT = { radius: 0.62, width: 4, ink: '#ffffff', edge: 'rgba(21, 24, 26, 0.6)' };
const BANG = { px: 128, lift: 0.42, size: 0.85, puffs: 3, puff: '#e9e4da' };
const TRACER = { per: 3, gap: 0.3, speed: 3.2, len: 0.3, thick: 0.025, from: 0.24, to: 0.16, BLUFOR: '#ffe08a', OPFOR: '#ff9a6a' };

// The marks layer laid over the ground: drawn as the flat map would be at `look`
// pixels per unit, stored at `texels` per unit.
// The ground's layers, canvases the size of the board: drawn as the flat map
// would be at `look` pixels per unit, stored at `texels` per unit. The grid is
// painted into the ground (things standing on it hide it); the marks (hover,
// moves, fire, paths, the selection, the objective) lie on the ground but are
// drawn over everything, so nothing standing on the board hides them.
const OVERLAY = { look: 40, texels: 64, glow: 0.45, marksOrder: 5 };
const GRID = { ink: 'rgba(18, 34, 10, 0.2)', width: 1.2 }; // faint hex outlines on the ground

// Camera: distance from its target, and the angle it looks down at (radians),
// low when close, steep when far.
const CAM = {
  fov: 30, near: 0.1, far: 400, minDist: 6, maxDist: 80, pitchNear: 0.6, pitchFar: 1.02, tilt: [-0.3, 0.35],
  fitMargin: 0.94, turnStep: Math.PI / 4, turnRate: 9, orbitPerPx: 0.006, tiltPerPx: 0.004, roam: 2,
};

// ---- small helpers ----

function hash(...n) {
  let h = 2166136261;
  for (const v of n) {
    h = Math.imul(h ^ (v | 0), 16777619);
    h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const colorCache = new Map();
const color = (hex) => {
  if (!colorCache.has(hex)) colorCache.set(hex, new THREE.Color(hex));
  return colorCache.get(hex);
};
const pick = (list, r) => list[Math.floor(r * list.length) % list.length];
// A colour from the list, its lightness varied a little. One scratch colour: use it at once.
const shaded = new THREE.Color();
const shadeOf = (list, r, amount) => shaded.copy(color(pick(list, r))).multiplyScalar(1 + (((r * list.length) % 1) - 0.5) * amount);
const seedOf = (r) => Math.floor(r * 1e6);

function at(x, y, z, ry = 0, sx = 1, sy = sx, sz = sx, rx = 0, rz = 0) {
  return new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V(sx, sy, sz));
}

// Turning about y so that local +x runs along (dx, dz).
const along = (dx, dz) => Math.atan2(-dz, dx);

// Push every vertex in or out a little, the same for vertices in the same place, so the shape stays closed.
function lumpy(geo, amount, seed) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 1 + (hash(seed, Math.round(x * 997), Math.round(y * 997), Math.round(z * 997)) - 0.5) * 2 * amount;
    p.setXYZ(i, x * k, y * k, z * k);
  }
  return g;
}

// Shapes are built once at unit size and kept as bare triangle corners; a
// call says how big it wants one. Rebuilding the board (the editor does it on
// every change) then only copies and moves numbers.
const shapes = new Map();
function shape(key, make) {
  if (!shapes.has(key)) {
    const g = make();
    const flat = g.index ? g.toNonIndexed() : g;
    shapes.set(key, flat.attributes.position.array.slice());
    g.dispose();
    flat.dispose();
  }
  return shapes.get(key);
}
const LUMPS = 6; // blobs and rocks come in this many shapes, turned at random
const box = (w, h, d) => ({ pos: shape('box', () => new THREE.BoxGeometry(1, 1, 1)), s: [w, h, d] });
const cone = (r, h, n = 7) => ({ pos: shape(`cone${n}`, () => new THREE.ConeGeometry(1, 1, n)), s: [r, h, r] });
const cyl = (r0, r1, h, n = 6) => {
  const taper = Math.round((r0 / r1) * 100) / 100;
  return { pos: shape(`cyl${taper}|${n}`, () => new THREE.CylinderGeometry(taper, 1, 1, n)), s: [r1, h, r1] };
};
const blob = (r, seed, lump = 0.18) => ({ pos: shape(`blob${seed % LUMPS}|${lump}`, () => lumpy(new THREE.IcosahedronGeometry(1, 0), lump, seed % LUMPS)), s: [r, r, r] });
const rock = (r, seed) => ({ pos: shape(`rock${seed % LUMPS}`, () => lumpy(new THREE.DodecahedronGeometry(1, 0), 0.22, seed % LUMPS)), s: [r, r, r] });

// Two-number hash for per-face shading in the hot loop.
function hash2(a, b) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be59b, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Collects triangles with a colour each into one geometry (one draw call).
class Mesher {
  constructor() {
    this.pos = new Float32Array(1 << 15);
    this.col = new Float32Array(1 << 15);
    this.n = 0;
  }

  vertex(x, y, z, r, g, b) {
    if (this.n + 3 > this.pos.length) {
      const pos = new Float32Array(this.pos.length * 2);
      const col = new Float32Array(this.col.length * 2);
      pos.set(this.pos);
      col.set(this.col);
      this.pos = pos;
      this.col = col;
    }
    const n = this.n;
    this.pos[n] = x;
    this.pos[n + 1] = y;
    this.pos[n + 2] = z;
    this.col[n] = r;
    this.col[n + 1] = g;
    this.col[n + 2] = b;
    this.n = n + 3;
  }

  // A triangle, wound to face `toward` when given.
  tri(a, b, c, rgb, toward = null) {
    if (toward) {
      const ux = b.x - a.x;
      const uy = b.y - a.y;
      const uz = b.z - a.z;
      const vx = c.x - a.x;
      const vy = c.y - a.y;
      const vz = c.z - a.z;
      const dot = (uy * vz - uz * vy) * toward.x + (uz * vx - ux * vz) * toward.y + (ux * vy - uy * vx) * toward.z;
      if (dot < 0) [b, c] = [c, b];
    }
    this.vertex(a.x, a.y, a.z, rgb.r, rgb.g, rgb.b);
    this.vertex(b.x, b.y, b.z, rgb.r, rgb.g, rgb.b);
    this.vertex(c.x, c.y, c.z, rgb.r, rgb.g, rgb.b);
  }

  quad(a, b, c, d, rgb, toward) {
    this.tri(a, b, c, rgb, toward);
    this.tri(a, c, d, rgb, toward);
  }

  // A shape (from box, cone, ... or a three.js geometry), sized and moved into
  // place; each face's colour varies a little.
  add(src, matrix, hex, r = 0) {
    let p = src.pos;
    let [sx, sy, sz] = src.s ?? [1, 1, 1];
    if (src.isBufferGeometry) {
      p = (src.index ? src.toNonIndexed() : src).attributes.position.array;
      sx = sy = sz = 1;
    }
    const e = matrix.elements;
    const base = color(hex);
    const seed = seedOf(r);
    for (let i = 0, f = 0; i < p.length; i += 9, f++) {
      const k = 1 + (hash2(seed, f) - 0.5) * SHADE.object;
      const cr = base.r * k;
      const cg = base.g * k;
      const cb = base.b * k;
      for (let v = i; v < i + 9; v += 3) {
        const x = p[v] * sx;
        const y = p[v + 1] * sy;
        const z = p[v + 2] * sz;
        this.vertex(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14], cr, cg, cb);
      }
    }
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, this.n), 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col.slice(0, this.n), 3));
    g.computeVertexNormals();
    return g;
  }
}

// ---- the board ----

function forEachHex(map, fn) {
  for (let row = 0; row < map.height; row++) {
    for (let col = 0; col < map.width; col++) fn({ col, row }, terrainName(map, { col, row }));
  }
}

// A hex's points: center, six inner points (toward the side midpoints) and
// twelve round the edge (corner, side midpoint, corner, ...: side i runs from
// outer[2i] through outer[2i+1] to outer[2i+2]).
function hexPoints(h) {
  const c = center(h);
  const pts = corners(h);
  const outer = [];
  for (let i = 0; i < 6; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % 6];
    outer.push(p, { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
  }
  const inner = Array.from({ length: 6 }, (_, i) => ({ x: c.x + (outer[2 * i + 1].x - c.x) * INNER, y: c.y + (outer[2 * i + 1].y - c.y) * INNER }));
  return { c, outer, inner };
}

const vkey = (p) => [Math.round(p.x * 1000), Math.round(p.y * 1000)];

// Height of the land at an edge point: shared by every hex that meets there,
// and as flat as the flattest of them (roads and trenches stay level).
function landHeights(map) {
  const amp = new Map();
  forEachHex(map, (h, t) => {
    if (t === 'water') return;
    for (const p of hexPoints(h).outer) {
      const k = vkey(p).join();
      amp.set(k, Math.min(amp.get(k) ?? Infinity, BUMP[t]));
    }
  });
  return (p) => {
    const [kx, kz] = vkey(p);
    return (amp.get(`${kx},${kz}`) ?? 0) * (hash(kx, kz, 1) - 0.5);
  };
}

const bedHeight = (p) => {
  const [kx, kz] = vkey(p);
  return LEVEL.bed + BUMP.water * (hash(kx, kz, 2) - 0.5);
};

// Twenty-four triangles: a fan round the center, then a strip out to the edge.
function hexFaces(m, h, outerY, innerY, colors, r, salt) {
  const { c, outer, inner } = hexPoints(h);
  const C = V(c.x, innerY(6), c.y);
  const I = inner.map((p, i) => V(p.x, innerY(i), p.y));
  const O = outer.map((p) => V(p.x, outerY(p), p.y));
  let n = 0;
  const face = (a, b, d) => m.tri(a, b, d, shadeOf(colors, r(salt + n++), SHADE.ground), UP);
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6;
    face(C, I[i], I[j]);
    face(I[i], O[2 * i], O[2 * i + 1]);
    face(I[i], O[2 * i + 1], O[(2 * i + 2) % 12]);
    face(I[i], O[(2 * i + 2) % 12], I[j]);
  }
}

// A vertical face along a line of edge points, from the top down through bands of colour.
function wall(m, line, topY, bands, toward) {
  for (let s = 0; s < line.length - 1; s++) {
    const p = line[s];
    const q = line[s + 1];
    let ya = topY(p);
    let yb = topY(q);
    for (const band of bands) {
      if (Math.max(ya, yb) <= band.to) continue;
      const la = Math.min(ya, band.to);
      const lb = Math.min(yb, band.to);
      m.quad(V(p.x, ya, p.y), V(q.x, yb, q.y), V(q.x, lb, q.y), V(p.x, la, p.y), color(band.color), toward);
      ya = la;
      yb = lb;
    }
  }
}

function buildBoard(map) {
  const ground = new Mesher(); // takes the grid layer
  const top = new Mesher();    // the surface the marks lie on: the ground, and the water's surface
  const sides = new Mesher();  // the slab's edge and the banks
  const water = new Mesher();
  const things = new Mesher();
  const landY = landHeights(map);
  const isWater = (h) => inBounds(map, h) && terrainName(map, h) === 'water';

  forEachHex(map, (h, t) => {
    const r = (i) => hash(h.col, h.row, i);
    const wet = t === 'water';
    hexFaces(ground, h, wet ? bedHeight : landY, (i) => (wet ? LEVEL.bed : 0) + BUMP[t] * (r(100 + i) - 0.5), GROUND[t], r, 200);
    if (wet) hexFaces(water, h, () => LEVEL.water, () => LEVEL.water, WATER.colors, r, 300);
    if (wet) hexFaces(top, h, () => LEVEL.water, () => LEVEL.water, WATER.colors, r, 300);
    else hexFaces(top, h, landY, (i) => BUMP[t] * (r(100 + i) - 0.5), GROUND[t], r, 200);

    const { c, outer } = hexPoints(h);
    neighbors(h).forEach((n, i) => {
      const line = [outer[2 * i], outer[2 * i + 1], outer[(2 * i + 2) % 12]];
      const mid = outer[2 * i + 1];
      if (!inBounds(map, n)) {
        // The board's edge: a lip of this hex's ground, then bands of earth.
        const out = V(mid.x - c.x, 0, mid.y - c.y);
        const lip = '#' + color(pick(GROUND[t], r(400 + i))).clone().multiplyScalar(0.82).getHexString();
        wall(sides, line, wet ? bedHeight : landY, [{ to: LEVEL.lip, color: lip }, ...EARTH], out);
        if (wet) wall(water, line, () => LEVEL.water, [{ to: LEVEL.bed - BUMP.water, color: WATER.glass }], out);
      } else if (wet && !isWater(n)) {
        // A bank: the land drops to the bed.
        const into = V(c.x - mid.x, 0, c.y - mid.y);
        const nt = terrainName(map, n);
        wall(sides, line, landY, [{ to: -LEVEL.bank, color: pick(GROUND[nt], r(410 + i)) }, { to: LEVEL.bed - BUMP.water, color: EARTH[0].color }], into);
      }
    });

    if (t === 'road') road(ground, map, h);
    else if (t === 'trench') trench(ground, things, h, r);
    else if (t === 'woods') woods(things, c, r);
    else if (t === 'scrub') scrub(things, c, r);
    else if (t === 'open') meadow(things, c, r);
    else if (t === 'building') farm(things, c, r);
    else if (t === 'rubble') ruin(things, c.x, c.y - HOUSE.back, (Math.floor(r(2) * 3) * Math.PI) / 3 + (r(3) - 0.5) * 0.2, r);
  });
  hexsides(things, map);
  return { ground: ground.build(), top: top.build(), sides: sides.build(), water: water.build(), things: things.build() };
}

// A dirt track from the hex center to each neighbouring road hex; off the board
// edge when the road leaves it; a dead end stops at the center.
function road(m, map, h) {
  const { c, outer } = hexPoints(h);
  const ns = neighbors(h);
  const isRoad = (n) => inBounds(map, n) && terrainName(map, n) === 'road';
  const ends = [];
  ns.forEach((n, i) => {
    if (isRoad(n)) ends.push(i);
  });
  if (ends.length === 1 && !inBounds(map, ns[(ends[0] + 3) % 6])) ends.push((ends[0] + 3) % 6);
  const r = (i) => hash(h.col, h.row, 500 + i);
  const w = ROAD.width / 2;
  const y = LEVEL.road;
  ends.forEach((i, k) => {
    const e = outer[2 * i + 1];
    const dx = e.x - c.x;
    const dz = e.y - c.y;
    const len = Math.hypot(dx, dz);
    const nx = (-dz / len) * w;
    const nz = (dx / len) * w;
    m.quad(V(c.x + nx, y, c.y + nz), V(e.x + nx, y, e.y + nz), V(e.x - nx, y, e.y - nz), V(c.x - nx, y, c.y - nz), shadeOf(ROAD.colors, r(k), SHADE.ground), UP);
  });
  // Round the joint.
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    const b = (Math.PI / 3) * (i + 1);
    m.tri(V(c.x, y, c.y), V(c.x + Math.cos(a) * w, y, c.y + Math.sin(a) * w), V(c.x + Math.cos(b) * w, y, c.y + Math.sin(b) * w), shadeOf(ROAD.colors, r(10 + i), SHADE.ground), UP);
  }
}

// A zig-zag trench across the hex, west side to east side, so neighbouring trench hexes join.
function trench(groundM, things, h, r) {
  const c = center(h);
  const half = SQRT3 / 2;
  const n = 6;
  const pts = Array.from({ length: n + 1 }, (_, i) => ({ x: c.x - half + (i * 2 * half) / n, y: c.y + (i === 0 || i === n ? 0 : (i % 2 ? -1 : 1) * TRENCH.zig) }));
  const w = TRENCH.width / 2;
  const floor = color(TRENCH.floor);
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dz = b.y - a.y;
    const len = Math.hypot(dx, dz);
    const nx = -dz / len;
    const nz = dx / len;
    const y = LEVEL.trench;
    groundM.quad(V(a.x + nx * w, y, a.y + nz * w), V(b.x + nx * w, y, b.y + nz * w), V(b.x - nx * w, y, b.y - nz * w), V(a.x - nx * w, y, a.y - nz * w), floor, UP);
    if (i) {
      for (let k = 0; k < 6; k++) {
        const t0 = (Math.PI / 3) * k;
        const t1 = (Math.PI / 3) * (k + 1);
        groundM.tri(V(a.x, y, a.y), V(a.x + Math.cos(t0) * w, y, a.y + Math.sin(t0) * w), V(a.x + Math.cos(t1) * w, y, a.y + Math.sin(t1) * w), floor, UP);
      }
    }
    for (const s of [1, -1]) {
      const off = s * (w + TRENCH.berm / 2);
      things.add(box(len + 0.05, TRENCH.bermH, TRENCH.berm), at((a.x + b.x) / 2 + nx * off, TRENCH.bermH / 2 - 0.01, (a.y + b.y) / 2 + nz * off, along(dx, dz)), pick(TRENCH.colors, r(600 + i * 2 + (s > 0 ? 0 : 1))), r(620 + i));
    }
  }
}

function conifer(m, x, z, s, r) {
  const ry = r(0) * Math.PI * 2;
  m.add(cyl(0.035 * s, 0.05 * s, 0.22 * s, 5), at(x, 0.11 * s, z, ry), TREE.trunk, r(1));
  const green = pick(TREE.conifer, r(2));
  [[0.3, 0.38, 0.16], [0.235, 0.33, 0.36], [0.16, 0.3, 0.55]].forEach(([rad, h, y], i) => {
    const tier = '#' + color(green).clone().multiplyScalar(0.92 + i * 0.07).getHexString();
    m.add(cone(rad * s, h * s, 7), at(x, (y + h / 2) * s, z, ry + i * 0.4), tier, r(3 + i));
  });
}

function broadleaf(m, x, z, s, r) {
  const ry = r(0) * Math.PI * 2;
  m.add(cyl(0.035 * s, 0.055 * s, 0.36 * s, 5), at(x, 0.18 * s, z, ry), TREE.trunk, r(1));
  const green = pick(TREE.broadleaf, r(2));
  m.add(blob(0.27 * s, seedOf(r(6))), at(x, 0.52 * s, z, ry, 1, 1.05, 1), green, r(3));
  if (r(4) < 0.5) {
    const a = r(7) * Math.PI * 2;
    const lighter = '#' + color(green).clone().multiplyScalar(1.08).getHexString();
    m.add(blob(0.17 * s, seedOf(r(8))), at(x + Math.cos(a) * 0.14 * s, 0.64 * s, z + Math.sin(a) * 0.14 * s, ry), lighter, r(5));
  }
}

function bush(m, x, z, rad, r) {
  m.add(blob(rad, seedOf(r(0)), 0.2), at(x, rad * 0.55, z, r(1) * 6, 1, 0.75, 1), pick(BUSH, r(2)), r(3));
}

function stone(m, x, z, rad, r, list = ROCK) {
  m.add(rock(rad, seedOf(r(0))), at(x, rad * 0.25, z, r(1) * 6, 1, 0.6, 1), pick(list, r(2)), r(3));
}

const sub = (r, base) => (i) => r(base + i);

function woods(m, c, r) {
  const turn = r(1) * Math.PI * 2;
  const [s0, s1] = TREE.woods.size;
  for (let i = 0; i < TREE.woods.n; i++) {
    const a = turn + (i * Math.PI * 2) / TREE.woods.n + (r(30 + i) - 0.5) * 0.4;
    const ring = TREE.woods.ring + (r(10 + i) - 0.5) * 0.16;
    const s = s0 + r(50 + i) * (s1 - s0);
    const fn = r(40 + i) < TREE.coniferShare ? conifer : broadleaf;
    fn(m, c.x + Math.cos(a) * ring, c.y + Math.sin(a) * ring, s, sub(r, 1000 + i * 20));
  }
  for (let i = 0; i < 2; i++) {
    const a = turn + Math.PI / 7 + i * Math.PI;
    bush(m, c.x + Math.cos(a) * 0.36, c.y + Math.sin(a) * 0.36, 0.09, sub(r, 1300 + i * 10));
  }
}

function scrub(m, c, r) {
  const n = 7;
  for (let i = 0; i < n; i++) {
    const ring = 0.25 + 0.5 * Math.sqrt((i + r(10 + i)) / n);
    const a = i * 2.4 + r(1) * Math.PI * 2;
    bush(m, c.x + Math.cos(a) * ring, c.y + Math.sin(a) * ring, 0.09 + r(20 + i) * 0.07, sub(r, 1000 + i * 10));
  }
  for (let i = 0; i < 2; i++) {
    const a = r(60 + i) * Math.PI * 2;
    stone(m, c.x + Math.cos(a) * 0.55, c.y + Math.sin(a) * 0.55, 0.045 + r(62 + i) * 0.03, sub(r, 1200 + i * 10));
  }
  if (r(70) < 0.35) {
    const a = r(71) * Math.PI * 2;
    conifer(m, c.x + Math.cos(a) * 0.62, c.y + Math.sin(a) * 0.62, 0.55, sub(r, 1400));
  }
}

// Open ground: a few tufts of grass, now and then flowers or a stone.
function meadow(m, c, r) {
  for (let i = 0; i < 4; i++) {
    const a = r(10 + i) * Math.PI * 2;
    const d = 0.35 + r(20 + i) * 0.4;
    const x = c.x + Math.cos(a) * d;
    const z = c.y + Math.sin(a) * d;
    for (let k = 0; k < 3; k++) {
      const h = 0.07 + r(30 + i * 3 + k) * 0.05;
      m.add(cone(0.016, h, 3), at(x + (k - 1) * 0.022, h / 2, z + (r(40 + k) - 0.5) * 0.03, r(50 + k) * 3, 1, 1, 1, (r(60 + k) - 0.5) * 0.6, (k - 1) * 0.35), pick(TUFT, r(70 + i)), r(80 + i));
    }
  }
  if (r(90) < 0.35) {
    const a = r(91) * Math.PI * 2;
    const hue = pick(FLOWER, r(92));
    for (let k = 0; k < 4; k++) {
      m.add(new THREE.IcosahedronGeometry(0.018, 0), at(c.x + Math.cos(a) * 0.55 + (r(93 + k) - 0.5) * 0.12, 0.035, c.y + Math.sin(a) * 0.55 + (r(97 + k) - 0.5) * 0.12), hue, r(101 + k));
    }
  }
  if (r(110) < 0.15) {
    const a = r(111) * Math.PI * 2;
    stone(m, c.x + Math.cos(a) * 0.6, c.y + Math.sin(a) * 0.6, 0.05, sub(r, 1500));
  }
}

// A farm building at the back of the hex (units stand in front), a tree and bushes beside it.
function farm(m, c, r) {
  const kind = HOUSES[Math.floor(r(1) * HOUSES.length) % HOUSES.length];
  const rot = (Math.floor(r(2) * 3) * Math.PI) / 3 + (r(3) - 0.5) * 0.1;
  house(m, c.x, c.y - HOUSE.back, rot, kind, r);
  const side = r(4) < 0.5 ? -1 : 1;
  broadleaf(m, c.x + side * 0.62, c.y + 0.25, 0.8, sub(r, 1600));
  bush(m, c.x - side * 0.55, c.y + 0.45, 0.1, sub(r, 1700));
  bush(m, c.x - side * 0.68, c.y + 0.2, 0.08, sub(r, 1710));
}

function house(m, x, z, rot, k, r) {
  const base = at(x, 0, z, rot);
  const put = (geo, lx, ly, lz, hex, seed, ry = 0) => m.add(geo, base.clone().multiply(at(lx, ly, lz, ry)), hex, seed);
  const { w, d, h } = k;
  put(box(w, h, d), 0, h / 2, 0, k.wall, r(10));
  // Gable roof, ridge along x: its planes pass through the wall tops and run on to the eaves.
  const o = HOUSE.eave;
  const ridge = h + k.roof;
  const drop = (k.roof * o) / (d / 2);
  const ex = w / 2 + o;
  const ez = d / 2 + o;
  const P = (px, py, pz) => V(px, py, pz).applyMatrix4(base);
  const roof = color(k.top);
  const e1 = P(-ex, h - drop, ez);
  const e2 = P(ex, h - drop, ez);
  const e3 = P(ex, h - drop, -ez);
  const e4 = P(-ex, h - drop, -ez);
  const r1 = P(-ex, ridge, 0);
  const r2 = P(ex, ridge, 0);
  const front = roof.clone().multiplyScalar(1.04);
  m.quad(e1, e2, r2, r1, front, V(0, 1, 1).transformDirection(base));
  m.quad(e3, e4, r1, r2, roof, V(0, 1, -1).transformDirection(base));
  const gable = color(k.wall).clone().multiplyScalar(0.94);
  for (const s of [-1, 1]) {
    m.tri(P((s * w) / 2, h, d / 2), P((s * w) / 2, h, -d / 2), P((s * w) / 2, ridge, 0), gable, V(s, 0, 0).transformDirection(base));
  }
  if (k.chimney) put(box(0.08, 0.3, 0.08), w * 0.25, h + k.roof * 0.55, -d * 0.12, HOUSE.chimney, r(11));
  if (k.barn) {
    put(box(0.24, 0.3, 0.02), 0, 0.15, d / 2 + 0.008, HOUSE.door, r(12));
  } else {
    put(box(0.11, 0.19, 0.02), -w * 0.22, 0.095, d / 2 + 0.008, HOUSE.door, r(12));
    for (const wx of [0.06, 0.26]) put(box(0.09, 0.09, 0.016), w * wx, h * 0.58, d / 2 + 0.006, HOUSE.window, r(13));
  }
  for (const wx of [-0.25, 0.15]) put(box(0.09, 0.09, 0.016), w * wx, h * 0.58, -d / 2 - 0.006, HOUSE.window, r(14));
  for (const s of [-1, 1]) put(box(0.016, 0.09, 0.09), (s * w) / 2 + s * 0.006, h * 0.58, 0, HOUSE.window, r(15));
}

// A shelled house: broken walls, fallen beams, heaps of rubble.
function ruin(m, x, z, rot, r) {
  const base = at(x, 0, z, rot);
  const put = (geo, lx, ly, lz, hex, seed, ry = 0, rz = 0) => m.add(geo, base.clone().multiply(at(lx, ly, lz, ry, 1, 1, 1, 0, rz)), hex, seed);
  const { w, d, h, thick } = RUIN;
  const walls = [[[-w / 2, d / 2], [w / 2, d / 2]], [[w / 2, d / 2], [w / 2, -d / 2]], [[w / 2, -d / 2], [-w / 2, -d / 2]], [[-w / 2, -d / 2], [-w / 2, d / 2]]];
  walls.forEach(([p, q], k) => {
    const n = 4;
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    for (let i = 0; i < n; i++) {
      if (r(700 + k * 10 + i) < 0.22) continue;
      const f = (i + 0.5) / n;
      const tall = k === 2 ? 0.6 + 0.4 * r(750 + k * 10 + i) : 0.2 + 0.8 * r(750 + k * 10 + i);
      const hgt = h * tall;
      const brick = r(800 + k * 10 + i) < 0.35;
      put(box(len / n + 0.01, hgt, thick), p[0] + (q[0] - p[0]) * f, hgt / 2, p[1] + (q[1] - p[1]) * f, brick ? RUIN.brick : RUIN.plaster, r(850 + k * 10 + i), along(q[0] - p[0], q[1] - p[1]));
    }
  });
  for (let i = 0; i < 2; i++) put(box(0.5, 0.035, 0.035), (r(900 + i) - 0.5) * w * 0.5, 0.08, (r(902 + i) - 0.5) * d * 0.5, RUIN.beam, r(904 + i), r(906 + i) * 3, (r(908 + i) - 0.5) * 0.5);
  for (let i = 0; i < 8; i++) {
    const lx = (r(910 + i) - 0.5) * (w + 0.3);
    const lz = (r(920 + i) - 0.5) * (d + 0.3);
    const p = V(lx, 0, lz).applyMatrix4(base);
    stone(m, p.x, p.z, 0.04 + r(930 + i) * 0.05, sub(r, 2000 + i * 10), RUIN.debris);
  }
}

// Walls and hedges on the edge between hexes, parapets just inside their hex.
// Walls and hedges are stored on both hexes they separate: build each edge once.
function hexsides(m, map) {
  const seen = new Set();
  for (const [k, sides] of Object.entries(map.sides)) {
    const [col, row] = k.split(',').map(Number);
    const h = { col, row };
    const c = center(h);
    const pts = corners(h);
    for (const [side, feature] of Object.entries(sides)) {
      const i = SIDES.indexOf(side);
      const inset = feature === 'parapet' ? BAGS.inset : 0;
      const [a, b] = [pts[i], pts[(i + 1) % 6]].map((p) => ({ x: p.x + (c.x - p.x) * inset, y: p.y + (c.y - p.y) * inset }));
      const id = [a, b].map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).sort().join('|');
      if (seen.has(id)) continue;
      seen.add(id);
      const r = (n) => hash(col, row, 3000 + i * 100 + n);
      if (feature === 'wall') stoneWall(m, a, b, r);
      else if (feature === 'hedge') hedge(m, a, b, r);
      else if (feature === 'parapet') sandbags(m, a, b, r);
    }
  }
}

function stoneWall(m, a, b, r) {
  const dx = b.x - a.x;
  const dz = b.y - a.y;
  const len = Math.hypot(dx, dz);
  const ry = along(dx, dz);
  const n = WALL.stones;
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n;
    const hgt = WALL.height * (0.85 + r(i) * 0.3);
    m.add(box((len / n) * 1.04, hgt, WALL.thick * (0.9 + r(10 + i) * 0.2)), at(a.x + dx * f, hgt / 2, a.y + dz * f, ry + (r(20 + i) - 0.5) * 0.08), pick(WALL.colors, r(30 + i)), r(40 + i));
  }
  for (let i = 0; i < n - 1; i++) {
    const f = (i + 1) / n;
    m.add(box(len / n, WALL.cap, WALL.thick * 1.15), at(a.x + dx * f, WALL.height + WALL.cap / 2, a.y + dz * f, ry + (r(50 + i) - 0.5) * 0.1), pick(WALL.colors, r(60 + i)), r(70 + i));
  }
}

function hedge(m, a, b, r) {
  const dx = b.x - a.x;
  const dz = b.y - a.y;
  for (let i = 0; i < HEDGE.n; i++) {
    const f = (i + 0.5) / HEDGE.n + (r(i) - 0.5) * 0.04;
    const rad = HEDGE.r * (0.85 + r(10 + i) * 0.3);
    m.add(blob(rad, seedOf(r(20 + i))), at(a.x + dx * f, rad * 0.75, a.y + dz * f, r(30 + i) * 6, 1, 0.9, 1), pick(HEDGE.colors, r(40 + i)), r(50 + i));
  }
}

function sandbags(m, a, b, r) {
  const dx = b.x - a.x;
  const dz = b.y - a.y;
  const len = Math.hypot(dx, dz);
  const ry = along(dx, dz);
  const n = BAGS.perRow;
  for (let row = 0; row < BAGS.rows; row++) {
    const shift = row % 2 ? 0.5 : 0;
    for (let i = 0; i < n - (row % 2); i++) {
      const f = (i + 0.5 + shift) / n;
      m.add(box((len / n) * 0.96, BAGS.h, BAGS.d), at(a.x + dx * f, BAGS.h * (row + 0.5), a.y + dz * f, ry + (r(row * 10 + i) - 0.5) * 0.12), pick(BAGS.colors, r(50 + row * 10 + i)), r(80 + row * 10 + i));
    }
  }
}

// ---- units ----

function soldierGeometry(side, posture, leader) {
  const m = new Mesher();
  const ink = FIGURE[side];
  const prone = posture === 'prone';
  const crouch = posture === 'crouch';
  const legH = crouch ? 0.06 : 0.11;
  const hip = at(0, legH, 0, 0, 1, 1, 1, crouch ? -0.3 : 0);
  const part = (geo, x, y, z, hex, rx = 0) => m.add(geo, hip.clone().multiply(at(x, y, z, 0, 1, 1, 1, rx)), hex, 0.5);
  m.add(box(0.075, legH, 0.045), at(0, legH / 2, crouch ? 0.02 : 0), ink.pants, 0.5);
  part(box(0.09, 0.1, 0.055), 0, 0.05, 0, ink.uniform);
  part(box(0.07, 0.075, 0.035), 0, 0.055, 0.045, ink.pack);
  part(new THREE.IcosahedronGeometry(0.032, 0), 0, 0.13, 0, FIGURE.skin);
  part(new THREE.SphereGeometry(0.04, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.14, 0, ink.helmet);
  part(box(0.016, 0.016, 0.15), 0.05, 0.045, -0.04, FIGURE.gun, -0.35);
  if (leader) part(box(0.008, 0.16, 0.008), -0.025, 0.14, 0.055, FIGURE.gun);
  const g = m.build();
  if (prone) g.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0.045, 0.14).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2)));
  g.applyMatrix4(new THREE.Matrix4().makeScale(FIGURE.scale, FIGURE.scale, FIGURE.scale));
  g.computeVertexNormals();
  return g;
}

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function canvasTexture(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// The unit's counter, drawn by the flat map's own drawCounters, centered on a square canvas.
function bannerTexture(unit, rosterOf, selected, ghost, hovered) {
  const c = canvas(BANNER.px);
  const half = BANNER.px / 2 / BANNER.scale;
  drawCounters(c.getContext('2d'), { x: -half, y: -half, scale: BANNER.scale }, [{ unit, pos: { x: 0, y: 0 }, selected, stackedWithTeam: false, ghost, hovered }], rosterOf);
  return canvasTexture(c);
}

function bangTexture(k) {
  const c = canvas(BANG.px);
  const hex = { col: 0, row: 0 };
  const o = center(hex);
  const spot = k ? { x: 0.3, y: 0.2 } : { x: -0.25, y: -0.18 };
  const scale = BANG.px / 2 / 0.62;
  const half = BANG.px / 2 / scale;
  drawBang(c.getContext('2d'), { x: o.x + spot.x - half, y: o.y + spot.y - half, scale }, hex, 0.4, k); // t = 0.4: full size, opaque
  return canvasTexture(c);
}

// ---- the world ----

// canvas: the board canvas the UI listens on; the 3D view is drawn under it.
// pickCounters: a unit's counter and figures can be pointed at (pickUnit),
// and the ground point under them is the unit's own (the game); the editor
// turns it off, as it picks hex corners too.
export function createWorld(boardCanvas, firstMap, { pickCounters = true } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = EXPOSURE;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // soft: shadow.radius
  const gl = renderer.domElement;
  Object.assign(gl.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block', pointerEvents: 'none' });
  boardCanvas.parentElement.insertBefore(gl, boardCanvas);
  boardCanvas.style.background = 'transparent';
  if (getComputedStyle(boardCanvas).position === 'static') boardCanvas.style.position = 'relative'; // stays on top, for input

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 30, 90);

  // Light.
  scene.add(new THREE.HemisphereLight(LIGHT.sky, LIGHT.ground, LIGHT.hemi));
  const sun = new THREE.DirectionalLight(LIGHT.sun, LIGHT.power);
  sun.castShadow = true;
  sun.shadow.mapSize.set(LIGHT.shadowMap, LIGHT.shadowMap);
  sun.shadow.bias = LIGHT.bias;
  sun.shadow.normalBias = LIGHT.normalBias;
  sun.shadow.radius = LIGHT.radius;
  const fill = new THREE.DirectionalLight(LIGHT.fill, LIGHT.fillPower);
  scene.add(sun, sun.target, fill);

  // The grid layer, laid over the ground by its shader.
  const overlayUniforms = { uOverlay: { value: null }, uOverlayBox: { value: new THREE.Vector4() } };
  const withOverlay = (material) => {
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, overlayUniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform vec4 uOverlayBox;\nvarying vec2 vOverlayUv;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvOverlayUv = ((modelMatrix * vec4(transformed, 1.0)).xz - uOverlayBox.xy) / uOverlayBox.zw;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uOverlay;\nvarying vec2 vOverlayUv;')
        .replace('#include <color_fragment>', '#include <color_fragment>\nvec4 overlayInk = texture2D(uOverlay, vOverlayUv);\ndiffuseColor.rgb = mix(diffuseColor.rgb, overlayInk.rgb, overlayInk.a);')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += overlayInk.rgb * overlayInk.a * ${OVERLAY.glow.toFixed(2)};`);
    };
    return material;
  };

  // The board's meshes; their geometry is built from the map by setBoard.
  const lit = (opts) => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, metalness: 0, ...opts });
  const groundMesh = new THREE.Mesh(new THREE.BufferGeometry(), withOverlay(lit({ roughness: 0.95 })));
  const sidesMesh = new THREE.Mesh(new THREE.BufferGeometry(), lit({ roughness: 1, side: THREE.DoubleSide }));
  const thingsMesh = new THREE.Mesh(new THREE.BufferGeometry(), lit({ roughness: 0.85, side: THREE.DoubleSide }));
  const waterMesh = new THREE.Mesh(new THREE.BufferGeometry(), withOverlay(lit({ roughness: 0.18, transparent: true, opacity: WATER.opacity, side: THREE.DoubleSide })));
  for (const mesh of [groundMesh, sidesMesh, thingsMesh]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  waterMesh.receiveShadow = true;
  const table = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: TABLE, roughness: 1 }));
  table.rotation.x = -Math.PI / 2;
  table.receiveShadow = true;
  // The marks layer, on a copy of the ground's surface drawn after everything
  // else and through it (no depth test); the counters and bangs still go on top.
  const marksMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
  marksMesh.renderOrder = OVERLAY.marksOrder;
  scene.add(groundMesh, sidesMesh, thingsMesh, waterMesh, table, marksMesh);

  let map = null;
  let bounds = null;
  let mid = null;
  let built = null;
  let waterBase = null;
  let flag = null;
  let gridCtx = null;
  let marksCtx = null;
  let ow = 0;
  let oh = 0;
  const fitPoints = [];

  // (Re)build everything that depends on the map: the board, the flag, the
  // marks layer, where the sun shines from and what the camera fits.
  function setBoard(next) {
    map = next;
    bounds = mapBounds(map.width, map.height);
    mid = { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minY + bounds.maxY) / 2 };
    const reach = Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) / 2 + 3;
    sun.position.set(mid.x + LIGHT.from[0] * 40, LIGHT.from[1] * 40, mid.z + LIGHT.from[2] * 40);
    sun.target.position.set(mid.x, 0, mid.z);
    Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: 100 });
    sun.shadow.camera.updateProjectionMatrix();
    fill.position.set(mid.x - LIGHT.from[0] * 40, 20, mid.z - LIGHT.from[2] * 40);
    table.position.set(mid.x, LEVEL.base, mid.z);

    const w = Math.ceil((bounds.maxX - bounds.minX) * OVERLAY.texels);
    const h = Math.ceil((bounds.maxY - bounds.minY) * OVERLAY.texels);
    if (w !== ow || h !== oh) {
      ow = w;
      oh = h;
      const layer = () => {
        const tex = canvasTexture(canvas(ow, oh));
        tex.flipY = false;
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        return tex;
      };
      overlayUniforms.uOverlay.value?.dispose();
      overlayUniforms.uOverlay.value = layer();
      gridCtx = overlayUniforms.uOverlay.value.image.getContext('2d');
      marksMesh.material.map?.dispose();
      marksMesh.material.map = layer();
      marksMesh.material.needsUpdate = true;
      marksCtx = marksMesh.material.map.image.getContext('2d');
    }
    overlayUniforms.uOverlayBox.value.set(bounds.minX, bounds.minY, ow / OVERLAY.texels, oh / OVERLAY.texels);
    paintGrid();
    overlaySig = null;

    const old = built;
    built = buildBoard(map);
    groundMesh.geometry = built.ground;
    sidesMesh.geometry = built.sides;
    thingsMesh.geometry = built.things;
    waterMesh.geometry = built.water;
    waterBase = built.water.attributes.position.array.slice();
    // The marks' surface, its texture coordinates from where each corner is on the board.
    const top = built.top.attributes.position;
    const uv = new Float32Array(top.count * 2);
    for (let i = 0; i < top.count; i++) {
      uv[i * 2] = ((top.getX(i) - bounds.minX) * OVERLAY.texels) / ow;
      uv[i * 2 + 1] = ((top.getZ(i) - bounds.minY) * OVERLAY.texels) / oh;
    }
    built.top.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    marksMesh.geometry = built.top;
    if (old) for (const g of Object.values(old)) g.dispose();

    if (flag) {
      scene.remove(flag.group);
      flag.dispose();
    }
    flag = makeFlag(map);
    if (flag) scene.add(flag.group);

    fitPoints.length = 0;
    for (const x of [bounds.minX, bounds.maxX]) {
      for (const z of [bounds.minY, bounds.maxY]) fitPoints.push(V(x, 0, z), V(x, LEVEL.base, z));
    }
  }
  let overlaySig = null;

  // A layer's canvas, cleared, with its drawing frame (the flat frame of camera.js).
  function begin(ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ow, oh);
    const k = OVERLAY.texels / OVERLAY.look;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    return { x: bounds.minX, y: bounds.minY, scale: OVERLAY.look };
  }

  function paintGrid() {
    const cam2d = begin(gridCtx);
    gridCtx.strokeStyle = GRID.ink;
    gridCtx.lineWidth = GRID.width;
    gridCtx.beginPath();
    forEachHex(map, (h) => {
      corners(h).forEach((p, i) => {
        const x = (p.x - cam2d.x) * cam2d.scale;
        const y = (p.y - cam2d.y) * cam2d.scale;
        if (i) gridCtx.lineTo(x, y);
        else gridCtx.moveTo(x, y);
      });
      gridCtx.closePath();
    });
    gridCtx.stroke();
    overlayUniforms.uOverlay.value.needsUpdate = true;
  }
  setBoard(firstMap);

  // ---- camera ----

  const camera = new THREE.PerspectiveCamera(CAM.fov, 1, CAM.near, CAM.far);
  const rig = { x: mid.x, z: mid.z, dist: 40, yaw: 0, yawGoal: 0, tilt: 0 };
  const size = { w: 1, h: 1 };
  const plane = new THREE.Plane(UP, 0);
  const caster = new THREE.Raycaster();
  const hit = new THREE.Vector3();

  function resize(w, h) {
    if (!w || !h || (w === size.w && h === size.h)) return;
    size.w = w;
    size.h = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    place();
  }

  function pitch() {
    const t = clamp((Math.log(rig.dist) - Math.log(CAM.minDist)) / (Math.log(CAM.maxDist) - Math.log(CAM.minDist)), 0, 1);
    return clamp(CAM.pitchNear + (CAM.pitchFar - CAM.pitchNear) * t + rig.tilt, 0.3, 1.45);
  }

  function place() {
    const p = pitch();
    const flat = Math.cos(p) * rig.dist;
    camera.position.set(rig.x + Math.sin(rig.yaw) * flat, Math.sin(p) * rig.dist, rig.z + Math.cos(rig.yaw) * flat);
    camera.lookAt(rig.x, 0, rig.z);
    camera.updateMatrixWorld();
  }

  // The ground point under a screen point, in game world units ({x, y}), or null above the horizon.
  function groundAt(sx, sy) {
    caster.setFromCamera(new THREE.Vector2((sx / size.w) * 2 - 1, -(sy / size.h) * 2 + 1), camera);
    const p = caster.ray.intersectPlane(plane, hit);
    return p ? { x: p.x, y: p.z } : null;
  }

  function keepOnBoard() {
    rig.x = clamp(rig.x, bounds.minX - CAM.roam, bounds.maxX + CAM.roam);
    rig.z = clamp(rig.z, bounds.minY - CAM.roam, bounds.maxY + CAM.roam);
  }

  const banners = []; // each unit's counter and figures on screen last frame, for picking: { id, x, y, hw, hh, ground, depth, pos }

  // The unit whose counter or figures are under a screen point: of two
  // overlapping (a team and its SL), the one whose column is nearer.
  function pickAt(sx, sy) {
    if (!pickCounters) return null;
    let best = null;
    for (const b of banners) {
      if (sy < b.y - b.hh || sy > Math.max(b.y + b.hh, b.ground)) continue;
      const off = Math.abs(sx - b.x) / b.hw;
      if (off > 1) continue;
      if (!best || off < best.off || (off === best.off && b.depth < best.b.depth)) best = { b, off };
    }
    return best?.b ?? null;
  }

  const cam = {
    // Fit the board in the part of the view that pad (px) leaves free.
    fit(w, h, pad = { left: 0, right: 0, top: 0, bottom: 0 }) {
      resize(w, h);
      const fw = w - pad.left - pad.right;
      const fh = h - pad.top - pad.bottom;
      Object.assign(rig, { x: mid.x, z: mid.z, dist: 40, yaw: 0, yawGoal: 0, tilt: 0 });
      for (let k = 0; k < 8; k++) {
        place();
        let x0 = Infinity;
        let x1 = -Infinity;
        let y0 = Infinity;
        let y1 = -Infinity;
        for (const p of fitPoints) {
          const q = p.clone().project(camera);
          x0 = Math.min(x0, q.x);
          x1 = Math.max(x1, q.x);
          y0 = Math.min(y0, q.y);
          y1 = Math.max(y1, q.y);
        }
        const a = groundAt((((x0 + x1) / 2 + 1) / 2) * size.w, ((1 - (y0 + y1) / 2) / 2) * size.h);
        const b = groundAt(pad.left + fw / 2, pad.top + fh / 2);
        if (a && b) {
          rig.x += a.x - b.x;
          rig.z += a.y - b.y;
        }
        rig.dist = clamp(rig.dist * Math.max(((x1 - x0) / 2) * (w / fw), ((y1 - y0) / 2) * (h / fh)) / CAM.fitMargin, CAM.minDist, CAM.maxDist);
      }
      place();
    },
    toWorld(sx, sy) {
      // A click on a unit's counter means the unit's hex, not the ground behind it.
      const front = pickAt(sx, sy);
      if (front) return { ...front.pos };
      return groundAt(sx, sy) ?? { x: -1e6, y: -1e6 };
    },
    zoomAt(sx, sy, factor) {
      const before = groundAt(sx, sy);
      rig.dist = clamp(rig.dist / factor, CAM.minDist, CAM.maxDist);
      place();
      const after = groundAt(sx, sy);
      if (before && after) {
        rig.x += before.x - after.x;
        rig.z += before.y - after.y;
      }
      keepOnBoard();
      place();
    },
    panBy(dx, dy) {
      const a = groundAt(size.w / 2, size.h / 2);
      const b = groundAt(size.w / 2 + dx, size.h / 2 + dy);
      if (!a || !b) return;
      rig.x -= b.x - a.x;
      rig.z -= b.y - a.y;
      keepOnBoard();
      place();
    },
    // Right drag: turn round the target and tilt.
    orbit(dx, dy) {
      rig.yaw -= dx * CAM.orbitPerPx;
      rig.yawGoal = rig.yaw;
      rig.tilt = clamp(rig.tilt + dy * CAM.tiltPerPx, CAM.tilt[0], CAM.tilt[1]);
      place();
    },
    // Q / E: turn by a step, smoothly.
    turn(dir) {
      rig.yawGoal += dir * CAM.turnStep;
    },
  };

  // ---- per frame ----

  let last = null;
  const units = new Map();
  const textures = new Map();
  const geometries = new Map();
  const figureMat = lit({ roughness: 0.8 });
  const ghostMat = lit({ roughness: 0.8, transparent: true, opacity: FIGURE.ghost, depthWrite: false });
  const bangTex = [bangTexture(0), bangTexture(1)];
  const bangs = [];
  const puffs = [];
  const tracers = [];

  function paintOverlay(frame) {
    const selected = frame.counters.filter((c) => c.selected && c.unit.status !== 'eliminated').map((c) => spot(c));
    const sig = `${frame.sig}|${JSON.stringify(selected)}`;
    if (sig === overlaySig) return;
    overlaySig = sig;
    const ctx = marksCtx;
    const cam2d = begin(ctx);
    if (map.objective) drawObjective(ctx, cam2d, { col: map.objective[0], row: map.objective[1] }, OBJECTIVE_INK);
    for (const p of selected) {
      const x = (p.x - cam2d.x) * cam2d.scale;
      const y = (p.y - cam2d.y) * cam2d.scale;
      ctx.beginPath();
      ctx.arc(x, y, SELECT.radius * cam2d.scale, 0, Math.PI * 2);
      ctx.lineWidth = SELECT.width + 2;
      ctx.strokeStyle = SELECT.edge;
      ctx.stroke();
      ctx.lineWidth = SELECT.width;
      ctx.strokeStyle = SELECT.ink;
      ctx.stroke();
    }
    frame.paint(ctx, cam2d);
    marksMesh.material.map.needsUpdate = true;
  }

  // Where a counter's unit stands: the SL steps aside when he shares the hex with a team.
  const spot = (c) => (c.unit.kind === 'leader' && c.stackedWithTeam ? { x: c.pos.x + FIGURE.stack.x, y: c.pos.y + FIGURE.stack.y } : { x: c.pos.x, y: c.pos.y });

  function geometryFor(side, posture, leader) {
    const k = `${side}|${posture}|${leader}`;
    if (!geometries.has(k)) geometries.set(k, soldierGeometry(side, posture, leader));
    return geometries.get(k);
  }

  function bannerFor(c, rosterOf, hovered) {
    const u = c.unit;
    const k = [u.side, u.kind, u.type, u.team, u.status, u.soldiers.length, rosterOf(u).length, u.activated, u.exposed, c.selected, c.ghost, hovered].join('|');
    if (!textures.has(k)) textures.set(k, bannerTexture(u, rosterOf, c.selected, c.ghost, hovered));
    return textures.get(k);
  }

  function updateUnits(frame, dt) {
    const seen = new Set();
    for (const c of frame.counters) {
      const u = c.unit;
      if (u.status === 'eliminated') continue;
      seen.add(u.id);
      let g = units.get(u.id);
      if (!g) {
        g = { root: new THREE.Group(), figures: [], banner: new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, depthWrite: false, transparent: true, toneMapped: false })), at: null, yaw: u.side === 'OPFOR' ? Math.PI : 0, walk: 0 };
        g.banner.renderOrder = 10;
        g.banner.scale.set(BANNER.size, BANNER.size, 1);
        g.root.add(g.banner);
        scene.add(g.root);
        units.set(u.id, g);
      }
      g.root.visible = true;
      const p = spot(c);
      const moving = g.at && Math.hypot(p.x - g.at.x, p.y - g.at.y) > 1e-4;
      const rest = u.side === 'OPFOR' ? Math.PI : 0;
      const goal = moving ? Math.atan2(-(p.x - g.at.x), -(p.y - g.at.y)) : rest;
      let turn = goal - g.yaw;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      g.yaw += turn * Math.min(1, dt * FIGURE.turnRate * (moving ? 3 : 1));
      g.walk = moving ? g.walk + dt * FIGURE.stride : 0;
      g.at = p;
      g.root.position.set(p.x, 0, p.y);

      const leader = u.kind === 'leader';
      const posture = u.status === 'pinned' ? 'prone' : u.status === 'suppressed' ? 'crouch' : 'stand';
      const n = leader ? 1 : u.soldiers.length;
      while (g.figures.length < n) {
        const f = new THREE.Mesh(geometryFor(u.side, posture, leader), figureMat);
        f.castShadow = true;
        g.root.add(f);
        g.figures.push(f);
      }
      const spread = posture === 'prone' ? FIGURE.proneSpread : 1;
      g.figures.forEach((f, i) => {
        f.visible = i < n;
        if (!f.visible) return;
        f.geometry = geometryFor(u.side, posture, leader);
        f.material = c.ghost ? ghostMat : figureMat;
        f.castShadow = !c.ghost;
        const [sx, sz] = leader ? [0, 0] : FIGURE.slots[i % FIGURE.slots.length];
        const cos = Math.cos(g.yaw);
        const sin = Math.sin(g.yaw);
        f.position.set((sx * cos + sz * sin) * spread, moving ? Math.abs(Math.sin(g.walk + i * 1.7)) * FIGURE.bob : 0, (-sx * sin + sz * cos) * spread);
        f.rotation.y = g.yaw;
      });
      const hovered = frame.hoverUnit === u.id;
      const map_ = bannerFor(c, frame.rosterOf, hovered);
      if (g.banner.material.map !== map_) {
        g.banner.material.map = map_;
        g.banner.material.needsUpdate = true;
      }
      g.banner.position.set(0, leader ? BANNER.lift.leader : BANNER.lift.team, 0);
      g.leader = leader;
      const grow = hovered ? BANNER.hover.grow : 1;
      g.banner.scale.set(BANNER.size * grow, BANNER.size * grow, 1);
    }
    for (const [id, g] of units) if (!seen.has(id)) g.root.visible = false;
  }

  // Counters' screen rectangles, for picking.
  function measureBanners() {
    banners.length = 0;
    const toCam = new THREE.Vector3();
    const look = new THREE.Vector3();
    camera.getWorldDirection(look);
    const perUnit = size.h / 2 / Math.tan(THREE.MathUtils.degToRad(CAM.fov) / 2);
    const counterUnit = BANNER.size / (BANNER.px / BANNER.scale); // world units per counter unit
    for (const [id, g] of units) {
      if (!g.root.visible) continue;
      const w = g.banner.getWorldPosition(new THREE.Vector3());
      const depth = toCam.subVectors(w, camera.position).dot(look);
      if (depth <= 0) continue;
      const s = w.clone().project(camera);
      const px = (perUnit / depth) * counterUnit;
      const pick = g.leader ? BANNER.pick.leader : BANNER.pick.team;
      const foot = V(g.at.x, 0, g.at.y + BANNER.pick.foot).project(camera); // a little in front of its feet
      banners.push({
        id, x: ((s.x + 1) / 2) * size.w, y: ((1 - s.y) / 2) * size.h, hw: pick.w * px, hh: pick.h * px,
        ground: ((1 - foot.y) / 2) * size.h, depth, pos: { x: g.at.x, y: g.at.y },
      });
    }
  }

  function pool(list, make, n) {
    while (list.length < n) {
      const o = make();
      scene.add(o);
      list.push(o);
    }
    list.forEach((o, i) => {
      o.visible = i < n;
    });
  }

  function updateEffects(frame) {
    // Bangs: the flat map's starburst, standing up, popping in and fading as it does there.
    const live = frame.bangs.filter((b) => b.t >= 0 && b.t <= 1);
    pool(bangs, () => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, depthWrite: false, transparent: true, toneMapped: false }));
      s.renderOrder = 11;
      return s;
    }, live.length);
    pool(puffs, () => new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: BANG.puff, flatShading: true, transparent: true, depthWrite: false, roughness: 1 })), live.length * BANG.puffs);
    live.forEach((b, i) => {
      const spotXY = b.k ? { x: 0.3, y: 0.2 } : { x: -0.25, y: -0.18 };
      const c = center(b.hex);
      const t = b.t;
      const pop = t < 0.15 ? 0.4 + (t / 0.15) * 0.75 : t < 0.3 ? 1.15 - ((t - 0.15) / 0.15) * 0.15 : 1;
      const s = bangs[i];
      s.material.map = bangTex[b.k ? 1 : 0];
      s.material.opacity = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
      const w = (BANG.px / (BANG.px / 2 / 0.62)) * pop * BANG.size;
      s.scale.set(w, w, 1);
      s.position.set(c.x + spotXY.x, BANG.lift, c.y + spotXY.y);
      for (let k = 0; k < BANG.puffs; k++) {
        const p = puffs[i * BANG.puffs + k];
        const a = (k / BANG.puffs) * Math.PI * 2 + b.k;
        const grow = 0.06 + t * 0.16;
        p.scale.setScalar(grow * (0.8 + 0.2 * k));
        p.position.set(c.x + spotXY.x + Math.cos(a) * t * 0.25, 0.08 + t * 0.35 + k * 0.03, c.y + spotXY.y + Math.sin(a) * t * 0.25);
        p.material.opacity = 0.75 * (1 - t);
      }
    });

    // Tracers flying down each line of fire while it is shown.
    const streaks = [];
    for (const shot of frame.shots) {
      for (let k = 0; k < TRACER.per; k++) {
        const f = shot.t * TRACER.speed - k * TRACER.gap;
        if (f >= 0 && f <= 1) streaks.push({ shot, f });
      }
    }
    pool(tracers, () => new THREE.Mesh(new THREE.BoxGeometry(TRACER.thick, TRACER.thick, TRACER.len), new THREE.MeshBasicMaterial({ toneMapped: false })), streaks.length);
    streaks.forEach(({ shot, f }, i) => {
      const a = center(shot.from);
      const b = center(shot.to);
      const from = V(a.x, TRACER.from, a.y);
      const to = V(b.x, TRACER.to, b.y);
      const m = tracers[i];
      m.material.color.set(TRACER[shot.side] ?? TRACER.BLUFOR);
      m.position.lerpVectors(from, to, f);
      m.lookAt(to);
    });
  }

  function animateWater(t) {
    const p = built.water.attributes.position;
    const a = p.array;
    for (let i = 0; i < a.length; i += 3) {
      if (waterBase[i + 1] < LEVEL.water - 1e-3) continue;
      const x = waterBase[i];
      const z = waterBase[i + 2];
      a[i + 1] = LEVEL.water + WATER.wave * Math.sin(x * 1.7 + t * WATER.speed) * Math.cos(z * 1.3 - t * WATER.speed * 0.8);
    }
    p.needsUpdate = true;
  }

  return {
    camera: cam,
    // The unit whose counter or figures are under a screen point, or null.
    pickUnit(sx, sy) {
      return pickAt(sx, sy)?.id ?? null;
    },
    // A changed map (the editor): rebuild the board in place.
    setMap(next) {
      setBoard(next);
    },
    // frame: { counters (as for drawCounters), rosterOf, bangs [{ hex, k, t }], shots [{ from, to, side, t }], hoverUnit (id or null),
    // paint(ctx, cam): draws the marks with the flat map's functions, sig: changes whenever they do }
    render(now, frame) {
      const dt = last === null ? 0 : Math.min(0.1, (now - last) / 1000);
      last = now;
      resize(boardCanvas.clientWidth, boardCanvas.clientHeight);
      if (Math.abs(rig.yawGoal - rig.yaw) > 1e-4) {
        rig.yaw += (rig.yawGoal - rig.yaw) * Math.min(1, dt * CAM.turnRate);
        place();
      }
      paintOverlay(frame);
      animateWater(now / 1000);
      flag?.wave(now / 1000);
      updateUnits(frame, dt);
      updateEffects(frame);
      scene.fog.near = rig.dist + FOG.near;
      scene.fog.far = rig.dist + FOG.far;
      renderer.render(scene, camera);
      measureBanners();
    },
  };
}

function makeFlag(map) {
  if (!map.objective) return null;
  const c = center({ col: map.objective[0], row: map.objective[1] });
  const x = c.x + FLAG.at.x;
  const z = c.y + FLAG.at.y;
  const group = new THREE.Group();
  const mat = (hex, opts = {}) => new THREE.MeshStandardMaterial({ color: hex, flatShading: true, roughness: 0.7, ...opts });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, FLAG.height, 6), mat(FLAG.pole));
  pole.position.set(x, FLAG.height / 2, z);
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.03, 0), mat(FLAG.ball, { metalness: 0.4 }));
  ball.position.set(x, FLAG.height + 0.02, z);
  const geo = new THREE.PlaneGeometry(FLAG.w, FLAG.h, 8, 2);
  geo.translate(FLAG.w / 2, 0, 0);
  const base = geo.attributes.position.array.slice();
  const cloth = new THREE.Mesh(geo, mat(FLAG.color, { side: THREE.DoubleSide }));
  cloth.position.set(x, FLAG.height - FLAG.h / 2 - 0.03, z);
  for (const m of [pole, ball, cloth]) m.castShadow = true;
  group.add(pole, ball, cloth);
  return {
    group,
    dispose() {
      for (const m of [pole, ball, cloth]) {
        m.geometry.dispose();
        m.material.dispose();
      }
    },
    wave(t) {
      const a = geo.attributes.position.array;
      for (let i = 0; i < a.length; i += 3) {
        const fx = base[i] / FLAG.w;
        a[i + 2] = Math.sin(base[i] * 9 - t * 5) * 0.035 * fx;
        a[i + 1] = base[i + 1] - fx * fx * 0.02;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}
