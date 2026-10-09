/**
 * Domain model — mirrors docs/data-model.md. Plans and replays live in the
 * ops planner's database; the hub only stores their 6-char codes.
 */

export type ISODate = string;

export interface Player {
  id: string;
  name: string;
  discordId?: string;
  avatarUrl?: string | null;
}

/** One briefing section as the author wrote it: paragraphs, and "- " lines for list items. */
export interface BriefingSection {
  title: string;
  body: string;
}

export interface Briefing {
  /** «За кого» / «Против кого». */
  sides?: { for?: string; against?: string };
  /** Usually Ситуация, Задачи, Враждебные силы, Дружественные силы, Поддержка, Замечания, in the author's order. */
  sections: BriefingSection[];
}

export interface Mission {
  id: string;
  name: string;
  /** Planner map key (planner `maps.ts`), e.g. "everon". */
  mapKey: string;
  mapLabel: string;
  /** Public path or null → map art fallback. Covers have the title printed on them: never crop. */
  coverUrl: string | null;
  authors: string[];
  workshopUrl?: string;
  /** Workshop addon GUID, e.g. "6AB195F5F18A4E65". */
  addonGuid?: string;
  /** Scenario resource the server loads, e.g. "{6AB195F5DF08EA17}Missions/Operation_Fallen_Hawk.conf". */
  scenarioId?: string;
  briefing?: Briefing;
  tags: string[];
  /** Mission markers (`Markers.layer`) imported into the planner. */
  hasMarkersLayer: boolean;
  /** false = a simple op that needs no plan, so no Markers.layer either. */
  planning?: boolean;
  /** Slot template, HQ first. Each game copies it, and the author or an admin can grow it later. */
  squads?: MissionSquad[];
  /** Played without slotting: players just say «Я приду!». No squads and no flag = slots not set up yet. */
  noSlotting?: boolean;
}

/** One squad of a mission's slot template — a line of the Discord bot's slot file. */
export interface MissionSquad {
  /** "1'1" */
  groupId: string;
  name: string;
  slots: MissionSlot[];
}

export interface MissionSlot {
  /** As written in the slot file, fireteam prefix included: "BLUE - Grenadier". */
  role: string;
  /** Discord role a player needs to take it (`[@SL]` in the bot's file). */
  requiredRole?: string;
}

export interface Slot {
  id: string;
  /** Slotting-bot group id, e.g. "1'1". */
  groupId: string;
  groupName: string;
  /** As written in the slot file, fireteam prefix included: "BLUE - Grenadier". */
  role: string;
  playerName: string | null;
  /** Progressive slotting: opens once the leader slots above it are filled. */
  locked: boolean;
}

export interface EventBase {
  id: string;
  startsAt: ISODate;
  mission: Mission;
  /** Outside the usual Tue 20:00 / Sun 19:00 slots. */
  extra: boolean;
  hostName?: string;
  platoonLeader?: string | null;
}

export interface UpcomingEvent extends EventBase {
  status: "upcoming";
  slots: Slot[];
  /** The game's own plan (lib/plans). */
  plan: PlanRef | null;
}

export interface Award {
  emoji: string;
  title: string;
  playerName: string;
  detail: string;
}

export interface LeaderboardEntry {
  playerName: string;
  value: number;
}

export interface FriendlyFireIncident {
  shooter: string;
  victim: string;
  /** Op clock, "1:42:10". */
  at: string;
}

export interface AttendanceEntry {
  playerName: string;
  role: string;
  attended: boolean;
}

export interface PastEvent extends EventBase {
  status: "past";
  /** Actual server times from the replay — can differ from the scheduled `startsAt`. */
  startedAt: ISODate;
  endedAt: ISODate;
  slotted: number;
  attended: number;
  /** Several codes when a server restart split the op. */
  replayCodes: string[];
  planCode: string | null;
  stats: {
    deaths: number;
    shots?: number;
    grenades?: number;
    rockets?: number;
    knockdowns?: number;
    /** Shots fired by AI. */
    aiShots?: number;
    /** AI killed by players. */
    aiKilled?: number;
    friendlyFire?: number;
    topAiKills: LeaderboardEntry | null;
  };
  friendlyFireIncidents?: FriendlyFireIncident[];
  awards: Award[];
  leaderboards?: { aiKills: LeaderboardEntry[]; deaths: LeaderboardEntry[] };
  attendance: AttendanceEntry[];
}

export type HubEvent = UpcomingEvent | PastEvent;

/**
 * A plan for a mission. Every push in the planner mints a new code; `code` is the
 * version to sync — a hub plan's newest push (lib/plans).
 */
export interface PlanRef {
  code: string;
  /** Optional name the author gave the plan. */
  title?: string;
  author: string;
  /** Hub plans: the author's Discord id (their own mission plans open editable). */
  authorId?: string;
  /** When `code` was pushed. */
  createdAt: ISODate;
  /** Hub plan id; absent for a code known only from a played game. */
  id?: string;
  /** Pushed to at least once. false = a game plan still showing the version it was started from. */
  pushed?: boolean;
  /** The game it is (or was) the plan for. */
  event?: { id: string; startsAt: ISODate };
}

export interface MissionHistory {
  timesPlayed: number;
  plans: PlanRef[];
}

/** A usual weekly slot with nothing scheduled in it yet. */
export interface OpenSlot {
  status: "open";
  startsAt: ISODate;
}
