import type { MissionSquad } from "../types";

/*
 * The Discord role a slot needs, from its name: the user's fixed rules, the "always" part of
 * data/catalogue/slot-roles.json (read on the server, `slotRoleRules` in ./index). Shared with the browser.
 */

/** Discord role → the slot names that need it: { "Machine Gunner": ["Automatic Rifleman", "Пулеметчик", …] }. */
export type SlotRoleRules = Record<string, string[]>;

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();

/** "RED - Rifleman2" → "rifleman": no fireteam prefix or trailing number. */
const bare = (slot: string) =>
  norm(slot)
    .replace(/^(?:red|blue|green|yellow|white)\s*[-–—]\s*/, "")
    .replace(/\s*#?\d+$/, "");

/**
 * The role the rules give a slot name, or null. A rule name matches the bare name, or its start when a qualifier
 * follows ("Снайпер СВД", "Старший стрелок (РПК)"); the longest one wins. Spaces don't count for a whole name
 * ("Machinegunner" = "Machine Gunner").
 */
export function ruleRole(slot: string, rules: SlotRoleRules): string | null {
  const name = bare(slot);
  let best: { role: string; len: number } | null = null;
  for (const [role, names] of Object.entries(rules)) {
    for (const n of names.map(norm)) {
      const hit =
        name === n ||
        name.replace(/ /g, "") === n.replace(/ /g, "") ||
        (name.startsWith(n) && /[^\p{L}\p{N}]/u.test(name[n.length]));
      if (hit && (!best || n.length > best.len)) best = { role, len: n.length };
    }
  }
  return best?.role ?? null;
}

/**
 * Squads with each slot's role filled in from the rules where one matches, spelled as the hub's role list spells it
 * (roles compare without case or spaces). Slots no rule covers are left as they are («Любой»).
 */
export function prefillRequiredRoles(squads: MissionSquad[], rules: SlotRoleRules, roles: string[]): MissionSquad[] {
  const key = (r: string) => r.toLowerCase().replace(/[\s_-]+/g, "");
  return squads.map((sq) => ({
    ...sq,
    slots: sq.slots.map((s) => {
      const role = ruleRole(s.role, rules);
      return role ? { ...s, requiredRole: roles.find((r) => key(r) === key(role)) ?? role } : s;
    }),
  }));
}
