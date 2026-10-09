/**
 * Games from the database (db/migrations/002_events.sql): scheduled ones with their slots, played
 * ones with attendance, replays and replay-stats. There are a few dozen, so each request loads them
 * all once and the HubData methods filter in memory.
 */
import { cache } from "react";
import { getDb } from "../db";
import { missionPlans } from "../plans";
import type { Award, HubEvent, LeaderboardEntry, PastEvent, PlanRef, Slot, UpcomingEvent } from "../types";
import type { HubData } from "./index";
import { loadMarkersLayer, loadMissions, missionMap } from "./missions";

/** A scheduled game stays listed this long after its start, so it doesn't vanish while it's being played. */
const GAME_MS = 4 * 3600_000;

/** events.stats, as data/events/build_past_events.py writes it. */
interface GameStats {
  totals: Omit<PastEvent["stats"], "topAiKills">;
  leaderboards: { aiKills: LeaderboardEntry[]; deaths: LeaderboardEntry[] };
  awards: Award[];
  friendlyFire: PastEvent["friendlyFireIncidents"];
}

interface EventRow {
  id: string;
  mission_id: string;
  starts_at: Date | string;
  extra: boolean;
  status: "scheduled" | "played";
  host_name: string | null;
  platoon_leader: string | null;
  started_at: Date | string | null;
  ended_at: Date | string | null;
  plan_code: string | null;
  plan_attached_by: string | null;
  plan_attached_by_id: string | null;
  plan_attached_at: Date | string | null;
  stats: GameStats | null;
}

const iso = (d: Date | string) => new Date(d).toISOString();

function group<T extends { event_id: string }>(rows: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) out.set(r.event_id, [...(out.get(r.event_id) ?? []), r]);
  return out;
}

/** Every game but the cancelled ones, soonest first. */
const loadGames = cache(async (): Promise<HubEvent[]> => {
  const db = await getDb();
  const [events, slots, attendance, replays, missions] = await Promise.all([
    db.query(
      `SELECT e.id, e.mission_id, e.starts_at, e.extra, e.status, h.display_name AS host_name,
              pl.display_name AS platoon_leader, e.started_at, e.ended_at, e.plan_code, e.stats,
              pa.display_name AS plan_attached_by, pa.discord_id AS plan_attached_by_id, e.plan_attached_at
       FROM events e
       LEFT JOIN players h ON h.id = e.host_id
       LEFT JOIN players pl ON pl.id = e.platoon_leader_id
       LEFT JOIN players pa ON pa.id = e.plan_attached_by
       WHERE e.status <> 'cancelled'
       ORDER BY e.starts_at`,
    ) as Promise<EventRow[]>,
    db.query(
      `SELECT s.event_id, s.position, s.group_id, s.group_name, s.role, s.required_role,
              COALESCE(p.display_name, s.player_name) AS player_name, p.discord_id AS player_discord_id
       FROM event_slots s LEFT JOIN players p ON p.id = s.player_id
       ORDER BY s.event_id, s.position`,
    ) as Promise<
      {
        event_id: string;
        position: number;
        group_id: string;
        group_name: string;
        role: string;
        required_role: string | null;
        player_name: string | null;
        player_discord_id: string | null;
      }[]
    >,
    db.query("SELECT event_id, player_name, attended FROM event_attendance ORDER BY event_id, player_name") as Promise<
      { event_id: string; player_name: string; attended: boolean }[]
    >,
    db.query("SELECT event_id, replay_code FROM event_replays ORDER BY event_id, part") as Promise<
      { event_id: string; replay_code: string }[]
    >,
    missionMap(),
  ]);
  const slotsOf = group(slots);
  const attendanceOf = group(attendance);
  const replaysOf = group(replays);

  return events.map((e): HubEvent => {
    const mission = missions.get(e.mission_id);
    if (!mission) throw new Error(`event ${e.id}: no mission "${e.mission_id}"`);
    const gameSlots: Slot[] = (slotsOf.get(e.id) ?? []).map((s) => ({
      id: String(s.position),
      groupId: s.group_id,
      groupName: s.group_name,
      role: s.role,
      ...(s.required_role ? { requiredRole: s.required_role } : {}),
      playerName: s.player_name,
      ...(s.player_discord_id ? { playerId: s.player_discord_id } : {}),
      // The hub doesn't run progressive slotting (yet), and the bot has none.
      locked: false,
    }));
    const base = {
      id: e.id,
      startsAt: iso(e.starts_at),
      mission,
      extra: e.extra,
      ...(e.host_name ? { hostName: e.host_name } : {}),
      platoonLeader: e.platoon_leader,
    };
    if (e.status === "scheduled") {
      // The plan someone attached («Прикрепить план»): its author here is whoever attached it.
      const plan = e.plan_code
        ? {
            code: e.plan_code,
            author: e.plan_attached_by ?? "—",
            ...(e.plan_attached_by_id ? { authorId: e.plan_attached_by_id } : {}),
            createdAt: iso(e.plan_attached_at ?? e.starts_at),
          }
        : null;
      return { ...base, status: "upcoming", slots: gameSlots, plan };
    }

    const stats = e.stats ?? { totals: { deaths: 0 }, leaderboards: { aiKills: [], deaths: [] }, awards: [], friendlyFire: [] };
    const players = attendanceOf.get(e.id) ?? [];
    return {
      ...base,
      status: "past",
      startedAt: iso(e.started_at ?? e.starts_at),
      endedAt: iso(e.ended_at ?? e.started_at ?? e.starts_at),
      // Slots exist only for games scheduled in the hub.
      slotted: gameSlots.length ? gameSlots.filter((s) => s.playerName).length : null,
      attended: players.filter((a) => a.attended).length,
      replayCodes: (replaysOf.get(e.id) ?? []).map((r) => r.replay_code),
      planCode: e.plan_code,
      stats: { ...stats.totals, topAiKills: stats.leaderboards.aiKills[0] ?? null },
      friendlyFireIncidents: stats.friendlyFire,
      awards: stats.awards,
      leaderboards: stats.leaderboards,
      attendance: players.map((a) => ({ playerName: a.player_name, attended: a.attended })),
    };
  });
});

const isUpcoming = (e: HubEvent): e is UpcomingEvent => e.status === "upcoming";
const isPast = (e: HubEvent): e is PastEvent => e.status === "past";

/** Scheduled games that haven't been over for long; played games are listed always. */
function listed(games: HubEvent[], now: Date): HubEvent[] {
  return games.filter((e) => isPast(e) || new Date(e.startsAt).getTime() + GAME_MS > now.getTime());
}

/** The plans played games used: a played game's plan is a plan for its mission. */
function gamePlans(games: HubEvent[], missionId: string): PlanRef[] {
  return games
    .filter(isPast)
    .filter((e) => e.mission.id === missionId && e.planCode)
    .map((e) => ({ code: e.planCode!, author: e.platoonLeader ?? "—", createdAt: e.startsAt, event: { id: e.id, startsAt: e.startsAt } }));
}

const newestFirst = (a: HubEvent, b: HubEvent) => b.startsAt.localeCompare(a.startsAt);

export const gamesData: HubData = {
  async listUpcoming(now) {
    return listed(await loadGames(), now).filter(isUpcoming);
  },
  async listPast() {
    return (await loadGames()).filter(isPast).sort(newestFirst);
  },
  async getEvent(id, now) {
    void now;
    return (await loadGames()).find((e) => e.id === id) ?? null;
  },
  async getEventVersion(id) {
    const db = await getDb();
    const [row] = await db.query(
      `SELECT md5(coalesce(e.plan_code, '') || '|' || coalesce(
                (SELECT string_agg(s.position || ':' || coalesce(s.player_id::text, s.player_name, ''), ',' ORDER BY s.position)
                 FROM event_slots s WHERE s.event_id = e.id), '')) AS v
       FROM events e WHERE e.id = $1`,
      [id],
    );
    return (row?.v as string | undefined) ?? null;
  },
  async listBetween(from, to, now) {
    return listed(await loadGames(), now).filter((e) => {
      const t = new Date(e.startsAt).getTime();
      return t >= from.getTime() && t < to.getTime();
    });
  },
  async getRange(now) {
    const times = listed(await loadGames(), now).map((e) => new Date(e.startsAt).getTime());
    if (!times.length) return null;
    return { first: new Date(Math.min(...times)), last: new Date(Math.max(...times)) };
  },
  async listMissions() {
    return loadMissions();
  },
  async getMission(id) {
    return (await missionMap()).get(id) ?? null;
  },
  async getMarkersLayer(id) {
    return loadMarkersLayer(id);
  },
  async listMissionEvents(missionId, now) {
    const games = listed(await loadGames(), now).filter((e) => e.mission.id === missionId);
    const next = games.filter(isUpcoming);
    const played = games.filter(isPast).sort(newestFirst);
    return [...next, ...played];
  },
  async getMissionHistory(missionId) {
    const games = await loadGames();
    return {
      timesPlayed: games.filter((e) => isPast(e) && e.mission.id === missionId).length,
      plans: await missionPlans(missionId, gamePlans(games, missionId)),
    };
  },
};
