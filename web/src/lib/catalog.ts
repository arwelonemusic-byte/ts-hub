import type { Mission, PastEvent } from "@/lib/types";

/** A mission as the catalogue lists it: no event details, just what the filters and the order need. */
export interface CatalogMission {
  id: string;
  name: string;
  mapKey: string;
  mapLabel: string;
  coverUrl: string | null;
  authors: string[];
  tags: string[];
  /** When it was added to the hub. */
  addedAt: string;
  /** Most recently played game. */
  lastPlayedAt: string | null;
}

/** The sort control's options, in its order; the first is the default and stays out of the URL. */
export const CATALOG_SORTS = ["new", "az", "za", "played"] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];

/** Filters and the sort, mirrored in the URL (?q=&map=&author=&tag=&tag=&sort=). */
export interface CatalogQuery {
  q: string;
  map: string;
  author: string;
  tags: string[];
  sort: CatalogSort;
}

export function toCatalog(missions: Mission[], past: PastEvent[]): CatalogMission[] {
  return missions.map((m) => {
    const last = past.filter((e) => e.mission.id === m.id).map((e) => e.startsAt).sort().at(-1) ?? null;
    return { id: m.id, name: m.name, mapKey: m.mapKey, mapLabel: m.mapLabel, coverUrl: m.coverUrl, authors: m.authors, tags: m.tags, addedAt: m.addedAt, lastPlayedAt: last };
  });
}

export function parseCatalogQuery(sp: Record<string, string | string[] | undefined>): CatalogQuery {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const tag = sp.tag;
  const sort = CATALOG_SORTS.find((s) => s === one(sp.sort)) ?? CATALOG_SORTS[0];
  return {
    q: one(sp.q),
    map: one(sp.map),
    author: one(sp.author),
    tags: Array.isArray(tag) ? tag : tag ? [tag] : [],
    sort,
  };
}

export function catalogSearch(q: CatalogQuery): string {
  const p = new URLSearchParams();
  if (q.q) p.set("q", q.q);
  if (q.map) p.set("map", q.map);
  if (q.author) p.set("author", q.author);
  for (const t of q.tags) p.append("tag", t);
  if (q.sort !== CATALOG_SORTS[0]) p.set("sort", q.sort);
  const s = p.toString();
  return s ? `?${s}` : "";
}

const byName = (a: CatalogMission, b: CatalogMission) => a.name.localeCompare(b.name, "ru");

/**
 * Newest in the hub first (the seeded catalogue shares one `created_at`, so it falls back to A–Z), by name, or the most
 * recently played first. Only played games count there: a mission that is scheduled but never played goes to the end
 * with the ones never played, A–Z.
 */
const ORDER: Record<CatalogSort, (a: CatalogMission, b: CatalogMission) => number> = {
  new: (a, b) => b.addedAt.localeCompare(a.addedAt) || byName(a, b),
  az: byName,
  za: (a, b) => byName(b, a),
  played: (a, b) => (b.lastPlayedAt ?? "").localeCompare(a.lastPlayedAt ?? "") || byName(a, b),
};

/** A mission must match every filter, and carry every selected tag; the rest come in the query's order. */
export function filterCatalog(missions: CatalogMission[], q: CatalogQuery): CatalogMission[] {
  const needle = q.q.trim().toLocaleLowerCase("ru");
  const out = missions.filter(
    (m) =>
      (!needle || m.name.toLocaleLowerCase("ru").includes(needle)) &&
      (!q.map || m.mapKey === q.map) &&
      (!q.author || m.authors.includes(q.author)) &&
      q.tags.every((t) => m.tags.includes(t)),
  );
  return out.sort(ORDER[q.sort]);
}

/** Catalogue tags in the order the filter shows them: era, gear, then the rest; unknown tags go last, A–Z. */
const TAG_ORDER = ["2000+", "1980s", "west-gear", "east-gear", "artillery", "CAS", "Zombie", "Золотой фонд", "broken"];

export function catalogTags(missions: CatalogMission[]): string[] {
  const all = [...new Set(missions.flatMap((m) => m.tags))];
  const rank = (t: string) => (TAG_ORDER.includes(t) ? TAG_ORDER.indexOf(t) : TAG_ORDER.length);
  return all.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, "ru"));
}
