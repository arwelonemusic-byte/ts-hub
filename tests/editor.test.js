import { test } from 'node:test';
import assert from 'node:assert/strict';
import { corners, distance, SIDES } from '../src/sim/hex.js';
import { parseMap, sideFeature, terrainName } from '../src/sim/map.js';
import { createState } from '../src/sim/state.js';
import {
  SIZE, clone, deployment, drawEdges, edgeKey, edgePath, eraseEdge, fitSize, fromMapJson, graph, moveObjective,
  nearestVertex, newModel, paint, problems, randomize, toggleEnemy, toggleParapet, toMapJson, upgradeMapJson,
} from '../src/editor/model.js';
import { H, balance, loadJson } from './helpers.js';

const edgeOf = (hex, side) => {
  const i = SIDES.indexOf(side);
  const pts = corners(hex);
  return edgeKey(pts[i], pts[(i + 1) % 6]);
};

test('a new map is 14 x 16, all grass, ready to play, and parses as a mission', () => {
  const m = newModel();
  assert.deepEqual([m.width, m.height], [14, 16]);
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
  const m = newModel();
  m.start = H(3, 6);
  assert.deepEqual(deployment(m, balance), { ALPHA: H(3, 6), BRAVO: H(4, 6), SL: H(3, 6) });
  paint(m, [H(4, 6)], 'water');
  assert.deepEqual(deployment(m, balance).BRAVO, H(2, 6), 'east is water: west instead');
  paint(m, [H(3, 6)], 'water');
  assert.equal(deployment(m, balance), null);
  assert.match(problems(m, balance).join(' '), /start is on ground nobody can enter/);
});

test('walls and hedges follow hex edges from corner to corner, and drawing them again takes them off', () => {
  const m = newModel();
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
  const m = newModel();
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
  const m = newModel({ name: 'Round trip' });
  randomize(m, 42);
  m.edges[edgeOf(H(1, 1), 'E')] = 'wall';
  m.edges[edgeOf(H(4, 3), 'SW')] = 'hedge';
  toggleParapet(m, H(5, 2), 'SW');
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

test('a map of another size is made 14 x 16: what fits stays, the forces move onto the map', () => {
  const m = Object.assign(newModel(), { width: 20, height: 20, terrain: new Array(400).fill('open') });
  m.terrain[1 * 20 + 1] = 'woods';
  m.terrain[18 * 20 + 18] = 'woods';
  m.edges[edgeOf(H(18, 18), 'E')] = 'wall';
  m.edges[edgeOf(H(1, 1), 'E')] = 'hedge';
  m.start = H(19, 19);
  toggleEnemy(m, H(18, 18));
  fitSize(m);
  assert.deepEqual([m.width, m.height, m.terrain.length], [SIZE.width, SIZE.height, SIZE.width * SIZE.height]);
  assert.equal(terrainName(m, H(1, 1)), 'woods');
  assert.equal(m.terrain.filter((t) => t === 'woods').length, 1, 'the woods at 18,18 were cut off');
  assert.deepEqual(Object.values(m.edges), ['hedge'], 'the wall was off the new map');
  assert.deepEqual(m.start, H(13, 15));
  assert.equal(m.enemies.length, 1, 'the team at 18,18 is gone, the one at the objective stays');
  // The training ground (12 x 12) opens at 14 x 16, the new hexes grass.
  const training = fromMapJson(loadJson('data/maps/training.json'));
  assert.deepEqual([training.width, training.height], [14, 16]);
  assert.equal(terrainName(training, H(13, 15)), 'open');
  assert.deepEqual(problems(training, balance), []);
});

test('a random map is the same for the same seed, and replaces everything on the map but its name and size', () => {
  const messy = newModel({ name: 'Mine' });
  paint(messy, [H(1, 1)], 'trench');
  messy.edges[edgeOf(H(2, 2), 'E')] = 'wall';
  toggleParapet(messy, H(3, 3), 'NE');
  toggleEnemy(messy, H(4, 4));
  messy.start = H(6, 6);
  assert.deepEqual(randomize(messy, 7), randomize(newModel({ name: 'Mine' }), 7));
});

test('random maps are varied, ready to play, with hexsides, BLUFOR at the bottom and OPFOR near the top', () => {
  const kinds = new Set();
  const features = { hedge: 0, wall: 0, parapet: 0 };
  const g = graph(SIZE.width, SIZE.height);
  for (let seed = 1; seed <= 60; seed++) {
    const m = randomize(newModel(), seed);
    const at = `seed ${seed}`;
    m.terrain.forEach((t) => kinds.add(t));
    assert.deepEqual(problems(m, balance), [], at);
    assert.deepEqual(m.enemies, [m.objective], `${at}: one OPFOR team, on the objective`);
    assert.ok(m.start.row >= 12 && m.objective.row <= 3, `${at}: BLUFOR at the bottom, the objective near the top`);
    assert.ok(distance(m.start, m.objective) >= SIZE.height / 2, `${at}: far apart`);
    for (const [k, f] of Object.entries(m.edges)) {
      features[f]++;
      const e = g.edges.get(k);
      assert.equal(e.owners.length, 2, `${at}: not on the board's edge`);
      assert.ok(e.owners.every((o) => terrainName(m, o.hex) !== 'water'), `${at}: not by water`);
    }
    features.parapet += m.parapets.length;
  }
  for (const t of ['open', 'woods', 'scrub', 'water', 'road', 'building']) assert.ok(kinds.has(t), `${t} turns up`);
  for (const [f, n] of Object.entries(features)) assert.ok(n > 0, `${f}s turn up`);
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

test('maps saved while there was a turn limit lose it, and the brief the editor wrote loses "within N turns"', () => {
  const old = toMapJson(newModel(), balance);
  old.mission = { ...old.mission, turns: 12, brief: 'Take and hold the objective at 5,1 within 12 turns. 2 OPFOR fireteams defend the area.' };
  const up = upgradeMapJson(old);
  assert.equal(up.mission.turns, undefined);
  assert.equal(up.mission.brief, 'Take and hold the objective at 5,1. 2 OPFOR fireteams defend the area.');
  const own = { ...old, mission: { ...old.mission, brief: 'Hold the farm for 12 turns.' } };
  assert.equal(upgradeMapJson(own).mission.brief, 'Hold the farm for 12 turns.', 'a brief someone wrote is kept');
  const current = toMapJson(newModel(), balance);
  assert.equal(upgradeMapJson(current), current, 'a current map is left alone');
  // Opened and saved again in between: no turns any more, the old words still in the brief.
  const resaved = { ...current, mission: { ...current.mission, brief: 'Take and hold the objective at 5,1 within 12 turns. 2 OPFOR fireteams defend the area.' } };
  assert.equal(upgradeMapJson(resaved).mission.brief, 'Take and hold the objective at 5,1. 2 OPFOR fireteams defend the area.');
});

test('every map from the editor has one mission, take and hold the objective, and always an objective', () => {
  const json = loadJson('data/maps/trenchline.json');
  const out = toMapJson(fromMapJson(json), balance);
  assert.equal(out.mission.brief, 'Take and hold the objective at 6,3. One OPFOR fireteam defends the area.', 'Trench Line\'s own brief is not kept');
  assert.deepEqual(out.objective, [6, 3]);
  const m = fromMapJson({ ...json, objective: null });
  assert.deepEqual(m.objective, H(6, 3), 'a map without one gets it under its first OPFOR team');
  m.enemies.push(H(2, 2));
  assert.equal(toMapJson(m, balance).mission.brief, 'Take and hold the objective at 6,3. 2 OPFOR fireteams defend the area.');
});
