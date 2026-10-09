"use server";

import { revalidatePath } from "next/cache";
import { getHubData } from "../data";
import { getDb } from "../db";
import { refreshAnnouncement } from "../discord/post";
import { playerIdOf } from "../players";
import { suggest, type ReplayMatch } from "../replays/match";
import { fetchReplay, listRecentReplays } from "../replays/planner";
import { toGameResult, type GameResult } from "../replays/stats";
import { getViewer } from "../viewer";

/*
 * «Игра окончена» (admin, from the game's start on) and «Пересчитать» (a played game): the admin picks the
 * game's TS Replay recordings — several when a server restart split the op — and the hub computes what the
 * replay-stats reports used to give (lib/replays/stats.ts): attendance, totals, rankings, awards, the
 * /syncplan plan. «Проверить» shows the numbers first; «Сохранить» writes them and the game is played.
 */

type FinishError = "forbidden" | "invalid" | "notYet" | "planner" | "replay" | "empty" | "taken";

export interface ReplayCandidate extends ReplayMatch {
  code: string;
  world: string;
  /** Recording start, ISO. */
  startedAt: string;
  planCode: string | null;
}

/** A game the admin may finish (scheduled, started) or recompute (played). */
async function finishable(eventId: string): Promise<{ id: string; missionId: string; status: string; startsAt: string; planCode: string | null } | FinishError> {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return "forbidden";
  const [ev] = (await (await getDb()).query("SELECT id, mission_id, status, starts_at, plan_code FROM events WHERE id = $1", [eventId])) as {
    id: string;
    mission_id: string;
    status: string;
    starts_at: string | Date;
    plan_code: string | null;
  }[];
  if (!ev || ev.status === "cancelled") return "invalid";
  const startsAt = new Date(ev.starts_at).toISOString();
  if (ev.status === "scheduled" && Date.parse(startsAt) > Date.now()) return "notYet";
  return { id: ev.id, missionId: ev.mission_id, status: ev.status, startsAt, planCode: ev.plan_code };
}

/** Recordings around the game's time, newest first, with the suggested ones marked; `current` = the game's replays, if played. */
export async function gameReplays(eventId: string): Promise<{ candidates: ReplayCandidate[]; current: string[] } | { error: FinishError }> {
  const ev = await finishable(eventId);
  if (typeof ev === "string") return { error: ev };
  const [mission, list, current] = await Promise.all([
    getHubData().getMission(ev.missionId),
    listRecentReplays(),
    getDb().then((db) => db.query("SELECT replay_code FROM event_replays WHERE event_id = $1 ORDER BY part", [ev.id]) as Promise<{ replay_code: string }[]>),
  ]);
  if (!list || !mission) return { error: "planner" };
  const start = Date.parse(ev.startsAt);
  // A day before to most of a day after: an op's recordings are always in there.
  const near = list.filter((r) => r.startedAt * 1000 > start - 24 * 3600_000 && r.startedAt * 1000 < start + 12 * 3600_000);
  const candidates = suggest(near, { startsAt: ev.startsAt, mission })
    .sort((a, b) => b.startedAt - a.startedAt)
    .map((r) => ({
      code: r.code,
      world: r.world,
      startedAt: new Date(r.startedAt * 1000).toISOString(),
      planCode: r.planCode,
      sameMap: r.sameMap,
      sameName: r.sameName,
      suggested: r.suggested,
    }));
  return { candidates, current: current.map((r) => r.replay_code) };
}

/** The picked recordings' result; checks the codes and that someone actually played. */
async function compute(codes: string[]): Promise<GameResult | FinishError> {
  const picked = [...new Set(codes)];
  if (!picked.length || picked.length > 4 || picked.some((c) => !/^[A-Z0-9]{6}$/.test(c))) return "invalid";
  const replays = await Promise.all(picked.map(fetchReplay));
  if (replays.some((r) => !r)) return "replay";
  const result = toGameResult(replays.map((r) => r!));
  return result.roster.length ? result : "empty";
}

export interface GamePreview {
  replays: string[];
  startedAt: string;
  endedAt: string;
  durationMin: number;
  roster: string[];
  deaths: number;
  aiKilled: number;
  /** The plan the game will show, and where it comes from: the recording's /syncplan stamp, or the one attached to the game. */
  plan: { code: string; from: "replay" | "attached" } | null;
}

/** «Проверить»: the numbers the picked recordings give, nothing saved. */
export async function previewGame(eventId: string, codes: string[]): Promise<{ preview: GamePreview } | { error: FinishError }> {
  const ev = await finishable(eventId);
  if (typeof ev === "string") return { error: ev };
  const r = await compute(codes);
  if (typeof r === "string") return { error: r };
  const plan = r.planCode ? { code: r.planCode, from: "replay" as const } : ev.planCode ? { code: ev.planCode, from: "attached" as const } : null;
  return {
    preview: {
      replays: r.replays,
      startedAt: new Date(r.startedAt).toISOString(),
      endedAt: new Date(r.endedAt).toISOString(),
      durationMin: Math.round(r.durationMs / 60_000),
      roster: r.roster,
      deaths: r.stats.totals.deaths,
      aiKilled: r.stats.totals.aiKilled,
      plan,
    },
  };
}

/** «Сохранить»: the game becomes played with these recordings' stats (or a played game gets them anew). */
export async function finishGame(eventId: string, codes: string[]): Promise<{ error: FinishError; event?: string } | null> {
  const viewer = await getViewer();
  const ev = await finishable(eventId);
  if (typeof ev === "string") return { error: ev };
  const r = await compute(codes);
  if (typeof r === "string") return { error: r };
  const db = await getDb();
  // A recording belongs to one game.
  const [other] = (await db.query("SELECT event_id FROM event_replays WHERE replay_code = ANY($1::text[]) AND event_id <> $2 LIMIT 1", [
    r.replays,
    ev.id,
  ])) as { event_id: string }[];
  if (other) return { error: "taken", event: other.event_id };

  const player = await playerIdOf(viewer!);
  await db.transaction(async (tx) => {
    // The platoon leader is whoever sat in the game's PL slot (games slotted in the hub); else it stays as it was.
    await tx.query(
      `UPDATE events SET status = 'played', started_at = $2, ended_at = $3, plan_code = COALESCE($4, plan_code),
         stats = $5::jsonb, finished_at = NOW(), finished_by = $6, updated_at = NOW(),
         platoon_leader_id = COALESCE((SELECT player_id FROM event_slots
                                       WHERE event_id = $1 AND player_id IS NOT NULL
                                         AND lower(replace(coalesce(required_role, ''), ' ', '')) = 'pl'
                                       ORDER BY position LIMIT 1), platoon_leader_id)
       WHERE id = $1`,
      // An object, not a JSON string: the driver encodes jsonb itself.
      [ev.id, new Date(r.startedAt).toISOString(), new Date(r.endedAt).toISOString(), r.planCode, r.stats, player],
    );
    await tx.query("DELETE FROM event_attendance WHERE event_id = $1", [ev.id]);
    for (const name of r.roster) await tx.query("INSERT INTO event_attendance (event_id, player_name) VALUES ($1, $2)", [ev.id, name]);
    await tx.query("DELETE FROM event_replays WHERE event_id = $1", [ev.id]);
    for (const [i, code] of r.replays.entries()) {
      await tx.query("INSERT INTO event_replays (replay_code, event_id, part) VALUES ($1, $2, $3)", [code, ev.id, i + 1]);
    }
  });
  refreshAnnouncement(ev.id);
  revalidatePath("/events");
  revalidatePath(`/events/${ev.id}`);
  revalidatePath(`/missions/${ev.missionId}`);
  return null;
}
