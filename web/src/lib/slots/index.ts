import { getDb } from "../db";
import type { Slot, UpcomingEvent } from "../types";
import { hasRole, type Viewer } from "../viewer";

/*
 * Slotting (user decisions 2026-10-09): anyone signed in takes a free slot whose Discord
 * role they have, one slot per player per game (taking another moves them), and leaves it,
 * until the game starts. An admin puts anyone in any free slot or takes them out, any time,
 * without the role check. No progressive locks and no reserving (parked).
 */

/** Players slot themselves until the game starts. */
export function slottingOpen(ev: UpcomingEvent, now = new Date()): boolean {
  return new Date(ev.startsAt) > now;
}

/** Why the viewer can't take this free slot, or null when they can. */
export function takeBlock(viewer: Viewer, ev: UpcomingEvent, slot: Slot, now = new Date()): "closed" | "role" | null {
  if (viewer.isAdmin) return null;
  if (!slottingOpen(ev, now)) return "closed";
  if (slot.requiredRole && !hasRole(viewer, slot.requiredRole)) return "role";
  return null;
}

/** The viewer's slot in this game, if they have one. */
export function viewerSlot(viewer: Viewer | null, ev: UpcomingEvent): Slot | null {
  return (viewer && ev.slots.find((s) => s.playerId === viewer.discordId)) || null;
}

/** Member names for an admin's «Посадить» picker. */
export async function playerNames(): Promise<string[]> {
  const db = await getDb();
  const rows = (await db.query("SELECT DISTINCT display_name FROM players ORDER BY 1")) as { display_name: string }[];
  return rows.map((r) => r.display_name);
}
