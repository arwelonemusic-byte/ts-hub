import type { MissionSquad } from "../types";

/*
 * The slotting bot's slot file, which mission makers already have: one squad per line,
 * `1'1 | SL [@SL] | RED - FTL [@FTL] | …`. Lines without a "|" (the date, "Arma Reforger:",
 * the title) are skipped.
 */

const roleKey = (r: string) => r.toLowerCase().replace(/[\s_-]+/g, "");

/** Squads from the bot's text; `[@Role]` names are matched to `roles` (the hub's spelling) when they can be. */
export function parseSlotText(text: string, roles: readonly string[]): MissionSquad[] {
  const canonical = new Map(roles.map((r) => [roleKey(r), r]));
  const squads: MissionSquad[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.includes("|")) continue;
    const [group, ...cells] = line.split("|").map((c) => c.trim());
    if (!group) continue;
    const slots = cells.filter(Boolean).map((cell) => {
      const m = cell.match(/^(.*?)\s*\[@([^\]]+)\]\s*$/);
      if (!m) return { role: cell };
      const req = m[2].trim();
      return { role: m[1].trim(), requiredRole: canonical.get(roleKey(req)) ?? req };
    });
    squads.push({ groupId: group, name: "", slots });
  }
  return squads;
}

