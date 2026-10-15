// Mission end. A map may carry a mission:
//   "mission": { "attacker": "BLUFOR", "defender": "OPFOR", "brief": "..." }
// and an "objective" hex. There is no turn limit: turns are counted, the
// fight goes on until one side wins. The attacker wins by holding the
// objective with a fireteam at the end of a turn, or by eliminating every
// defending fireteam. The defender wins by eliminating every attacking
// fireteam, or when the attack has stalled: no attacking unit able to act
// for turn.stalemateTurns turns in a row (every team pinned and unable to
// rally, say next to the enemy with no SL; phases.js notes who could act).
// A map without a mission never ends.

import { same } from './hex.js';
import { isActive } from './state.js';

const teams = (state, side) => state.units.filter((u) => u.side === side && u.kind === 'team' && isActive(u));

// After any action: a side with no fireteams left has lost. { winner, why } or null.
export function eliminationResult(state) {
  const m = state.map.mission;
  if (!m) return null;
  if (!teams(state, m.defender).length) return { winner: m.attacker, why: `all ${m.defender} fireteams eliminated` };
  if (!teams(state, m.attacker).length) return { winner: m.defender, why: `all ${m.attacker} fireteams eliminated` };
  return null;
}

// At the end of a turn: is the objective held? Has the attack stalled?
// Mutates state: counts the turns in a row in which the attacker could not act.
export function turnEndResult(state) {
  const m = state.map.mission;
  if (!m) return null;
  const obj = state.map.objective && { col: state.map.objective[0], row: state.map.objective[1] };
  const holder = obj && teams(state, m.attacker).find((u) => same(u.pos, obj));
  if (holder) return { winner: m.attacker, why: `${m.attacker} ${holder.team} holds the objective` };
  state.stalledTurns = state.attackerCouldAct ? 0 : state.stalledTurns + 1;
  state.attackerCouldAct = false;
  const n = state.balance.turn.stalemateTurns;
  if (state.stalledTurns >= n) return { winner: m.defender, why: `${m.attacker}'s attack stalled: no unit could act for ${n} turns` };
  return null;
}

// Record the result: the game is over, nobody acts any more.
export function endGame(state, result, events) {
  state.result = result;
  state.activeSide = null;
  events.push({ type: 'game_over', turn: state.turn, ...result });
}
