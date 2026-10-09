/**
 * Games are still mock data for the POC. Played games are real: past-events.json, built from the
 * replay-stats reports by data/events/build_past_events.py. Upcoming dates, slot fills, PL names
 * and the Fallen Hawk plan codes are invented. Missions come from the database
 * (lib/data/missions.ts) and hub plans are real (lib/plans, against the planner). Upcoming
 * events are pinned to the next usual slots relative to "now", so the page never goes stale.
 */
import type {
  Award,
  HubEvent,
  LeaderboardEntry,
  Mission,
  MissionSlot,
  MissionSquad,
  PastEvent,
  PlanRef,
  Slot,
  UpcomingEvent,
} from "@/lib/types";
import { eventPlans, missionPlans } from "@/lib/plans";
import { mskDate, usualSlotsFrom } from "@/lib/schedule";
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

/** The missions the mock upcoming games use (ids in the catalogue). */
const M = {
  foxhound: "foxhound",
  geras: "project-geras",
  baseJumping: "base-jumping",
  circuitBreaker: "circuit-breaker",
  counterpunch: "counterpunch",
  fallenHawk: "fallen-hawk",
};

// ---------------------------------------------------------------- slots

const ROSTER = [
  "M_i", "Prais777", "JFKennedy", "[En-Y]Inspector", "[BS] Ушастый перец", "[En-Y]Boba", "Mike_Jay_Evans",
  "[En-Y]Sasce2044", "[RTT] J.A.N.", "[En-Y]Sterben", "[En-Y]amil1Xe", "Osamich", "Jaelise", "OnlineKiller.",
  "Galaxy", "Сваркослав", "Venom_coceT", "Tactical Shift", "Valso", "[En-Y]BURBON", "Georg Shultz", "DarkCote",
  "[BS] Griggs", "alien_2010", "Lis", "Kedr", "Nomad", "Wolfram", "Sever", "Bort", "Grach", "Yasen",
];

/** Progressive slotting tier: leaders first, then fireteam leaders, then everyone else. */
function tier(slot: MissionSlot): number {
  if (slot.requiredRole === "PL" || slot.requiredRole === "SL") return 0;
  if (slot.requiredRole === "FTL") return 1;
  return 2;
}

/** A game's copy of the mission's slot template, first `filled` taken, with progressive locks. */
function makeSlots(squads: MissionSquad[], filled: number, pl: string | null): Slot[] {
  const rows = squads.flatMap((sq) => sq.slots.map((slot, i) => ({ slot, sq, i })));
  const slots: Slot[] = rows.map(({ slot, sq, i }) => ({
    id: `${sq.groupId}-${i}`, groupId: sq.groupId, groupName: sq.name, role: slot.role, playerName: null, locked: false,
  }));
  const order = rows.map((r, i) => ({ ...r, s: slots[i] })).sort((a, b) => tier(a.slot) - tier(b.slot));
  const pool = ROSTER.filter((n) => n !== pl);
  let taken = 0;
  for (const { slot, s } of order) {
    if (taken >= filled) break;
    if (slot.requiredRole === "PL") {
      if (!pl) continue;
      s.playerName = pl;
    } else {
      s.playerName = pool.shift() ?? null;
    }
    taken++;
  }
  const openTier = Math.min(...order.filter(({ s }) => !s.playerName).map(({ slot }) => tier(slot)), 3);
  for (const { slot, s } of order) s.locked = !s.playerName && tier(slot) > openTier;
  return slots;
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

function buildUpcoming(now: Date, ms: Missions): UpcomingEvent[] {
  const [s1, s2, s3, , s5] = usualSlotsFrom(now, 4);
  const ev = (at: Date, missionId: string, rest: Partial<UpcomingEvent> & { filled: number }): UpcomingEvent => {
    const { filled, ...more } = rest;
    const mission = pick(ms, missionId);
    return {
      id: `${at.toISOString().slice(0, 10)}-${mission.id}`,
      status: "upcoming",
      startsAt: at.toISOString(),
      mission,
      extra: false,
      plan: null,
      ...more,
      slots: makeSlots(mission.squads ?? [], filled, more.platoonLeader ?? null),
    };
  };
  // Extra op on the Thursday after the second slot.
  const thursday = new Date(s2.getTime() + 2 * 24 * 3600_000);
  return [
    ev(s1, M.foxhound, { filled: 26, platoonLeader: "Prais777" }),
    ev(s2, M.geras, { filled: 14, platoonLeader: "M_i", hostName: "JFKennedy" }),
    ev(thursday, M.baseJumping, { filled: 9, platoonLeader: "DarkCote", extra: true }),
    ev(s3, M.circuitBreaker, { filled: 4, platoonLeader: null }),
    // A rerun, so the Counterpunch mission page has an upcoming game next to its played one.
    ev(s5, M.counterpunch, { filled: 6, platoonLeader: null }),
  ];
}

// ---------------------------------------------------------------- plans per mission

/** Plans from before the hub, for a mission with none from its games. */
const PLANS: Record<string, PlanRef[]> = {
  [M.fallenHawk]: [
    { code: "FR32GS", author: "Galaxy", createdAt: mskDate(2026, 3, 12, 18, 40).toISOString() },
    { code: "K7WQ2D", title: "VonScheer", author: "Galaxy", createdAt: mskDate(2026, 3, 12, 19, 5).toISOString() },
  ],
};

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
      plans: await missionPlans(missionId, [...gamePlans(missionId, ms), ...(PLANS[missionId] ?? [])]),
    };
  },
};
