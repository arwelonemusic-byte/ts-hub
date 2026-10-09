import { cache } from "react";
import { getDb } from "../db";
import type { Mission, MissionSquad } from "../types";

interface MissionRow {
  id: string;
  name: string;
  map_key: string;
  map_label: string;
  cover_url: string | null;
  workshop_url: string | null;
  addon_guid: string | null;
  scenario_id: string | null;
  briefing: Mission["briefing"] | null;
  tags: string[];
  has_markers_layer: boolean;
  planning: boolean;
  no_slotting: boolean;
}

/** The whole catalogue, once per request. Authors show their current member name when they're members. */
export const loadMissions = cache(async (): Promise<Mission[]> => {
  const db = await getDb();
  const [missions, authors, slots] = await Promise.all([
    db.query(
      `SELECT id, name, map_key, map_label, cover_url, workshop_url, addon_guid, scenario_id, briefing, tags,
              markers_layer IS NOT NULL AS has_markers_layer, planning, no_slotting
       FROM missions ORDER BY name`,
    ) as Promise<MissionRow[]>,
    db.query(
      `SELECT a.mission_id, COALESCE(p.display_name, a.name) AS name
       FROM mission_authors a LEFT JOIN players p ON p.discord_id = a.discord_id
       ORDER BY a.mission_id, a.position`,
    ) as Promise<{ mission_id: string; name: string }[]>,
    db.query(
      `SELECT mission_id, group_id, group_name, role, required_role
       FROM mission_slots ORDER BY mission_id, position`,
    ) as Promise<{ mission_id: string; group_id: string; group_name: string; role: string; required_role: string | null }[]>,
  ]);

  const authorsOf = new Map<string, string[]>();
  for (const a of authors) authorsOf.set(a.mission_id, [...(authorsOf.get(a.mission_id) ?? []), a.name]);
  const squadsOf = new Map<string, MissionSquad[]>();
  for (const s of slots) {
    const squads = squadsOf.get(s.mission_id) ?? [];
    let sq = squads.at(-1);
    if (!sq || sq.groupId !== s.group_id) {
      sq = { groupId: s.group_id, name: s.group_name, slots: [] };
      squads.push(sq);
    }
    sq.slots.push({ role: s.role, ...(s.required_role ? { requiredRole: s.required_role } : {}) });
    squadsOf.set(s.mission_id, squads);
  }

  return missions.map((m) => ({
    id: m.id,
    name: m.name,
    mapKey: m.map_key,
    mapLabel: m.map_label,
    coverUrl: m.cover_url,
    authors: authorsOf.get(m.id) ?? [],
    ...(m.workshop_url ? { workshopUrl: m.workshop_url } : {}),
    ...(m.addon_guid ? { addonGuid: m.addon_guid } : {}),
    ...(m.scenario_id ? { scenarioId: m.scenario_id } : {}),
    ...(m.briefing ? { briefing: m.briefing } : {}),
    tags: m.tags,
    hasMarkersLayer: m.has_markers_layer,
    ...(m.planning ? {} : { planning: false }),
    ...(squadsOf.has(m.id) ? { squads: squadsOf.get(m.id) } : {}),
    ...(m.no_slotting ? { noSlotting: true } : {}),
  }));
});

export const missionMap = cache(async () => new Map((await loadMissions()).map((m) => [m.id, m])));

/** The mission's Markers.layer file, for the planner. */
export async function loadMarkersLayer(id: string): Promise<string | null> {
  const db = await getDb();
  const [row] = await db.query("SELECT markers_layer FROM missions WHERE id = $1", [id]);
  return (row?.markers_layer as string | null) ?? null;
}
