/**
 * Games are still mock data for the POC: past ops are real, but upcoming dates, slot fills,
 * PL names and the Fallen Hawk plan codes are invented. Missions come from the database
 * (lib/data/missions.ts) and hub plans are real (lib/plans, against the planner). Upcoming
 * events are pinned to the next usual slots relative to "now", so the page never goes stale.
 */
import type {
  AttendanceEntry,
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

// ---------------------------------------------------------------- missions

type Missions = Map<string, Mission>;

function pick(ms: Missions, id: string): Mission {
  const m = ms.get(id);
  if (!m) throw new Error(`mock: no mission "${id}"`);
  return m;
}

/** The missions the mock games use (ids in the catalogue). */
const M = {
  foxhound: "foxhound",
  geras: "project-geras",
  baseJumping: "base-jumping",
  circuitBreaker: "circuit-breaker",
  counterpunch: "counterpunch",
  anotherCastle: "another-castle",
  emerald: "emerald-fields",
  quietWitness: "quiet-witness",
  reverseSlope: "reverse-slope",
  metalGambit: "metal-gambit",
  regina: "regina-brawl",
  troubledWaters: "troubled-waters",
  marchingFire: "marching-fire",
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

const lb = (rows: [string, number][]): LeaderboardEntry[] => rows.map(([playerName, value]) => ({ playerName, value }));

const COUNTERPUNCH_AI_KILLS = lb([
  ["JFKennedy", 90], ["M_i", 20], ["[BS] Ушастый перец", 17], ["[En-Y]Inspector", 15], ["[En-Y]Boba", 13],
  ["Mike_Jay_Evans", 12], ["[En-Y]Sasce2044", 11], ["[RTT] J.A.N.", 10], ["Prais777", 9], ["[En-Y]Sterben", 7],
  ["[En-Y]amil1Xe", 7], ["Osamich", 5], ["Jaelise", 5], ["OnlineKiller.", 5], ["Galaxy", 4], ["Сваркослав", 3],
  ["Venom_coceT", 2], ["Tactical Shift", 1], ["Valso", 1],
]);

const COUNTERPUNCH_DEATHS = lb([
  ["[RTT] J.A.N.", 3], ["[En-Y]amil1Xe", 3], ["[En-Y]Sterben", 3], ["[En-Y]BURBON", 2], ["[En-Y]Sasce2044", 2],
  ["Mike_Jay_Evans", 2], ["JFKennedy", 2], ["[En-Y]Inspector", 2], ["[BS] Ушастый перец", 1], ["Tactical Shift", 1],
  ["Osamich", 1], ["Georg Shultz", 1], ["Venom_coceT", 1], ["M_i", 1], ["Jaelise", 1], ["Galaxy", 1], ["Valso", 1],
  ["Prais777", 1],
]);

const COUNTERPUNCH_AWARDS: Award[] = [
  { emoji: "🔫", title: "Первая кровь", playerName: "Mike_Jay_Evans", detail: "Первый выстрел операции" },
  { emoji: "⚰️", title: "Первопроходец того света", playerName: "Tactical Shift", detail: "Погиб первым" },
  { emoji: "🎯", title: "Меткий стрелок", playerName: "JFKennedy", detail: "90 убийств ИИ" },
  { emoji: "💣", title: "Подрывник", playerName: "[BS] Ушастый перец", detail: "69 гранат / подствольник" },
  { emoji: "🚀", title: "Ракетный хирург", playerName: "[En-Y]Inspector", detail: "8 ракет" },
  { emoji: "👻", title: "Возвращенец", playerName: "OnlineKiller.", detail: "5 подъёмов из нокаута" },
  { emoji: "💀", title: "Быстрое возвращение", playerName: "[En-Y]Sterben", detail: "Снова погиб через 1м 34с после прошлой смерти" },
  { emoji: "🤝", title: "Свой по своим", playerName: "[En-Y]Inspector", detail: "1 случай дружественного огня" },
  { emoji: "🔁", title: "Крепкий орешек", playerName: "OnlineKiller.", detail: "5 нокаутов, 0 смертей" },
];

function counterpunchAttendance(ms: Missions): AttendanceEntry[] {
  // Prais777 led the op, so they take the Platoon Leader row.
  const attended = [...new Set(["Prais777", ...[...COUNTERPUNCH_AI_KILLS, ...COUNTERPUNCH_DEATHS].map((e) => e.playerName)]), "Kedr"];
  const roles = (pick(ms, M.counterpunch).squads ?? []).flatMap((sq) => sq.slots.map((s) => s.role));
  const rows = attended.map((playerName, i) => ({ playerName, role: roles[i] ?? "Rifleman", attended: true }));
  const noShows = ["DarkCote", "alien_2010", "Lis", "Nomad"].map((playerName, i) => ({
    playerName,
    role: roles[attended.length + i] ?? "Rifleman",
    attended: false,
  }));
  return [...rows, ...noShows];
}

interface PastSeed {
  mission: string;
  at: [number, number, number, number]; // month (1-12), day, hour, minute — 2026, MSK
  extra?: boolean;
  players: number;
  minutes: number;
  deaths: number;
  top: [string, number];
  replays: string[];
  plan: string | null;
  award?: Award;
}

const PAST: PastSeed[] = [
  { mission: M.anotherCastle, at: [10, 6, 20, 0], players: 17, minutes: 103, deaths: 18, top: ["M_i", 17], replays: ["DFTZSB"], plan: "HV3KQ2", award: { emoji: "🔫", title: "Первая кровь", playerName: "alien_2010", detail: "Первый выстрел операции" } },
  { mission: M.counterpunch, at: [10, 4, 19, 0], players: 22, minutes: 184, deaths: 29, top: ["JFKennedy", 90], replays: ["JNCFEB"], plan: "P9TXBN" },
  { mission: M.emerald, at: [10, 3, 19, 0], extra: true, players: 19, minutes: 134, deaths: 12, top: ["Jaelise", 44], replays: ["ERL7B9"], plan: "M4RZDK", award: { emoji: "💣", title: "Подрывник", playerName: "DarkCote", detail: "Больше всех гранат / подствольник" } },
  { mission: M.quietWitness, at: [10, 1, 20, 0], extra: true, players: 19, minutes: 93, deaths: 9, top: ["Prais777", 24], replays: ["MCKFLK"], plan: null },
  { mission: M.reverseSlope, at: [9, 29, 20, 0], players: 24, minutes: 114, deaths: 15, top: ["M_i", 16], replays: ["EXWZSN"], plan: "C8WLJF" },
  { mission: M.metalGambit, at: [9, 27, 19, 0], players: 17, minutes: 131, deaths: 16, top: ["Prais777", 63], replays: ["LW4AH8", "4BNRSS"], plan: "T2NQVA" },
  { mission: M.regina, at: [9, 24, 20, 0], extra: true, players: 13, minutes: 129, deaths: 11, top: ["JFKennedy", 68], replays: ["6L239S"], plan: null },
  { mission: M.troubledWaters, at: [9, 22, 20, 0], players: 14, minutes: 78, deaths: 6, top: ["Prais777", 25], replays: ["S2RM53"], plan: "K6DPWR" },
  { mission: M.marchingFire, at: [9, 22, 21, 30], players: 20, minutes: 66, deaths: 9, top: ["Prais777", 21], replays: ["VNG9BN"], plan: null },
];

function buildPast(ms: Missions): PastEvent[] {
  return PAST.map((p) => {
    const start = mskDate(2026, p.at[0] - 1, p.at[1], p.at[2], p.at[3]);
    const id = `${start.toISOString().slice(0, 10)}-${p.mission}`;
    const base: PastEvent = {
      id,
      status: "past",
      startsAt: start.toISOString(),
      startedAt: start.toISOString(),
      endedAt: new Date(start.getTime() + p.minutes * 60_000).toISOString(),
      mission: pick(ms, p.mission),
      extra: !!p.extra,
      slotted: p.players + 2,
      attended: p.players,
      replayCodes: p.replays,
      planCode: p.plan,
      stats: { deaths: p.deaths, topAiKills: { playerName: p.top[0], value: p.top[1] } },
      awards: p.award ? [p.award] : [],
      attendance: ROSTER.slice(0, p.players).map((playerName) => ({ playerName, role: "Rifleman", attended: true })),
    };
    if (p.mission !== M.counterpunch) return base;
    return {
      ...base,
      slotted: 26,
      platoonLeader: "Prais777",
      // Actual server time, 18:58 – 22:02.
      startedAt: mskDate(2026, 9, 4, 18, 58).toISOString(),
      endedAt: mskDate(2026, 9, 4, 22, 2).toISOString(),
      stats: {
        ...base.stats,
        shots: 14129,
        aiShots: 15342,
        aiKilled: COUNTERPUNCH_AI_KILLS.reduce((n, e) => n + e.value, 0),
        grenades: 186,
        rockets: 14,
        knockdowns: 47,
        friendlyFire: 1,
      },
      // Matches the "Свой по своим" award; the victim and time are mock.
      friendlyFireIncidents: [{ shooter: "[En-Y]Inspector", victim: "Kedr", at: "1:42:10" }],
      awards: COUNTERPUNCH_AWARDS,
      leaderboards: { aiKills: COUNTERPUNCH_AI_KILLS, deaths: COUNTERPUNCH_DEATHS },
      attendance: counterpunchAttendance(ms),
    };
  });
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
