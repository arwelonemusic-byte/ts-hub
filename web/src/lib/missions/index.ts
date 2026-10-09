import { discordRoleNames } from "../auth/discord";
import { getDb } from "../db";
import { MAPS } from "../maps";
import type { Mission } from "../types";
import type { Viewer } from "../viewer";

/*
 * Who may change the catalogue (user decision 2026-10-09): admins add, edit, archive and delete any
 * mission; @mission officer members add missions and edit the ones they're a listed author of.
 */
export const canAddMission = (v: Viewer | null) => !!v && (v.isAdmin || v.isMissionMaker);
export const canEditMission = (v: Viewer | null, m: Pick<Mission, "authorIds">) =>
  !!v && (v.isAdmin || (v.isMissionMaker && m.authorIds.includes(v.discordId)));

/** What the add/edit dialog offers: members to pick authors from, the catalogue's tags, slot roles, maps. */
export interface EditorOptions {
  members: { discordId: string; name: string }[];
  tags: string[];
  roles: string[];
  maps: { key: string; label: string }[];
}

/** Slot roles in the order the bot's files list them; any other role name follows alphabetically. */
const ROLE_ORDER = ["PL", "SL", "FTL", "Machine Gunner", "Grenadier", "Rifleman", "Armoured Crew", "Aircraft Vehicle"];
/** Discord roles that aren't slot roles. */
const NOT_SLOT_ROLES = ["mission officer"];
const roleKey = (r: string) => r.toLowerCase().replace(/[\s_-]+/g, "");

export async function editorOptions(): Promise<EditorOptions> {
  const db = await getDb();
  const [members, tagRows, roles] = await Promise.all([
    db.query("SELECT discord_id, display_name FROM players WHERE discord_id IS NOT NULL ORDER BY lower(display_name)") as Promise<
      { discord_id: string; display_name: string }[]
    >,
    db.query("SELECT DISTINCT unnest(tags) AS tag FROM missions ORDER BY 1") as Promise<{ tag: string }[]>,
    slotRoles(),
  ]);
  return {
    members: members.map((m) => ({ discordId: m.discord_id, name: m.display_name })),
    tags: tagRows.map((t) => t.tag),
    roles,
    maps: [...MAPS].sort((a, b) => a.label.localeCompare(b.label)),
  };
}

/** Required roles a slot can have: the templates' and the Discord role map's, in the bot files' order. */
export async function slotRoles(): Promise<string[]> {
  const rows = (await (await getDb()).query("SELECT DISTINCT required_role FROM mission_slots WHERE required_role IS NOT NULL")) as {
    required_role: string;
  }[];
  // The templates' spelling wins ("Machine Gunner", where the Discord role is "MachineGunner").
  const roles = new Map<string, string>();
  for (const r of [...ROLE_ORDER, ...rows.map((x) => x.required_role), ...discordRoleNames()]) {
    if (!NOT_SLOT_ROLES.some((n) => roleKey(n) === roleKey(r)) && !roles.has(roleKey(r))) roles.set(roleKey(r), r);
  }
  const rank = (r: string) => {
    const i = ROLE_ORDER.findIndex((o) => roleKey(o) === roleKey(r));
    return i < 0 ? ROLE_ORDER.length : i;
  };
  return [...roles.values()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** A scheduled or played game of the mission: then it can be archived, not deleted. Cancelled games don't count. */
export async function missionHasGames(id: string): Promise<boolean> {
  const [row] = await (await getDb()).query("SELECT 1 FROM events WHERE mission_id = $1 AND status <> 'cancelled' LIMIT 1", [id]);
  return !!row;
}
