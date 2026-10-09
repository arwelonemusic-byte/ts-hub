/**
 * Games aren't in the database yet, but they are real. Played games are past-events.json, built from
 * the replay-stats reports by data/events/build_past_events.py; scheduled games are UPCOMING below,
 * copied from the slotting bot's #анонсы posts. Missions come from the database (lib/data/missions.ts)
 * and hub plans are real (lib/plans, against the planner).
 */
import type {
  Award,
  HubEvent,
  LeaderboardEntry,
  Mission,
  PastEvent,
  PlanRef,
  Slot,
  UpcomingEvent,
} from "@/lib/types";
import { eventPlans, missionPlans } from "@/lib/plans";
import { mskDate, mskParts } from "@/lib/schedule";
import type { HubData } from "./index";
import { loadMarkersLayer, loadMissions, missionMap } from "./missions";
import pastEvents from "./past-events.json";

// ---------------------------------------------------------------- missions

type Missions = Map<string, Mission>;

function pick(ms: Missions, id: string): Mission {
  const m = ms.get(id);
  if (!m) throw new Error(`mock: no mission "${id}"`);
  return m;
}

// ---------------------------------------------------------------- past ops

/** A played game as build_past_events.py writes it: the mission by id, players by name. */
interface PastRecord extends Omit<PastEvent, "status" | "mission" | "slotted" | "attendance"> {
  missionId: string;
  awards: Award[];
  leaderboards: { aiKills: LeaderboardEntry[]; deaths: LeaderboardEntry[] };
  attendance: string[];
}

function buildPast(ms: Missions): PastEvent[] {
  return (pastEvents as PastRecord[]).map(({ missionId, attendance, ...rest }) => ({
    ...rest,
    status: "past",
    mission: pick(ms, missionId),
    // Nobody slotted through the hub yet.
    slotted: null,
    attendance: attendance.map((playerName) => ({ playerName, attended: true })),
  }));
}

// ---------------------------------------------------------------- upcoming

/** A scheduled game stays listed this long after its start, so it doesn't vanish while it's being played. */
const GAME_MS = 4 * 3600_000;

/**
 * Scheduled games, copied from the slotting bot's #анонсы posts until the hub runs slotting. `taken` maps
 * "<group>/<slot>" (the mission's slot template) to the player's Discord display name, as the bot shows it.
 * The usual Tue/Sun slots with nothing scheduled show as open slots in the feed.
 */
const UPCOMING: {
  mission: string;
  at: [number, number, number, number]; // month (1-12), day, hour, minute — 2026, MSK
  taken: Record<string, string>;
  platoonLeader?: string;
}[] = [
  {
    mission: "project-geras",
    at: [10, 10, 19, 0],
    taken: {
      "Bravo-1/SL": "Arstotzka",
      "Bravo-1/RED - FTL": "[лампас] Venom_coceT",
      "Bravo-1/RED - Automatic Rifleman": "Smoker (OnlineKiller)",
      "Bravo-1/RED - Grenadier": "Shultz",
      "Bravo-1/RED - Rifleman": "[HL]Prais777",
      "Bravo-2/SL": "lim",
    },
  },
];

/** A game's copy of the mission's slot template, with the taken slots filled in. */
function gameSlots(mission: Mission, taken: Record<string, string>): Slot[] {
  const slots: Slot[] = (mission.squads ?? []).flatMap((sq) =>
    sq.slots.map((slot, i) => ({
      id: `${sq.groupId}-${i}`,
      groupId: sq.groupId,
      groupName: sq.name,
      role: slot.role,
      playerName: taken[`${sq.groupId}/${slot.role}`] ?? null,
      // The bot has no progressive locks.
      locked: false,
    })),
  );
  const unknown = Object.keys(taken).filter((k) => !slots.some((s) => `${s.groupId}/${s.role}` === k));
  if (unknown.length) throw new Error(`mock: ${mission.id} has no slot ${unknown.join(", ")}`);
  return slots;
}

function buildUpcoming(now: Date, ms: Missions): UpcomingEvent[] {
  return UPCOMING.map(({ mission: missionId, at, taken, platoonLeader }): UpcomingEvent => {
    const [month, day, hour, minute] = at;
    const start = mskDate(2026, month - 1, day, hour, minute);
    const { wd } = mskParts(start);
    const usual = minute === 0 && ((wd === 2 && hour === 20) || (wd === 0 && hour === 19));
    const mission = pick(ms, missionId);
    return {
      id: `${start.toISOString().slice(0, 10)}-${missionId}`,
      status: "upcoming",
      startsAt: start.toISOString(),
      mission,
      extra: !usual,
      platoonLeader: platoonLeader ?? null,
      plan: null,
      slots: gameSlots(mission, taken),
    };
  })
    .filter((e) => new Date(e.startsAt).getTime() + GAME_MS > now.getTime())
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

// ---------------------------------------------------------------- plans per mission

/** The plans played games used: a played game's plan is a plan for its mission. */
function gamePlans(missionId: string, ms: Missions): PlanRef[] {
  return buildPast(ms)
    .filter((e) => e.mission.id === missionId && e.planCode)
    .map((e) => ({ code: e.planCode!, author: e.platoonLeader ?? "—", createdAt: e.startsAt, event: { id: e.id, startsAt: e.startsAt } }));
}

/** Upcoming games with their hub plans attached. */
async function upcoming(now: Date): Promise<UpcomingEvent[]> {
  const events = buildUpcoming(now, await missionMap());
  const plans = await eventPlans(events);
  return events.map((e) => ({ ...e, plan: plans.get(e.id) ?? null }));
}

// ---------------------------------------------------------------- repository

const past = async () => buildPast(await missionMap());

export const mockData: HubData = {
  async listUpcoming(now) {
    return upcoming(now);
  },
  async listPast() {
    return past();
  },
  async getEvent(id, now) {
    const all: HubEvent[] = [...(await upcoming(now)), ...(await past())];
    return all.find((e) => e.id === id) ?? null;
  },
  async listBetween(from, to, now) {
    const all: HubEvent[] = [...(await past()), ...(await upcoming(now))];
    return all
      .filter((e) => {
        const t = new Date(e.startsAt).getTime();
        return t >= from.getTime() && t < to.getTime();
      })
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  },
  async getRange(now) {
    const ms = await missionMap();
    const times = [...buildPast(ms), ...buildUpcoming(now, ms)].map((e) => new Date(e.startsAt).getTime());
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
    const next = (await upcoming(now)).filter((e) => e.mission.id === missionId);
    const played = (await past()).filter((e) => e.mission.id === missionId);
    return [...next, ...played];
  },
  async getMissionHistory(missionId) {
    const ms = await missionMap();
    return {
      timesPlayed: buildPast(ms).filter((e) => e.mission.id === missionId).length,
      plans: await missionPlans(missionId, gamePlans(missionId, ms)),
    };
  },
};
