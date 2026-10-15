// A map turning slowly in 3D, nothing else (preview.html): the hub shows it
// on a map's page. ?map=<name> is a file in data/maps; ?src=<url> is a map
// JSON on this site (the hub's maps). BLUFOR's squad and the objective are
// shown; OPFOR is not (in the game it has to be found). ?still=1 keeps the
// first view, for a still of the map.

import { squadCounters } from './render/still.js';
import { createWorld } from './render/world3d.js';
import { parseMap } from './sim/map.js';
import { unitType } from './sim/state.js';

const TURN_PX_PER_S = 14;  // camera orbit speed, in the camera's drag pixels per second (about one turn a minute)
const FIT_PAD = 0.07;      // share of the smaller side kept clear around the fitted map (it turns, so its corners swing out)

async function loadJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Не удалось загрузить ${url}: ${res.status}`);
  return res.json();
}

function mapUrl(params) {
  const src = params.get('src');
  if (src) {
    const url = new URL(src, location.href);
    if (url.origin !== location.origin) throw new Error('Карты загружаются только с этого сайта');
    return url.href;
  }
  return `data/maps/${encodeURIComponent(params.get('map') ?? 'trenchline')}.json`;
}

async function main() {
  const params = new URLSearchParams(location.search);
  const turning = params.get('still') !== '1';
  const [balance, json] = await Promise.all([loadJson('data/balance.json'), loadJson(mapUrl(params))]);
  const map = parseMap({ ...json, units: [] }, balance);
  const canvas = document.getElementById('board');
  const world = createWorld(canvas, map, { pickCounters: false });
  const cam = world.camera;
  const rosterOf = (u) => unitType(balance, u).roles;
  const counters = squadCounters(json.units, balance);
  const fit = () => {
    const p = Math.round(Math.min(canvas.clientWidth, canvas.clientHeight) * FIT_PAD);
    cam.fit(canvas.clientWidth, canvas.clientHeight, { left: p, right: p, top: p, bottom: p });
  };
  window.addEventListener('resize', fit);
  fit();
  let last = performance.now();
  const frame = (now) => {
    if (turning) cam.orbit(-TURN_PX_PER_S * ((now - last) / 1000), 0);
    last = now;
    world.render(now, { counters, rosterOf, bangs: [], shots: [], sig: '', paint: () => {} }); // no marks beyond the objective
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

main().catch((err) => {
  console.error(err);
  document.getElementById('status').textContent = `Ошибка: ${err.message}`;
});
