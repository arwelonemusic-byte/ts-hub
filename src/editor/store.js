// Maps made in the editor, kept in this browser (localStorage): a library of
// saved maps in the data/maps format, and the editor's draft. The game plays
// a saved map with ?map=local:<id>. Storage can be missing or full (private
// windows, blocked site data): every call copes and says so by its result.

import { upgradeMapJson } from './model.js';

const LIBRARY = 'fixAndFlank.maps';   // { id: { json, saved } }
const DRAFT = 'fixAndFlank.draft';    // { model, id, view }
export const LOCAL = 'local:';        // ?map= prefix for a saved map

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// [{ id, name, size, saved }], newest first.
export function listMaps() {
  const lib = read(LIBRARY) ?? {};
  return Object.entries(lib)
    .map(([id, { json, saved }]) => ({ id, name: json.name, size: `${json.width} x ${json.height}`, saved }))
    .sort((a, b) => b.saved - a.saved);
}

export function loadMap(id) {
  const json = (read(LIBRARY) ?? {})[id]?.json ?? null;
  return json && upgradeMapJson(json); // saved by an earlier version
}

// Saves under id (a new one when missing); returns the id, or null when storage failed.
export function saveMap(json, id = null) {
  const lib = read(LIBRARY) ?? {};
  const slug = (json.name || 'map').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'map';
  const key = id ?? `${slug}-${Date.now().toString(36)}`;
  lib[key] = { json, saved: Date.now() };
  return write(LIBRARY, lib) ? key : null;
}

export function deleteMap(id) {
  const lib = read(LIBRARY) ?? {};
  delete lib[id];
  return write(LIBRARY, lib);
}

export function loadDraft() {
  return read(DRAFT);
}

export function saveDraft(draft) {
  return write(DRAFT, draft);
}
