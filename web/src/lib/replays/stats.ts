import type { Award, AwardKind, LeaderboardEntry } from "../types";

/*
 * Op stats from TS Replay recordings — a port of ts-ops-planner tools/replay-stats (replay_stats.py
 * compute_stats + combine, and the awards of _ru_allplayers.py), so a game finished in the hub gets the
 * same numbers the back-filled reports have. data/events/build_past_events.py turned those reports into
 * `events.stats`; toGameResult builds the same shape. Keep the two in step when the rules change.
 * Pure: no I/O.
 */

/** One recorder event: `t` is ms since the recording started. */
export interface ReplayEvent {
  type: string;
  t: number;
  [k: string]: unknown;
}

export interface Replay {
  code: string;
  /** Recording start, epoch seconds. */
  startedAt: number;
  /** The plan synced in game with /syncplan, when the recording carries one. */
  planCode?: string | null;
  events: ReplayEvent[];
}

/** Chars whose every move sits within this of the world origin are spawn-menu placeholders. */
const PHANTOM_RADIUS_M = 5;
/** «Я ненадолго» counts only a re-death within 5 minutes. */
const QUICK_TURNAROUND_MAX_MS = 5 * 60 * 1000;

const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
/** The recorder writes booleans as "true"/"false" on some builds. */
const truthy = (v: unknown) => v === true || v === "true";
const inc = <K>(m: Map<K, number>, k: K, by = 1) => m.set(k, (m.get(k) ?? 0) + by);

interface ReplayStats {
  code: string;
  startedAt: number;
  planCode: string | null;
  firstJoinT: number;
  lastT: number;
  durationMs: number;
  playerNames: Map<number, string>;
  totalShotsPlayers: number;
  totalShotsAi: number;
  totalPlayerDeaths: number;
  totalAiDeaths: number;
  shots: Map<number, number>;
  grenades: Map<number, number>;
  rockets: Map<number, number>;
  deaths: Map<number, number>;
  incaps: Map<number, number>;
  revives: Map<number, number>;
  deathTimes: Map<number, number[]>;
  aiKills: Map<string, number>;
  teamKills: { killer: string; victim: string | null }[];
  firstDeath: [number, number] | null;
  firstAiKill: [number, string] | null;
}

function phantomsOf(events: ReplayEvent[]): Set<number> {
  const far = new Set<number>();
  const seen = new Set<number>();
  for (const e of events) {
    if (e.type !== "move") continue;
    const cid = num(e.charId);
    seen.add(cid);
    if (Math.abs(num(e.x)) > PHANTOM_RADIUS_M || Math.abs(num(e.z)) > PHANTOM_RADIUS_M) far.add(cid);
  }
  return new Set([...seen].filter((c) => !far.has(c)));
}

/** compute_stats, minus what the hub doesn't show (distance, joyride, PvP). Nobody is a "system" player: the community has a real player named "bot". */
function computeStats(replay: Replay): ReplayStats {
  const events = replay.events;
  const phantoms = phantomsOf(events);
  const playerNames = new Map<number, string>();
  const charOwner = new Map<number, number>();
  for (const e of events) {
    if (e.type === "player_join") playerNames.set(num(e.playerId), String(e.name));
    else if (e.type === "possess" && num(e.charId) !== 0) charOwner.set(num(e.charId), num(e.playerId));
  }
  const isPlayer = (pid: number | undefined): pid is number => pid !== undefined && playerNames.has(pid);

  let firstJoinT = Infinity;
  for (const e of events) if (e.type === "player_join" && e.t < firstJoinT) firstJoinT = e.t;
  if (firstJoinT === Infinity) firstJoinT = 0;

  // "Last out": the last event of a player-controlled char; AI-only activity after everyone left isn't op time.
  let lastT = firstJoinT;
  for (const e of events) {
    let owner: number | undefined;
    if (e.type === "shot") owner = charOwner.get(num(e.shooterCharId));
    else if (e.type === "move" || e.type === "damage_state" || e.type === "char_delete") owner = charOwner.get(num(e.charId));
    if (owner !== undefined && e.t > lastT) lastT = e.t;
  }

  const shots = new Map<number, number>();
  const grenades = new Map<number, number>();
  const rockets = new Map<number, number>();
  let totalShotsPlayers = 0;
  let totalShotsAi = 0;
  for (const e of events) {
    if (e.type !== "shot") continue;
    const owner = charOwner.get(num(e.shooterCharId));
    if (isPlayer(owner)) {
      totalShotsPlayers++;
      inc(shots, owner);
      if (truthy(e.isHeavy)) inc(rockets, owner);
      else if (truthy(e.isExplosion)) inc(grenades, owner);
    } else {
      totalShotsAi++;
    }
  }

  // Deaths, incaps and revives: state transitions per char (0 alive, 1 incapacitated, 2 dead).
  const statesByChar = new Map<number, [number, number][]>();
  for (const e of events) {
    if (e.type !== "damage_state") continue;
    const cid = num(e.charId);
    const list = statesByChar.get(cid) ?? [];
    list.push([e.t, num(e.state)]);
    statesByChar.set(cid, list);
  }
  const deaths = new Map<number, number>();
  const incaps = new Map<number, number>();
  const revives = new Map<number, number>();
  const deathTimes = new Map<number, number[]>();
  let totalPlayerDeaths = 0;
  let totalAiDeaths = 0;
  let firstDeath: [number, number] | null = null;
  for (const [cid, states] of statesByChar) {
    if (phantoms.has(cid)) continue;
    states.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const owner = charOwner.get(cid);
    const player = isPlayer(owner);
    let prev = 0;
    for (const [t, s] of states) {
      if (s === 2 && prev !== 2) {
        if (player) {
          inc(deaths, owner);
          deathTimes.set(owner, [...(deathTimes.get(owner) ?? []), t]);
          if (!firstDeath || t < firstDeath[0]) firstDeath = [t, owner];
          totalPlayerDeaths++;
        } else {
          totalAiDeaths++;
        }
      } else if (s === 1 && prev !== 1) {
        if (player) inc(incaps, owner);
      } else if (s === 0 && prev === 1) {
        if (player) inc(revives, owner);
      }
      prev = s;
    }
  }

  // Kills (the mod's `kill` events) attribute AI kills and team kills to named players.
  const aiKills = new Map<string, number>();
  const teamKills: ReplayStats["teamKills"] = [];
  let firstAiKill: [number, string] | null = null;
  for (const e of events) {
    if (e.type !== "kill") continue;
    const killer = num(e.killerPlayerId);
    const victim = num(e.victimPlayerId);
    if (killer <= 0 || !playerNames.has(killer)) continue;
    const killerName = playerNames.get(killer)!;
    if (e.isTeamKill) {
      teamKills.push({ killer: killerName, victim: victim > 0 ? (playerNames.get(victim) ?? null) : null });
      continue;
    }
    if (victim > 0 && playerNames.has(victim)) continue; // PvP: not shown in the hub
    inc(aiKills, killerName);
    if (!firstAiKill || e.t < firstAiKill[0]) firstAiKill = [e.t, killerName];
  }

  return {
    code: replay.code,
    startedAt: replay.startedAt,
    planCode: replay.planCode ?? null,
    firstJoinT,
    lastT,
    durationMs: Math.max(0, lastT - firstJoinT),
    playerNames,
    totalShotsPlayers,
    totalShotsAi,
    totalPlayerDeaths,
    totalAiDeaths,
    shots,
    grenades,
    rockets,
    deaths,
    incaps,
    revives,
    deathTimes,
    aiKills,
    teamKills,
    firstDeath,
    firstAiKill,
  };
}

/** Python's plural pick for the award captions. */
function plural(n: number, one: string, few: string, many: string): string {
  if (n % 10 === 1 && n % 100 !== 11) return one;
  if (n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14)) return few;
  return many;
}

/** Highest value first; ties keep first-seen order (Python's stable sort). Zeros are dropped. */
const ranked = (m: Map<string, number>): LeaderboardEntry[] =>
  [...m.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([playerName, value]) => ({ playerName, value }));
const top = (m: Map<string, number>) => ranked(m)[0] ?? null;

/** What a finished game stores (events row, attendance, replays) — same shape as played-events.json. */
export interface GameResult {
  /** First player in, epoch ms. */
  startedAt: number;
  /** Last player activity of the last recording, epoch ms. */
  endedAt: number;
  /** The /syncplan stamp of the latest recording that has one. */
  planCode: string | null;
  /** In-game names, sorted. */
  roster: string[];
  replays: string[];
  stats: {
    totals: { deaths: number; shots: number; aiShots: number; grenades: number; rockets: number; knockdowns: number; aiKilled: number; friendlyFire: number };
    leaderboards: { aiKills: LeaderboardEntry[]; deaths: LeaderboardEntry[] };
    awards: Award[];
    friendlyFire: { shooter: string; victim: string }[];
  };
  /** Sum of the recordings' op time, ms (for the preview). */
  durationMs: number;
}

const AWARD_ORDER: AwardKind[] = ["butcher", "demolitionist", "rocketman", "firstBlood", "firstToDie", "returnee", "notForLong", "hitYourOwn", "untouchables", "toughNut"];

/**
 * combine() + the awards of the Russian report. Recordings are one op split by server restarts:
 * players match by name across them, "firsts" come from the earliest recording that has one, and
 * «Я ненадолго» only counts re-deaths within one recording.
 */
export function toGameResult(replays: Replay[]): GameResult {
  // A recording nobody joined (an idle boot before the op) adds nothing and mustn't move the start.
  const list = replays
    .map(computeStats)
    .filter((s) => s.playerNames.size > 0)
    .sort((a, b) => a.startedAt - b.startedAt);
  const byName = (pick: (s: ReplayStats) => Map<number, number>) => {
    const out = new Map<string, number>();
    for (const s of list) for (const [pid, v] of pick(s)) {
      const n = s.playerNames.get(pid);
      if (n) inc(out, n, v);
    }
    return out;
  };
  const names = new Set(list.flatMap((s) => [...s.playerNames.values()]));
  const shots = byName((s) => s.shots);
  const grenades = byName((s) => s.grenades);
  const rockets = byName((s) => s.rockets);
  const deaths = byName((s) => s.deaths);
  const incaps = byName((s) => s.incaps);
  const revives = byName((s) => s.revives);
  const aiKills = new Map<string, number>();
  for (const s of list) for (const [n, v] of s.aiKills) inc(aiKills, n, v);
  const teamKills = list.flatMap((s) => s.teamKills);

  let firstDeath: string | null = null;
  let firstAiKill: string | null = null;
  for (const s of list) {
    if (!firstDeath && s.firstDeath) firstDeath = s.playerNames.get(s.firstDeath[1]) ?? null;
    if (!firstAiKill && s.firstAiKill) firstAiKill = s.firstAiKill[1];
  }

  const awards: Award[] = [];
  const add = (kind: AwardKind, players: string[], detail: string) => awards.push({ kind, players, detail });
  const butcher = top(aiKills);
  if (butcher) add("butcher", [butcher.playerName], `${butcher.value} ${plural(butcher.value, "убийство", "убийства", "убийств")} ИИ`);
  const demo = top(grenades);
  if (demo) add("demolitionist", [demo.playerName], `${demo.value} ${plural(demo.value, "граната", "гранаты", "гранат")} / подствольник`);
  const rocket = top(rockets);
  if (rocket) add("rocketman", [rocket.playerName], `${rocket.value} ${plural(rocket.value, "ракета", "ракеты", "ракет")}`);
  if (firstAiKill) add("firstBlood", [firstAiKill], "Первое убийство ИИ");
  if (firstDeath) add("firstToDie", [firstDeath], "Погиб первым");
  const returnee = top(revives);
  if (returnee) add("returnee", [returnee.playerName], `${returnee.value} ${plural(returnee.value, "подъём", "подъёма", "подъёмов")} из нокаута`);

  let bestGap: number | null = null;
  let bestName: string | null = null;
  for (const s of list) {
    for (const [pid, times] of s.deathTimes) {
      const n = s.playerNames.get(pid);
      if (!n) continue;
      const sorted = [...times].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) {
        const gap = sorted[i] - sorted[i - 1];
        if (bestGap === null || gap < bestGap) {
          bestGap = gap;
          bestName = n;
        }
      }
    }
  }
  if (bestGap !== null && bestName && bestGap <= QUICK_TURNAROUND_MAX_MS) {
    const sec = bestGap / 1000;
    const gap = sec < 60 ? `${sec.toFixed(1)}с` : `${Math.floor(sec / 60)}м ${String(Math.floor(sec % 60)).padStart(2, "0")}с`;
    add("notForLong", [bestName], `Снова погиб через ${gap}`);
  }

  const tk = new Map<string, number>();
  for (const k of teamKills) inc(tk, k.killer);
  const hitYourOwn = top(tk);
  if (hitYourOwn) add("hitYourOwn", [hitYourOwn.playerName], `${hitYourOwn.value} ${plural(hitYourOwn.value, "случай", "случая", "случаев")} дружественного огня`);

  const sortedNames = [...names].sort();
  const untouchables = sortedNames.filter((n) => (shots.get(n) ?? 0) >= 10 && !incaps.get(n) && !deaths.get(n));
  if (untouchables.length) add("untouchables", untouchables, "Ни нокаута, ни смерти");

  const diehard = new Map<string, number>();
  for (const n of names) if (!deaths.get(n) && (incaps.get(n) ?? 0) >= 2) diehard.set(n, incaps.get(n)!);
  const nut = top(diehard);
  if (nut) add("toughNut", [nut.playerName], `${nut.value} ${plural(nut.value, "нокаут", "нокаута", "нокаутов")}, ни одной смерти`);
  awards.sort((a, b) => AWARD_ORDER.indexOf(a.kind) - AWARD_ORDER.indexOf(b.kind));

  const first = list[0] ?? computeStats({ code: "", startedAt: 0, events: [] });
  const last = list.at(-1) ?? first;
  const sum = (pick: (s: ReplayStats) => number) => list.reduce((n, s) => n + pick(s), 0);
  const total = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
  return {
    startedAt: first.startedAt * 1000 + first.firstJoinT,
    endedAt: last.startedAt * 1000 + last.lastT,
    planCode: [...list].reverse().find((s) => s.planCode)?.planCode ?? null,
    roster: sortedNames,
    replays: list.map((s) => s.code),
    durationMs: sum((s) => s.durationMs),
    stats: {
      totals: {
        deaths: sum((s) => s.totalPlayerDeaths),
        shots: sum((s) => s.totalShotsPlayers),
        aiShots: sum((s) => s.totalShotsAi),
        grenades: total(grenades),
        rockets: total(rockets),
        knockdowns: total(incaps),
        aiKilled: sum((s) => s.totalAiDeaths),
        friendlyFire: teamKills.length,
      },
      leaderboards: { aiKills: ranked(aiKills), deaths: ranked(deaths) },
      awards,
      friendlyFire: teamKills.map((k) => ({ shooter: k.killer, victim: k.victim ?? "союзный ИИ" })),
    },
  };
}
