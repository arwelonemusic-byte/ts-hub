// The TS Hub's maps, when the hub serves the editor (/games/fix-and-flank/editor):
// a member's drafts are kept there and published from there, and published maps
// are locked for good. Served on its own (npm start) there is no hub, and the
// editor keeps maps in this browser instead (store.js).

const API = '/api/games/fix-and-flank/maps';

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
  if (!res.ok) throw Object.assign(new Error(data.error ?? `The hub answered ${res.status}`), { status: res.status });
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

export const hub = {
  mine: () => call('GET', `${API}?mine=1`),
  load: (id) => call('GET', hubSrc(id)),
  create: (body) => call('POST', API, body), //          { name, json, thumb? } → { id }
  save: (id, body) => call('PUT', hubSrc(id), body), // { name, json, thumb? } → { id }
  publish: (id, body) => call('POST', `${hubSrc(id)}/publish`, body), // → { id }
  remove: (id) => call('DELETE', hubSrc(id)),
};
