// The TS Hub, when it serves the game (/games/fix-and-flank/play, /editor):
// - maps: a member's drafts are kept there and published from there, and
//   published maps are locked for good (the editor);
// - runs: a game on a published map is recorded there: the hub hands out the
//   seed, takes BLUFOR's orders at the end and plays them through itself for the
//   result (the game; src/ai/run.js), and serves finished runs for «Повтор».
// Served on its own (npm start) there is no hub: the editor keeps maps in this
// browser (store.js) and games aren't recorded.

const API = '/api/games/fix-and-flank/maps';
const RUNS = '/api/games/fix-and-flank/runs';

export const hubSrc = (id) => `${API}/${encodeURIComponent(id)}`;
export const hubMapPage = (id) => `/games/fix-and-flank/maps/${encodeURIComponent(id)}`;
export const hubHome = '/games/fix-and-flank';

// The hub's id of a map from its ?src= URL (this site's /api/games/fix-and-flank/maps/<id>), or null.
export function hubIdOf(src) {
  try {
    const url = new URL(src, location.href);
    const m = url.origin === location.origin && url.pathname.match(/^\/api\/games\/fix-and-flank\/maps\/([^/]+)$/);
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

async function call(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? `Хаб ответил ${res.status}`), { status: res.status });
  return data;
}

// The hub, if it is there and the viewer may keep maps: { name, maps: [{ id, name, status, updatedAt, publishedAt }] }.
// Null when the editor runs on its own; { error } when the hub is there but says no (signed out, not a member).
export async function connectHub() {
  try {
    return await call('GET', `${API}?mine=1`);
  } catch (err) {
    return err.status === 401 || err.status === 403 ? { error: err.message } : null;
  }
}

export const runs = {
  start: (mapId) => call('POST', RUNS, { mapId }), //          → { id, seed }
  finish: (id, commits) => call('POST', `${RUNS}/${encodeURIComponent(id)}/finish`, { commits }), // → { result, turns, record, best }
  load: (id) => call('GET', `${RUNS}/${encodeURIComponent(id)}`), // → { mapId, mapName, player, seed, commits, result, turns, sameRules }
};

export const hub = {
  mine: () => call('GET', `${API}?mine=1`),
  load: (id) => call('GET', hubSrc(id)),
  create: (body) => call('POST', API, body), //          { name, json, thumb? } → { id }
  save: (id, body) => call('PUT', hubSrc(id), body), // { name, json, thumb? } → { id }
  publish: (id, body) => call('POST', `${hubSrc(id)}/publish`, body), // → { id }
  remove: (id) => call('DELETE', hubSrc(id)),
};
