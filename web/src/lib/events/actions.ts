"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getHubData } from "../data";
import { getDb } from "../db";
import { LIMITS } from "../missions/draft";
import { playerIdOf } from "../players";
import { fromMskFields, isUsualSlot, mskDayKey } from "../schedule";
import type { EditableSquad } from "../squads";
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
  if (!mission || mission.archived || !startsAt) return { error: "invalid" };
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

export type GameSlotsState = { error: "forbidden" | "invalid" | "stale" | "groupId" | "groupDup" | "role" | "squads" } | null;

/**
 * «Изменить слоты» (admin) on a scheduled game — its own slots, not the mission's template (user decisions
 * 2026-10-09). An existing slot (`key` = its position) can be renamed and its squad's callsign and name
 * changed, but it is never deleted and keeps its required role; whoever is in it stays. New slots and
 * squads get the next positions, so a page left open never takes a slot by a position that moved.
 */
export async function editGameSlots(eventId: string, input: EditableSquad[]): Promise<GameSlotsState> {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return { error: "forbidden" };
  const db = await getDb();
  const [ev] = await db.query("SELECT status FROM events WHERE id = $1", [eventId]);
  if (!ev || ev.status !== "scheduled" || !Array.isArray(input)) return { error: "invalid" };
  const rows = (await db.query("SELECT position FROM event_slots WHERE event_id = $1", [eventId])) as { position: number }[];
  const existing = new Map(rows.map((r) => [String(r.position), r.position]));

  const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  const squads = input.map((sq) => ({
    groupId: clip(sq?.groupId, LIMITS.groupId),
    name: clip(sq?.name, LIMITS.groupName),
    slots: (Array.isArray(sq?.slots) ? sq.slots : []).map((s) => ({
      key: typeof s?.key === "string" ? s.key : undefined,
      role: clip(s?.role, LIMITS.role),
      requiredRole: clip(s?.requiredRole, LIMITS.requiredRole) || null,
    })),
  }));
  const all = squads.flatMap((sq) => sq.slots);
  if (squads.length > LIMITS.squads || all.length > LIMITS.slots) return { error: "squads" };
  if (squads.some((sq) => !sq.groupId)) return { error: "groupId" };
  if (new Set(squads.map((sq) => sq.groupId.toLowerCase())).size !== squads.length) return { error: "groupDup" };
  if (squads.some((sq) => !sq.slots.length || sq.slots.some((s) => !s.role))) return { error: "role" };
  // Every slot the game has, each once: none deleted, and none added meanwhile by someone else.
  const keys = all.flatMap((s) => (s.key ? [s.key] : []));
  if (keys.length !== existing.size || new Set(keys).size !== keys.length || keys.some((k) => !existing.has(k))) return { error: "stale" };

  await db.transaction(async (tx) => {
    let next = Math.max(-1, ...rows.map((r) => r.position)) + 1;
    for (const sq of squads) {
      for (const s of sq.slots) {
        if (s.key) {
          // Renames only: the required role and whoever is in the slot stay as they are.
          await tx.query("UPDATE event_slots SET group_id = $3, group_name = $4, role = $5 WHERE event_id = $1 AND position = $2", [
            eventId,
            existing.get(s.key),
            sq.groupId,
            sq.name,
            s.role,
          ]);
        } else {
          await tx.query(
            "INSERT INTO event_slots (event_id, position, group_id, group_name, role, required_role) VALUES ($1, $2, $3, $4, $5, $6)",
            [eventId, next++, sq.groupId, sq.name, s.role, s.requiredRole],
          );
        }
      }
    }
    await tx.query("UPDATE events SET updated_at = NOW() WHERE id = $1", [eventId]);
  });
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");
  return null;
}
