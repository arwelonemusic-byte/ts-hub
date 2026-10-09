import type { Slot } from "./types";

/** HQ's callsign in the slotting bot's files. */
const HQ = "1'6";

/**
 * A game's slots by squad, as its page shows them: HQ first (templates often list it last, as the bot's
 * files do), then the rest in the game's own order. Squads added to a scheduled game go at the end.
 */
export function squadsOf<S extends Pick<Slot, "groupId" | "groupName">>(slots: S[]): { groupId: string; groupName: string; slots: S[] }[] {
  const squads = new Map<string, { groupId: string; groupName: string; slots: S[] }>();
  for (const s of slots) {
    const sq = squads.get(s.groupId) ?? { groupId: s.groupId, groupName: s.groupName, slots: [] };
    sq.slots.push(s);
    squads.set(s.groupId, sq);
  }
  const list = [...squads.values()];
  return [...list.filter((sq) => sq.groupId === HQ), ...list.filter((sq) => sq.groupId !== HQ)];
}

/** A slot in the slot editor (components/mission/editor/SquadsEditor). */
export interface EditableSlot {
  role: string;
  requiredRole?: string;
  /** An existing slot of a scheduled game (its position): it can only be renamed. */
  key?: string;
  /** Who's in it (a game's slot). */
  player?: string | null;
}

export interface EditableSquad {
  groupId: string;
  name: string;
  slots: EditableSlot[];
}
