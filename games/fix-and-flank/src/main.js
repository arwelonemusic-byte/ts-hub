// Browser entry point. Loads data, builds the initial state, starts the UI.

import { parseMap } from './sim/map.js';
import { createState } from './sim/state.js';
import { LOCAL, loadMap } from './editor/store.js';
import { hubIdOf, hubSrc, runs } from './hub.js';
import { startApp } from './ui/app.js';

const DEFAULT_MAP = 'trenchline';
const DEFAULT_SEED = 1;

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Не удалось загрузить ${path}: ${res.status}`);
  return res.json();
}

// A map by its ?map= name: a file in data/maps, or one made in the editor and saved in this browser.
// ?src=<url> instead: a map JSON on this site (the hub's maps, /api/games/fix-and-flank/maps/<id>).
async function loadMapJson(name, src) {
  if (src) {
    const url = new URL(src, location.href);
    if (url.origin !== location.origin) throw new Error('Карты загружаются только с этого сайта');
    return loadJson(url.href);
  }
  if (!name.startsWith(LOCAL)) return loadJson(`data/maps/${encodeURIComponent(name)}.json`);
  const json = loadMap(name.slice(LOCAL.length));
  if (!json) throw new Error(`Карта «${name.slice(LOCAL.length)}» не сохранена в этом браузере`);
  return json;
}

// Keeps BLUFOR's commits as they are made, and sends them to the hub at the end.
function recorderFor(runId) {
  const commits = [];
  return {
    id: runId,
    commit: (orders) => commits.push(JSON.parse(JSON.stringify(orders))),
    finish: () => runs.finish(runId, commits),
  };
}

const randomSeed = () => 1 + Math.floor(Math.random() * 0x7ffffffe);

// ?replay=<run>: a run from the hub, played back («Повтор»). ?src= of a published hub map: a recorded run, with
// the hub's seed (unless &playtest=1, the author trying a draft). Otherwise a game as before: ?map=, ?seed=.
async function main() {
  const params = new URLSearchParams(location.search);
  const balance = await loadJson('data/balance.json');
  const src = params.get('src');
  let seed = params.has('seed') ? Number(params.get('seed')) : src ? randomSeed() : DEFAULT_SEED;
  let mapJson;
  const options = { reveal: params.get('reveal') === '1' };
  if (params.get('replay')) {
    const run = await runs.load(params.get('replay'));
    mapJson = await loadJson(hubSrc(run.mapId));
    seed = run.seed;
    options.replay = { mapId: run.mapId, commits: run.commits, at: 0, player: run.player, result: run.result, turns: run.turns, sameRules: run.sameRules };
  } else {
    mapJson = await loadMapJson(params.get('map') ?? DEFAULT_MAP, src);
    const mapId = src && !params.has('playtest') ? hubIdOf(src) : null;
    if (mapId) {
      try {
        const run = await runs.start(mapId);
        seed = run.seed;
        options.recorder = recorderFor(run.id);
      } catch (err) {
        options.unrecorded = err.message;
      }
    }
  }
  const state = createState({ balance, map: parseMap(mapJson, balance), seed });
  window.app = startApp(state, options); // exposed for debugging in the console
}

main().catch((err) => {
  console.error(err);
  document.getElementById('status').textContent = `Ошибка: ${err.message}`;
});
