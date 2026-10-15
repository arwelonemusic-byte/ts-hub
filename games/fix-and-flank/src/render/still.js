// A still of a map: its card in the hub's lists. Drawn once in a hidden view
// of its own, from the same angle as the preview starts at, and returned as a
// JPEG data URL. Shows BLUFOR's squad and the objective, never OPFOR (in the
// game it has to be found).

import { createWorld } from './world3d.js';
import { center } from '../sim/hex.js';
import { unitType } from '../sim/state.js';

export const STILL = { width: 640, height: 400, pad: 0.07, quality: 0.85 }; // pad: share of the smaller side kept clear

// Counters for a map's BLUFOR units (map JSON units), as the 3D view draws them.
export function squadCounters(units, balance) {
  return (units ?? [])
    .filter((u) => u.side === 'BLUFOR')
    .map((u, id) => {
      const kind = u.kind ?? 'team';
      const type = u.type ?? null;
      return {
        unit: { id, side: u.side, team: u.team, kind, type, soldiers: [...unitType(balance, { kind, type }).roles], status: 'ok', activated: false, exposed: false, moved: false },
        pos: center({ col: u.pos[0], row: u.pos[1] }), selected: false, ghost: false, stackedWithTeam: false,
      };
    });
}

// map: a parsed map (sim/map.js) without units; units: the map JSON's units.
export async function mapStill(map, units, balance) {
  const box = document.createElement('div');
  Object.assign(box.style, { position: 'fixed', left: '-10000px', top: '0', width: `${STILL.width}px`, height: `${STILL.height}px` });
  const canvas = document.createElement('canvas');
  Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
  box.append(canvas);
  document.body.append(box);
  const world = createWorld(canvas, map, { pickCounters: false });
  try {
    const p = Math.round(Math.min(STILL.width, STILL.height) * STILL.pad);
    world.camera.fit(STILL.width, STILL.height, { left: p, right: p, top: p, bottom: p });
    const frame = { counters: squadCounters(units, balance), rosterOf: (u) => unitType(balance, u).roles, bangs: [], shots: [], sig: '', paint: () => {} };
    // Two frames, so the figures stand where they belong; the picture is taken right after the second.
    return await new Promise((done) => {
      requestAnimationFrame((t1) => {
        world.render(t1, frame);
        requestAnimationFrame((t2) => {
          world.render(t2, frame);
          done(world.snapshot('image/jpeg', STILL.quality));
        });
      });
    });
  } finally {
    world.dispose();
    box.remove();
  }
}
