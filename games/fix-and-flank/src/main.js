// Browser entry point. Loads data, builds the initial state, starts the UI.

import { parseMap } from './sim/map.js';
import { createState } from './sim/state.js';
import { LOCAL, loadMap } from './editor/store.js';
import { startApp } from './ui/app.js';

const DEFAULT_MAP = 'trenchline';
const DEFAULT_SEED = 1;

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

// A map by its ?map= name: a file in data/maps, or one made in the editor and saved in this browser.
// ?src=<url> instead: a map JSON on this site (the hub's maps, /api/games/fix-and-flank/maps/<id>).
async function loadMapJson(name, src) {
  if (src) {
    const url = new URL(src, location.href);
    if (url.origin !== location.origin) throw new Error('Maps load from this site only');
    return loadJson(url.href);
  }
  if (!name.startsWith(LOCAL)) return loadJson(`data/maps/${encodeURIComponent(name)}.json`);
  const json = loadMap(name.slice(LOCAL.length));
  if (!json) throw new Error(`Map "${name.slice(LOCAL.length)}" is not saved in this browser`);
  return json;
}

async function main() {
  const params = new URLSearchParams(location.search);
  const mapName = params.get('map') ?? DEFAULT_MAP;
  const seed = Number(params.get('seed') ?? DEFAULT_SEED);
  const [balance, mapJson] = await Promise.all([loadJson('data/balance.json'), loadMapJson(mapName, params.get('src'))]);
  const state = createState({ balance, map: parseMap(mapJson, balance), seed });
  window.app = startApp(state, { reveal: params.get('reveal') === '1' }); // exposed for debugging in the console
}

main().catch((err) => {
  console.error(err);
  document.getElementById('status').textContent = `Error: ${err.message}`;
});
