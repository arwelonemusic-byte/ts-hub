// A run: a whole game from its seed and BLUFOR's orders. The UI records each
// commit of the player's orders (src/hub.js sends them to the TS Hub); OPFOR's
// come from the AI, which is deterministic, so they are played again rather than
// kept. playRun plays a run through: the hub uses it to get a run's result
// itself (so a record can't be typed in), and the game to play one back.

import { chooseOrders } from './basic.js';
import { commitOrders } from '../sim/orders.js';
import { createRng } from '../sim/rng.js';
import { createState } from '../sim/state.js';

export const PLAYER = 'BLUFOR';
export const RUN_LIMITS = { commits: 1000, actions: 16, steps: 5000 }; // commits a run may hold, actions in one, commits played in all

// One commit of the side to act: the player's orders, or the AI's for OPFOR.
export function commitTurn(state, orders) {
  return commitOrders(state, orders, createRng(state.rngState)).state;
}

// Play the run until it ends or its recorded orders run out.
// Returns { state, used } (used: how many of `commits` were played).
export function playRun({ balance, map, seed, commits }) {
  let state = createState({ balance, map, seed });
  let used = 0;
  for (let step = 0; step < RUN_LIMITS.steps && !state.result && state.activeSide; step++) {
    if (state.activeSide === PLAYER) {
      if (used >= commits.length) break;
      state = commitTurn(state, commits[used++]);
    } else {
      state = commitTurn(state, chooseOrders(state, state.activeSide));
    }
  }
  return { state, used };
}

// A run as sent from a browser, checked for shape only (the rules check each order as it is played):
// an array of commits, each an array of { type, unit, ... } orders. Returns the commits or an error.
export function readCommits(input) {
  if (!Array.isArray(input) || input.length > RUN_LIMITS.commits) return { error: 'A run is a list of commits.' };
  for (const c of input) {
    if (!Array.isArray(c) || c.length > RUN_LIMITS.actions) return { error: 'A commit is a short list of orders.' };
    for (const a of c) {
      if (!a || typeof a !== 'object' || typeof a.type !== 'string' || !Number.isInteger(a.unit)) return { error: 'An order has a type and a unit.' };
    }
  }
  return { commits: input };
}
