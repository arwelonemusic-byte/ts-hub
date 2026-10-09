"use server";

import { revalidatePath } from "next/cache";
import { getHubData } from "../data";
import { getDb, type Db } from "../db";
import { playerIdOf } from "../players";
import type { UpcomingEvent } from "../types";
import { getViewer, type Viewer } from "../viewer";
import { slottingOpen, takeBlock } from "./index";

export type SlotState = { error: "taken" | "role" | "closed" | "forbidden" | "noPlayer" | "ambiguous"; name?: string } | null;

class Taken extends Error {}

async function context(form: FormData): Promise<{ viewer: Viewer; ev: UpcomingEvent; position: number } | null> {
  const [viewer, ev] = await Promise.all([getViewer(), getHubData().getEvent(String(form.get("event") ?? ""), new Date())]);
  const position = Number(form.get("position"));
  if (!viewer || !ev || ev.status !== "upcoming") return null;
  return { viewer, ev, position };
}

/** Put `player` in the slot at `position` if it's free, out of any other slot of theirs in the game. */
async function seat(db: Db, eventId: string, position: number, player: string): Promise<SlotState> {
  try {
    await db.transaction(async (tx) => {
      await tx.query(
        "UPDATE event_slots SET player_id = NULL, player_name = NULL, taken_at = NULL WHERE event_id = $1 AND player_id = $2",
        [eventId, player],
      );
      const hit = await tx.query(
        `UPDATE event_slots SET player_id = $3, player_name = NULL, taken_at = NOW()
         WHERE event_id = $1 AND position = $2 AND player_id IS NULL AND player_name IS NULL
         RETURNING position`,
        [eventId, position, player],
      );
      if (!hit.length) throw new Taken();
    });
  } catch (err) {
    if (err instanceof Taken) return { error: "taken" };
    throw err;
  }
  return null;
}

/** «Занять»: the viewer takes a free slot (moving out of the one they had). */
export async function takeSlot(_prev: SlotState, form: FormData): Promise<SlotState> {
  const c = await context(form);
  if (!c) return { error: "forbidden" };
  const slot = c.ev.slots.find((s) => s.id === String(c.position));
  if (!slot) return { error: "forbidden" };
  if (slot.playerName) return { error: "taken" };
  const block = takeBlock(c.viewer, c.ev, slot);
  if (block) return { error: block, name: slot.requiredRole };
  const player = await playerIdOf(c.viewer);
  if (!player) return { error: "forbidden" };
  const state = await seat(await getDb(), c.ev.id, c.position, player);
  revalidatePath(`/events/${c.ev.id}`);
  return state;
}

/** «Покинуть»: the viewer leaves their slot. */
export async function leaveSlot(_prev: SlotState, form: FormData): Promise<SlotState> {
  const c = await context(form);
  if (!c) return { error: "forbidden" };
  if (!c.viewer.isAdmin && !slottingOpen(c.ev)) return { error: "closed" };
  const player = await playerIdOf(c.viewer);
  if (!player) return { error: "forbidden" };
  await (await getDb()).query(
    "UPDATE event_slots SET player_id = NULL, player_name = NULL, taken_at = NULL WHERE event_id = $1 AND player_id = $2",
    [c.ev.id, player],
  );
  revalidatePath(`/events/${c.ev.id}`);
  return null;
}

/** Admin «Посадить»: a member by display name into a free slot (out of their other slot), no role check. */
export async function assignSlot(_prev: SlotState, form: FormData): Promise<SlotState> {
  const c = await context(form);
  if (!c?.viewer.isAdmin) return { error: "forbidden" };
  const name = String(form.get("name") ?? "").trim();
  const db = await getDb();
  const rows = (await db.query("SELECT id FROM players WHERE display_name = $1", [name])) as { id: string }[];
  if (rows.length === 0) return { error: "noPlayer", name };
  if (rows.length > 1) return { error: "ambiguous", name };
  const state = await seat(db, c.ev.id, c.position, String(rows[0].id));
  revalidatePath(`/events/${c.ev.id}`);
  return state;
}

/** Admin «Освободить»: empty a slot. */
export async function clearSlot(_prev: SlotState, form: FormData): Promise<SlotState> {
  const c = await context(form);
  if (!c?.viewer.isAdmin) return { error: "forbidden" };
  await (await getDb()).query(
    "UPDATE event_slots SET player_id = NULL, player_name = NULL, taken_at = NULL WHERE event_id = $1 AND position = $2",
    [c.ev.id, c.position],
  );
  revalidatePath(`/events/${c.ev.id}`);
  return null;
}
