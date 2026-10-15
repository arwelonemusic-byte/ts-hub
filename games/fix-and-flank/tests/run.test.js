import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseOrders } from '../src/ai/basic.js';
import { fixAndFlank, frontalAssault, playOut } from '../src/ai/drills.js';
import { PLAYER, playRun, readCommits } from '../src/ai/run.js';
import { parseMap } from '../src/sim/map.js';
import { commitOrders } from '../src/sim/orders.js';
import { createRng } from '../src/sim/rng.js';
import { createState } from '../src/sim/state.js';
import { balance, loadJson } from './helpers.js';

const json = loadJson('data/maps/trenchline.json');
const map = parseMap(json, balance);

// Play a scripted game as the UI would, keeping BLUFOR's commits the way the recorder does.
function record(plan, seed) {
  const commits = [];
  const blufor = plan(json.drills);
  const end = playOut(createState({ balance, map, seed }), (s) => {
    const orders = blufor(s);
    commits.push(JSON.parse(JSON.stringify(orders)));
    return orders;
  }, chooseOrders, commitOrders, createRng);
  return { end, commits };
}

test('a run (seed and BLUFOR\'s orders) plays back to the same end: who won, why, on which turn', () => {
  for (const [plan, seed] of [[fixAndFlank, 3], [fixAndFlank, 17], [frontalAssault, 5]]) {
    const { end, commits } = record(plan, seed);
    assert.ok(end.result, 'the scripted game ended');
    const { state, used } = playRun({ balance, map, seed, commits });
    assert.equal(used, commits.length, 'every commit was played');
    assert.deepEqual(state.result, end.result);
    assert.equal(state.turn, end.turn);
    assert.deepEqual(state.units, end.units);
  }
});

test('the same orders with other dice play out differently; a run cut short has no result', () => {
  const { end, commits } = record(fixAndFlank, 3);
  const other = playRun({ balance, map, seed: 4, commits });
  assert.notDeepEqual(other.state.units, end.units, 'other dice, other game');
  const short = playRun({ balance, map, seed: 3, commits: commits.slice(0, 3) });
  assert.equal(short.state.result, null);
  assert.equal(short.used, 3);
  assert.equal(short.state.activeSide, PLAYER, 'it stops when the player has to give orders');
});

test('a sent run is checked for shape before it is played', () => {
  assert.ok(readCommits([[{ type: 'move', unit: 0, to: { col: 1, row: 1 } }], []]).commits);
  assert.ok(readCommits('nope').error);
  assert.ok(readCommits([['x']]).error);
  assert.ok(readCommits([[{ type: 'move' }]]).error, 'an order needs a unit');
  assert.ok(readCommits(Array.from({ length: 1001 }, () => [])).error, 'too many commits');
});
