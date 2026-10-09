"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getHubData } from "../data";
import { getDb } from "../db";
import { playerIdOf } from "../players";
import { fromMskFields, isUsualSlot, mskDayKey } from "../schedule";
import { getViewer } from "../viewer";

/*
 * Scheduling is the admin's (user decision 2026-10-09: only Galaxy schedules games).
 * A game's id is "<MSK date>-<mission>" when it's scheduled and stays that way: a reschedule
 * keeps it, so links and plans don't break.
 */

export type ScheduleState = { error: "forbidden" | "invalid" | "past" | "exists" } | null;

/** «Запланировать»: a new game of `mission` at `date` `time` (MSK), with the mission's slot template. */
export async function scheduleGame(_prev: ScheduleState, form: FormData): Promise<ScheduleState> {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return { error: "forbidden" };
  const mission = await getHubData().getMission(String(form.get("mission") ?? ""));
  const startsAt = fromMskFields(String(form.get("date") ?? ""), String(form.get("time") ?? ""));
  if (!mission || !startsAt) return { error: "invalid" };
  if (startsAt.getTime() <= Date.now()) return { error: "past" };

  const id = `${mskDayKey(startsAt)}-${mission.id}`;
  const db = await getDb();
  const [old] = (await db.query("SELECT status FROM events WHERE id = $1", [id])) as { status: string }[];
  if (old && old.status !== "cancelled") return { error: "exists" };
  await db.transaction(async (tx) => {
    // A cancelled game of the same mission that day makes way for the new one.
    if (old) await tx.query("DELETE FROM events WHERE id = $1", [id]);
    await tx.query(
      "INSERT INTO events (id, mission_id, starts_at, extra, status) VALUES ($1, $2, $3, $4, 'scheduled')",
      [id, mission.id, startsAt.toISOString(), !isUsualSlot(startsAt)],
    );
    await tx.query(
      `INSERT INTO event_slots (event_id, position, group_id, group_name, role, required_role)
       SELECT $1, position, group_id, group_name, role, required_role FROM mission_slots WHERE mission_id = $2`,
      [id, mission.id],
    );
  });
  revalidatePath("/events");
  revalidatePath(`/missions/${mission.id}`);
  redirect(`/events/${id}`);
}

/** «Отменить» on an open usual slot: no game then, so the feed stops offering it. True when done. */
export async function skipOpenSlot(startsAt: string): Promise<boolean> {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return false;
  const at = new Date(startsAt);
  if (Number.isNaN(at.getTime()) || !isUsualSlot(at) || at.getTime() <= Date.now()) return false;
  const player = await playerIdOf(viewer);
  await (await getDb()).query(
    "INSERT INTO skipped_slots (starts_at, skipped_by) VALUES ($1, $2) ON CONFLICT (starts_at) DO NOTHING",
    [at.toISOString(), player],
  );
  revalidatePath("/events");
  return true;
}

/** «Изменить время»: same game, same mission and slots, a new start. */
export async function rescheduleGame(_prev: ScheduleState, form: FormData): Promise<ScheduleState> {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return { error: "forbidden" };
  const ev = await getHubData().getEvent(String(form.get("event") ?? ""), new Date());
  const startsAt = fromMskFields(String(form.get("date") ?? ""), String(form.get("time") ?? ""));
  if (!ev || ev.status !== "upcoming" || !startsAt) return { error: "invalid" };
  if (startsAt.getTime() <= Date.now()) return { error: "past" };
  await (await getDb()).query(
    "UPDATE events SET starts_at = $2, extra = $3, updated_at = NOW() WHERE id = $1 AND status = 'scheduled'",
    [ev.id, startsAt.toISOString(), !isUsualSlot(startsAt)],
  );
  revalidatePath("/events");
  revalidatePath(`/events/${ev.id}`);
  revalidatePath(`/missions/${ev.mission.id}`);
  return null;
}

/** «Отменить игру»: the game leaves the feed; its row (and who had slotted) stays. */
export async function cancelGame(form: FormData): Promise<void> {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return;
  const ev = await getHubData().getEvent(String(form.get("event") ?? ""), new Date());
  if (!ev || ev.status !== "upcoming") return;
  await (await getDb()).query("UPDATE events SET status = 'cancelled', updated_at = NOW() WHERE id = $1 AND status = 'scheduled'", [
    ev.id,
  ]);
  revalidatePath("/events");
  revalidatePath(`/missions/${ev.mission.id}`);
  redirect("/events");
}
