// The editor's terrain palette in pictures: each terrain as one hex of the
// board, drawn by the 3D view itself, so the palette always shows what the
// brush paints. Drawn once, one board after another in a hidden view of its
// own, on a clear background, and cropped to the tile. PNG data URLs by
// terrain name.

import { createWorld } from './world3d.js';
import { parseMap } from '../sim/map.js';

// view: the hidden view's side in px (the camera can't come close enough for one
// hex to fill it, hence the crop); pad: share of the picture kept clear round the
// tile; alpha: how opaque a pixel must be to count as the tile; tilt: px of a
// right-drag up (the camera's steepest).
export const TILE = { view: 360, pad: 0.04, alpha: 8, tilt: 100 };

const KEY = 'x';
const oneHex = (terrain, balance) => parseMap({ width: 1, height: 1, legend: { [KEY]: terrain }, rows: [KEY] }, balance);

export async function tilePictures(terrains, balance) {
  const box = document.createElement('div');
  Object.assign(box.style, { position: 'fixed', left: '-10000px', top: '0', width: `${TILE.view}px`, height: `${TILE.view}px` });
  const canvas = document.createElement('canvas');
  Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
  box.append(canvas);
  document.body.append(box);
  const world = createWorld(canvas, oneHex(terrains[0], balance), { pickCounters: false, tile: true });
  const frame = { counters: [], rosterOf: () => [], bangs: [], shots: [], sig: '', paint: () => {} };
  const shots = {};
  try {
    for (const t of terrains) {
      world.setMap(oneHex(t, balance));
      world.camera.fit(TILE.view, TILE.view);
      world.camera.orbit(0, TILE.tilt); // looking down more steeply than the board's camera does: more ground, less earth
      world.render(performance.now(), frame);
      shots[t] = world.snapshot('image/png');
    }
  } finally {
    world.dispose();
    box.remove();
  }
  const out = {};
  for (const t of terrains) out[t] = await crop(shots[t]);
  return out;
}

// The picture cut down to what was drawn on it, with a little room round it.
async function crop(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] < TILE.alpha) continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  if (x1 < 0) return null;
  const pad = Math.round(Math.max(x1 - x0, y1 - y0) * TILE.pad);
  const w = x1 - x0 + 1 + 2 * pad;
  const h = y1 - y0 + 1 + 2 * pad;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  out.getContext('2d').drawImage(c, x0 - pad, y0 - pad, w, h, 0, 0, w, h);
  return out.toDataURL('image/png');
}
