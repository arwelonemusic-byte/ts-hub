// Mission end conditions.
import { test } from 'node:test';
import { turnsText } from '../src/text.js';
import assert from 'node:assert/strict';
import { applyAction, validateAction } from '../src/sim/actions.js';
import { commitOrders } from '../src/sim/orders.js';
import { parseMap } from '../src/sim/map.js';
import { createRng } from '../src/sim/rng.js';
import { createState } from '../src/sim/state.js';
import { H, LEGEND, balance, loadJson, open, toPhase, unit } from './helpers.js';

const MISSION = { attacker: 'BLUFOR', defender: 'OPFOR' };
function missionState(units, { rows = open(6, 6), objective = [3, 1], mission = MISSION } = {}) {
  const map = parseMap({ width: rows[0].length, height: rows.length, legend: LEGEND, rows, units, objective, mission }, balance);
  return createState({ balance, map, seed: 1 });
}
const commit = (s, a = []) => commitOrders(s, a, createRng(s.rngState));

test('holding the objective with a fireteam at the end of a turn wins', () => {
  let s = missionState([unit('BLUFOR', 'ALPHA', 3, 2), unit('OPFOR', 'ALPHA', 0, 5)]);
  s = commit(s, [{ type: 'move', unit: 0, to: H(3, 1) }]).state;
  assert.equal(s.result, null, 'not before the turn ends');
  const r = commit(s);
  assert.deepEqual(r.state.result, { winner: 'BLUFOR', why: 'BLUFOR ALPHA удерживает объект' });
  assert.ok(r.events.some((e) => e.type === 'game_over' && e.winner === 'BLUFOR'));
  assert.equal(r.state.activeSide, null);
});

test('the SL alone does not hold the objective', () => {
  let s = missionState([unit('BLUFOR', 'ALPHA', 0, 5), unit('BLUFOR', 'SL', 3, 1, { kind: 'leader' }), unit('OPFOR', 'ALPHA', 5, 5)]);
  for (let i = 0; i < 20 && !s.result; i++) s = commit(s).state;
  assert.equal(s.result, null, 'turn after turn with only the SL on it, and no win');
  assert.ok(s.turn > 5);
});

test('there is no turn limit: turns are counted and the fight goes on until a side wins', () => {
  let s = missionState([unit('BLUFOR', 'ALPHA', 0, 5), unit('OPFOR', 'ALPHA', 5, 5)]);
  for (let i = 0; i < 60; i++) s = commit(s).state;
  assert.equal(s.result, null);
  assert.ok(s.turn > 15, `turn ${s.turn}`);
});

test('eliminating every enemy fireteam ends it at once; nothing more can be ordered', () => {
  const s = missionState([unit('BLUFOR', 'ALPHA', 2, 2), unit('OPFOR', 'ALPHA', 3, 2)]);
  s.units[1].status = 'pinned';
  s.units[1].soldiers = ['AR'];
  for (let seed = 1; seed <= 20; seed++) {
    const r = applyAction(s, { type: 'move', unit: 0, to: H(3, 2) }, createRng(seed));
    if (r.state.units[1].status !== 'eliminated') continue;
    assert.deepEqual(r.state.result, { winner: 'BLUFOR', why: 'все группы OPFOR уничтожены' });
    assert.match(validateAction(r.state, { type: 'pass', unit: 0 }).reason, /задача уже завершена/);
    assert.deepEqual(commit(r.state).events, [], 'committing after the end does nothing');
    return;
  }
  assert.fail('never eliminated');
});

test('losing every fireteam loses, even with the SL alive', () => {
  const s = toPhase(missionState([unit('BLUFOR', 'ALPHA', 3, 3), unit('BLUFOR', 'SL', 0, 5, { kind: 'leader' }), unit('OPFOR', 'ALPHA', 3, 2)]), 'enemy action');
  s.units[0].status = 'pinned';
  s.units[0].soldiers = ['AR'];
  for (let seed = 1; seed <= 20; seed++) {
    const r = applyAction(s, { type: 'move', unit: 2, to: H(3, 3) }, createRng(seed));
    if (r.state.units[0].status !== 'eliminated') continue;
    assert.equal(r.state.result.winner, 'OPFOR');
    return;
  }
  assert.fail('never eliminated');
});

test('a map without a mission never ends', () => {
  let s = missionState([unit('BLUFOR', 'ALPHA', 0, 5), unit('OPFOR', 'ALPHA', 5, 5)], { mission: null });
  for (let i = 0; i < 30; i++) s = commit(s).state;
  assert.equal(s.result, null);
  assert.ok(s.turn > 10);
});

test('mission 1 loads with its mission and drills', () => {
  const json = loadJson('data/maps/trenchline.json');
  const map = parseMap(json, balance);
  assert.equal(map.mission.turns, undefined, 'no turn limit');
  assert.deepEqual(map.objective, [6, 3]);
  const s = createState({ balance, map, seed: 1 });
  assert.equal(s.units.filter((u) => u.side === 'OPFOR').length, 1);
  assert.ok(json.drills.frontal && json.drills.fixAndFlank);
});

test('an attack that cannot act for a few turns has stalled: the defender wins', () => {
  // BLUFOR's only team pinned next to an enemy: it cannot rally there, and there is no SL to help.
  let t = missionState([unit('BLUFOR', 'ALPHA', 2, 2), unit('OPFOR', 'ALPHA', 3, 2)]);
  t.units[0].status = 'pinned';
  for (let i = 0; i < 40 && !t.result; i++) t = commit(t).state; // OPFOR holds
  const n = balance.turn.stalemateTurns;
  assert.deepEqual(t.result, { winner: 'OPFOR', why: `атака BLUFOR захлебнулась: никто не мог действовать ${turnsText(n)} подряд` });
  assert.equal(t.turn, n + 1, 'turn 1 counts as a turn it could act in');
});

test('holding by choice is not a stall: the turns go on', () => {
  let s = missionState([unit('BLUFOR', 'ALPHA', 0, 5), unit('OPFOR', 'ALPHA', 5, 5)]);
  for (let i = 0; i < 30; i++) s = commit(s).state;
  assert.equal(s.result, null);
  assert.equal(s.stalledTurns, 0);
});
