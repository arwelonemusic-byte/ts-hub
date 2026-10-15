import { test } from 'node:test';
import assert from 'node:assert/strict';
import { corners, SIDES } from '../src/sim/hex.js';
import { parseMap, sideFeature, terrainName } from '../src/sim/map.js';
import { createState } from '../src/sim/state.js';
import {
  clone, deployment, drawEdges, edgeKey, edgePath, eraseEdge, fromMapJson, graph, moveObjective, nearestVertex,
  newModel, paint, problems, randomize, resize, toggleEnemy, toggleParapet, toMapJson,
} from '../src/editor/model.js';
import { H, balance, loadJson } from './helpers.js';

const edgeOf = (hex, side) => {
  const i = SIDES.indexOf(side);
  const pts = corners(hex);
  return edgeKey(pts[i], pts[(i + 1) % 6]);
};

test('a new map is all grass, ready to play, and parses as a mission', () => {
  const m = newModel();
  assert.ok(m.terrain.every((t) => t === 'open'));
  assert.deepEqual(problems(m, balance), []);
  const map = parseMap(toMapJson(m, balance), balance);
  assert.equal(map.width, m.width);
  assert.equal(map.mission.turns, undefined, 'no turn limit');
  const state = createState({ balance, map, seed: 1 });
  assert.deepEqual(state.units.map((u) => `${u.side} ${u.team}`), ['BLUFOR ALPHA', 'BLUFOR BRAVO', 'BLUFOR SL', 'OPFOR ALPHA']);
  assert.deepEqual(state.units.find((u) => u.side === 'OPFOR').pos, m.objective, 'the enemy holds the objective');
});

test('the squad deploys round the start: BRAVO beside ALPHA and the SL, on open ground', () => {
  const m = newModel({ width: 8, height: 8 });
  m.start = H(3, 6);
  assert.deepEqual(deployment(m, balance), { ALPHA: H(3, 6), BRAVO: H(4, 6), SL: H(3, 6) });
  paint(m, [H(4, 6)], 'water');
  assert.deepEqual(deployment(m, balance).BRAVO, H(2, 6), 'east is water: west instead');
  paint(m, [H(3, 6)], 'water');
  assert.equal(deployment(m, balance), null);
  assert.match(problems(m, balance).join(' '), /start is on ground nobody can enter/);
});

test('walls and hedges follow hex edges from corner to corner, and drawing them again takes them off', () => {
  const m = newModel({ width: 6, height: 6 });
  const g = graph(m.width, m.height);
  const [a, b] = [corners(H(2, 2))[3], corners(H(3, 2))[1]].map((p) => nearestVertex(g, p, 0.1).key);
  const path = edgePath(g, a, b);
  assert.ok(path.length >= 2, 'more than one edge between those corners');
  assert.equal(drawEdges(m, path, 'wall'), 'added');
  const map = parseMap(toMapJson(m, balance), balance);
  const walls = Object.values(map.sides).flatMap((s) => Object.values(s)).filter((f) => f === 'wall');
  assert.equal(walls.length, path.length * 2, 'every wall is on both hexes it separates');
  assert.equal(drawEdges(m, path, 'wall'), 'removed');
  assert.deepEqual(m.edges, {});
});

test('parapets belong to one hex side; erasing an edge clears all it holds', () => {
  const m = newModel({ width: 6, height: 6 });
  toggleParapet(m, H(2, 2), 'SE');
  const map = parseMap(toMapJson(m, balance), balance);
  assert.equal(sideFeature(map, H(2, 2), 'SE'), 'parapet');
  assert.equal(sideFeature(map, H(2, 3), 'NW'), null, 'not shared');
  m.edges[edgeOf(H(2, 2), 'SE')] = 'hedge';
  const g = graph(m.width, m.height);
  assert.ok(eraseEdge(m, g.edges.get(edgeOf(H(2, 2), 'SE'))));
  assert.deepEqual(m.edges, {});
  assert.deepEqual(m.parapets, []);
});

test('a map survives the trip to the file format and back', () => {
  const m = newModel({ width: 9, height: 7, name: 'Round trip' });
  randomize(m, 42);
  m.edges[edgeOf(H(1, 1), 'E')] = 'wall';
  m.edges[edgeOf(H(4, 3), 'SW')] = 'hedge';
  toggleParapet(m, H(5, 2), 'SW');
  m.brief = 'Hold the farm.';
  const back = fromMapJson(toMapJson(m, balance));
  assert.deepEqual(back, m);
});

test('Trench Line opens in the editor and saves to the same terrain, hexsides and objective', () => {
  const json = loadJson('data/maps/trenchline.json');
  const out = toMapJson(fromMapJson(json), balance);
  assert.deepEqual(out.rows, json.rows);
  assert.deepEqual(out.objective, json.objective);
  const a = parseMap(json, balance);
  const b = parseMap(out, balance);
  assert.deepEqual(b.sides, a.sides);
  assert.deepEqual(b.units.filter((u) => u.side === 'OPFOR').map((u) => u.pos), [[6, 3]]);
});

test('resizing keeps what fits and moves the forces onto the map', () => {
  const m = newModel({ width: 10, height: 10 });
  paint(m, [H(1, 1), H(8, 8)], 'woods');
  m.edges[edgeOf(H(8, 8), 'E')] = 'wall';
  m.edges[edgeOf(H(1, 1), 'E')] = 'hedge';
  m.start = H(9, 9);
  toggleEnemy(m, H(8, 8));
  resize(m, 6, 6);
  assert.equal(m.terrain.length, 36);
  assert.equal(terrainName({ width: 6, terrain: m.terrain }, H(1, 1)), 'woods');
  assert.deepEqual(Object.values(m.edges), ['hedge'], 'the wall was off the new map');
  assert.deepEqual(m.start, H(5, 5));
  assert.equal(m.enemies.length, 1, 'the team at 8,8 is gone, the one at the objective stays');
  resize(m, 100, 2);
  assert.deepEqual([m.width, m.height], [30, 6], 'sizes are kept within limits');
});

test('random maps are the same for the same seed, varied, and keep the forces out of the water', () => {
  const a = randomize(newModel(), 7);
  const b = randomize(newModel(), 7);
  assert.deepEqual(a.terrain, b.terrain);
  const kinds = new Set();
  for (let seed = 1; seed <= 20; seed++) {
    const m = randomize(newModel(), seed);
    m.terrain.forEach((t) => kinds.add(t));
    assert.deepEqual(problems(m, balance), [], `seed ${seed}`);
  }
  for (const t of ['open', 'woods', 'scrub', 'water', 'road', 'building']) assert.ok(kinds.has(t), `${t} turns up`);
});

test('enemy teams toggle, up to four, and the one on the objective moves with it', () => {
  const m = newModel();
  assert.equal(toggleEnemy(m, H(1, 1)), 'added');
  assert.equal(toggleEnemy(m, H(2, 1)), 'added');
  assert.equal(toggleEnemy(m, H(3, 1)), 'added');
  assert.equal(toggleEnemy(m, H(4, 1)), 'full');
  assert.equal(toggleEnemy(m, H(1, 1)), 'removed');
  const before = clone(m.objective);
  moveObjective(m, H(5, 5));
  assert.deepEqual(m.objective, H(5, 5));
  assert.ok(m.enemies.some((e) => e.col === 5 && e.row === 5));
  assert.ok(!m.enemies.some((e) => e.col === before.col && e.row === before.row));
  m.enemies = [];
  assert.match(problems(m, balance).join(' '), /at least one OPFOR team/);
});
