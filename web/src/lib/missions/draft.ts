import type { MissionSquad } from "../types";

/*
 * A mission as the add/edit dialog holds it (components/mission/editor), checked the same way in
 * the browser (to enable «Сохранить») and in the save action. No server imports: both sides use it.
 */

export interface DraftAuthor {
  name: string;
  /** Members only; an author who isn't one is just a name. */
  discordId?: string;
}

export interface DraftBriefing {
  sides: { for: string; against: string };
  sections: { title: string; body: string }[];
}

export interface MissionDraft {
  /** Set when editing. */
  id?: string;
  workshopGuid: string;
  /** The scenario the server loads: "{GUID}Missions/Name.conf". */
  scenarioId: string;
  name: string;
  mapKey: string;
  authors: DraftAuthor[];
  tags: string[];
  briefing: DraftBriefing;
  /** false = a simple op that needs no plan, so no Markers.layer either. */
  planning: boolean;
  /** The Markers.layer text; undefined = keep the mission's (editing), null = none. */
  markersLayer?: string | null;
  /** Played without slotting (RSVP only); squads are ignored then. */
  noSlotting: boolean;
  squads: MissionSquad[];
  /** Take the cover from the Workshop again (editing; a new mission always does). */
  refreshCover?: boolean;
}

/** What a Workshop link told us (lookupWorkshop). */
export interface WorkshopInfo {
  guid: string;
  url: string;
  /** The addon's name with "Operation" dropped. */
  title: string;
  /** The addon's main Workshop image (not a scenario's). */
  coverUrl: string | null;
  scenarios: { id: string; name: string }[];
  /** Maps its terrain dependencies point at: one = preselect it, several = ambiguous, none = base-game map or unknown. */
  terrain: string[];
  /** Scenarios of this addon already in the catalogue. */
  taken: { scenarioId: string; missionId: string; name: string }[];
}

export const LIMITS = {
  name: 80,
  tags: 12,
  tag: 24,
  authors: 8,
  side: 200,
  sections: 30,
  sectionTitle: 80,
  sectionBody: 8000,
  squads: 40,
  squadSlots: 30,
  slots: 200,
  groupId: 24,
  groupName: 40,
  role: 60,
  requiredRole: 40,
  /** Markers.layer, in characters (the catalogue's largest is 13 KB). */
  layer: 2_000_000,
} as const;

export const GUID_RE = /^[0-9A-F]{16}$/;
export const SCENARIO_RE = /^\{[0-9A-F]{16}\}[^\s"]+\.conf$/i;

/** Which step of the dialog an error belongs to, so it can open there. */
export type DraftStep = "workshop" | "briefing" | "slots";

export type DraftError =
  | "workshop"
  | "scenario"
  | "name"
  | "map"
  | "authors"
  | "tags"
  | "briefing"
  | "layer"
  | "layerMissing"
  | "squads"
  | "groupId"
  | "groupDup"
  | "role";

export const ERROR_STEP: Record<DraftError, DraftStep> = {
  workshop: "workshop",
  scenario: "workshop",
  name: "workshop",
  map: "workshop",
  authors: "workshop",
  tags: "workshop",
  briefing: "briefing",
  layer: "briefing",
  layerMissing: "briefing",
  squads: "slots",
  groupId: "slots",
  groupDup: "slots",
  role: "slots",
};

const clip = (s: string | undefined, n: number) => (s ?? "").trim().slice(0, n);

/** Trimmed, with empty briefing sections, blank tags and blank slots dropped. */
export function normalizeDraft(d: MissionDraft): MissionDraft {
  const tags = [...new Set(d.tags.map((t) => clip(t, LIMITS.tag)).filter(Boolean))];
  const seen = new Set<string>();
  const authors = d.authors
    .map((a) => ({ name: clip(a.name, LIMITS.name), ...(a.discordId ? { discordId: a.discordId } : {}) }))
    .filter((a) => a.name && !seen.has(a.discordId ?? a.name) && seen.add(a.discordId ?? a.name));
  return {
    ...d,
    workshopGuid: d.workshopGuid.trim().toUpperCase(),
    scenarioId: d.scenarioId.trim(),
    name: clip(d.name, LIMITS.name),
    authors,
    tags,
    briefing: {
      sides: { for: clip(d.briefing.sides.for, LIMITS.side), against: clip(d.briefing.sides.against, LIMITS.side) },
      sections: d.briefing.sections
        .map((s) => ({ title: clip(s.title, LIMITS.sectionTitle), body: (s.body ?? "").replace(/\r\n?/g, "\n").trim().slice(0, LIMITS.sectionBody) }))
        .filter((s) => s.title || s.body),
    },
    markersLayer: d.planning ? d.markersLayer : null,
    squads: d.noSlotting
      ? []
      : d.squads
          .map((sq) => ({
            groupId: clip(sq.groupId, LIMITS.groupId),
            name: clip(sq.name, LIMITS.groupName),
            slots: sq.slots
              .map((s) => ({ role: clip(s.role, LIMITS.role), ...(s.requiredRole?.trim() ? { requiredRole: clip(s.requiredRole, LIMITS.requiredRole) } : {}) }))
              .filter((s) => s.role || s.requiredRole),
          }))
          .filter((sq) => sq.groupId || sq.name || sq.slots.length),
  };
}

/**
 * The first thing that stops a (normalized) draft from saving, or null.
 * `hasLayer`: the mission already has a Markers.layer (editing with the file left as is).
 */
export function checkDraft(d: MissionDraft, mapKeys: readonly string[], hasLayer = false): DraftError | null {
  if (!GUID_RE.test(d.workshopGuid)) return "workshop";
  if (!SCENARIO_RE.test(d.scenarioId)) return "scenario";
  if (!d.name) return "name";
  if (!mapKeys.includes(d.mapKey)) return "map";
  if (d.authors.length > LIMITS.authors) return "authors";
  if (d.tags.length > LIMITS.tags) return "tags";
  if (d.briefing.sections.length > LIMITS.sections || d.briefing.sections.some((s) => !s.title || !s.body)) return "briefing";
  if (d.planning) {
    if (typeof d.markersLayer === "string" && (d.markersLayer.length > LIMITS.layer || d.markersLayer.includes("\0"))) return "layer";
    if (d.markersLayer === null || (d.markersLayer === undefined && !hasLayer)) return "layerMissing";
  }
  if (!d.noSlotting) {
    if (!d.squads.length || d.squads.length > LIMITS.squads) return "squads";
    if (d.squads.reduce((n, sq) => n + sq.slots.length, 0) > LIMITS.slots) return "squads";
    if (d.squads.some((sq) => !sq.groupId)) return "groupId";
    if (new Set(d.squads.map((sq) => sq.groupId.toLowerCase())).size !== d.squads.length) return "groupDup";
    if (d.squads.some((sq) => !sq.slots.length || sq.slots.length > LIMITS.squadSlots || sq.slots.some((s) => !s.role))) return "role";
  }
  return null;
}

/** «Operation Fallen Hawk» → «Fallen Hawk» (the catalogue drops the prefix). */
export const missionTitle = (workshopName: string) =>
  workshopName.replace(/^\s*(operation|операция)\s*[:\-–—]?\s*/i, "").replace(/^["«]|["»]$/g, "").trim() || workshopName.trim();

const CYR: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
  н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

/** URL id from a title: «Wolfs nest» → "wolfs-nest", «Эндзиг» → "endzig". */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[а-яё]/g, (c) => CYR[c] ?? "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "");
}
