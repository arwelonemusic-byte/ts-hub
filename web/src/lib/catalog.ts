import type { Mission, PastEvent, UpcomingEvent } from "@/lib/types";

/** A mission as the catalogue lists it: no event details, just what the filters and the order need. */
export interface CatalogMission {
  id: string;
  name: string;
  mapKey: string;
  mapLabel: string;
  coverUrl: string | null;
  authors: string[];
  tags: string[];
  /** Soonest scheduled game. */
  nextAt: string | null;
  /** Most recently played game. */
  lastPlayedAt: string | null;
}

/** Filters, mirrored in the URL (?q=&map=&author=&tag=&tag=). */
export interface CatalogQuery {
  q: string;
  map: string;
  author: string;
  tags: string[];
}

export function toCatalog(missions: Mission[], upcoming: UpcomingEvent[], past: PastEvent[]): CatalogMission[] {
  return missions.map((m) => {
    const next = upcoming.filter((e) => e.mission.id === m.id).map((e) => e.startsAt).sort()[0] ?? null;
    const last = past.filter((e) => e.mission.id === m.id).map((e) => e.startsAt).sort().at(-1) ?? null;
    return { id: m.id, name: m.name, mapKey: m.mapKey, mapLabel: m.mapLabel, coverUrl: m.coverUrl, authors: m.authors, tags: m.tags, nextAt: next, lastPlayedAt: last };
  });
}

export function parseCatalogQuery(sp: Record<string, string | string[] | undefined>): CatalogQuery {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const tag = sp.tag;
  return {
    q: one(sp.q),
    map: one(sp.map),
    author: one(sp.author),
    tags: Array.isArray(tag) ? tag : tag ? [tag] : [],
  };
}

export function catalogSearch(q: CatalogQuery): string {
  const p = new URLSearchParams();
  if (q.q) p.set("q", q.q);
  if (q.map) p.set("map", q.map);
  if (q.author) p.set("author", q.author);
  for (const t of q.tags) p.append("tag", t);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** A mission must match every filter, and carry every selected tag. Scheduled soonest first, then the most recently played, then never played. */
export function filterCatalog(missions: CatalogMission[], q: CatalogQuery): CatalogMission[] {
  const needle = q.q.trim().toLocaleLowerCase("ru");
  const out = missions.filter(
    (m) =>
      (!needle || m.name.toLocaleLowerCase("ru").includes(needle)) &&
      (!q.map || m.mapKey === q.map) &&
      (!q.author || m.authors.includes(q.author)) &&
      q.tags.every((t) => m.tags.includes(t)),
  );
  const byName = (a: CatalogMission, b: CatalogMission) => a.name.localeCompare(b.name, "ru");
  return out.sort((a, b) => {
    if (a.nextAt && b.nextAt) return a.nextAt.localeCompare(b.nextAt);
    if (a.nextAt || b.nextAt) return a.nextAt ? -1 : 1;
    return (b.lastPlayedAt ?? "").localeCompare(a.lastPlayedAt ?? "") || byName(a, b);
  });
}

/** Catalogue tags in the order the filter shows them: era, gear, then the rest; unknown tags go last, A–Z. */
const TAG_ORDER = ["2000+", "1980s", "west-gear", "east-gear", "artillery", "CAS", "Zombie", "Золотой фонд", "broken"];

export function catalogTags(missions: CatalogMission[]): string[] {
  const all = [...new Set(missions.flatMap((m) => m.tags))];
  const rank = (t: string) => (TAG_ORDER.includes(t) ? TAG_ORDER.indexOf(t) : TAG_ORDER.length);
  return all.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, "ru"));
}
