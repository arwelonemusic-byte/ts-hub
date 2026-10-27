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
  /** Discord ids of the authors who are members: they (with @mission officer) may edit it. */
  authorIds: string[];
  workshopUrl?: string;
  /** Workshop addon GUID, e.g. "6AB195F5F18A4E65". */
  addonGuid?: string;
  /** Scenario resource the server loads, e.g. "{6AB195F5DF08EA17}Missions/Operation_Fallen_Hawk.conf". */
  scenarioId?: string;
  briefing?: Briefing;
  tags: string[];
  /** When it was added to the hub (seeded or saved in the editor). */
  addedAt: ISODate;
  /** Mission markers (`Markers.layer`) imported into the planner. */
  hasMarkersLayer: boolean;
  /** false = a simple op that needs no plan, so no Markers.layer either. */
  planning?: boolean;
  /** Slot template, HQ first. Each game copies it, and the author or an admin can grow it later. */
  squads?: MissionSquad[];
  /** Played without slotting: players just say «Я приду!». No squads and no flag = slots not set up yet. */
  noSlotting?: boolean;
  /** Hidden from the catalogue and the schedule dialog (a broken or retired mission); its games still show it. */
  archived?: boolean;
  /**
   * A training (Wednesday drills): its games say «Тренировка», take «Я приду!» instead of slots, need no plan, stay out
   * of the catalog, and «Игра окончена» keeps only who came. Its template has no slots.
   */
  training?: boolean;
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
  /** Discord role a player needs to take it. */
  requiredRole?: string;
  playerName: string | null;
  /** Discord id of whoever took it, when they're a player (not a name copied from the bot). */
  playerId?: string;
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
  /** «Я приду!»: members coming, in sign-up order. Only games without slots take them. */
  rsvps: { name: string; discordId: string }[];
  /** The game's own plan (lib/plans). */
  plan: PlanRef | null;
}

/** The replay-stats achievements. The kind picks the title (i18n `award.<kind>`) and the illustration. */
export type AwardKind =
  | "butcher"
  | "demolitionist"
  | "rocketman"
  | "firstBlood"
  | "firstToDie"
  | "returnee"
  | "notForLong"
  | "hitYourOwn"
  | "untouchables"
  | "toughNut";

export interface Award {
  kind: AwardKind;
  /** Usually one; «Неприкасаемые» goes to everyone who finished unhurt. */
  players: string[];
  detail: string;
}

export interface LeaderboardEntry {
  playerName: string;
  value: number;
}

/**
 * A player who completed a line on their TS Bingo card (the mod's `bingo` replay events). `lines`, `cells` and
 * `marked` are the card of their latest line: a server restart mid-op deals new cards.
 */
export interface BingoWinner {
  playerName: string;
  /** Their first line. */
  at: ISODate;
  /** Lines over the whole op. */
  count: number;
  /** In the order they were made: 0-4 rows, 5-9 columns, 10 the diagonal from top left, 11 the other one. */
  lines: number[];
  /** The card's 25 texts row by row; the free centre is "". */
  cells: string[];
  /** Marked cells, bit i = cell i, the free centre included. */
  marked: number;
}

/** TS Bingo in a game: how many had a card, and who got a line (earliest first). */
export interface BingoResult {
  players: number;
  winners: BingoWinner[];
}

export interface FriendlyFireIncident {
  shooter: string;
  victim: string;
  /** Op clock, "1:42:10"; the replay-stats reports don't give it. */
  at?: string;
}

export interface AttendanceEntry {
  playerName: string;
  /** The slot they took; unknown for games played before the hub ran slotting. */
  role?: string;
  attended: boolean;
}

export interface PastEvent extends EventBase {
  status: "past";
  /** Actual server times from the replay — can differ from the scheduled `startsAt`. */
  startedAt: ISODate;
  endedAt: ISODate;
  /** null when unknown: games played before the hub ran slotting. */
  slotted: number | null;
  attended: number;
  /** Several codes when a server restart split the op. */
  replayCodes: string[];
  planCode: string | null;
  /**
   * Who brought that plan: the member who attached it to the game («Прикрепить план»). A game's «Нарисовать план»
   * pushes aren't hub plan versions, so the planner can't tell who drew them; «Игра окончена» forgets the attacher
   * when the game played another plan than the attached one.
   */
  planAuthor: string | null;
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
  /** knockouts and shots: games finished or back-filled since 2026-10-13. */
  leaderboards?: { aiKills: LeaderboardEntry[]; deaths: LeaderboardEntry[]; knockouts?: LeaderboardEntry[]; shots?: LeaderboardEntry[] };
  /** null when the recordings have no TS Bingo events (games before 2026-10-20, or the mod wasn't running). */
  bingo: BingoResult | null;
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

/** A member's comment on a mission's page: feedback on the mission itself (migration 014), the hub's own. */
export interface MissionComment {
  id: string;
  /** Its writer's Discord id: they (or an admin) can take it down, and a mission author's comment is marked. */
  discordId: string | null;
  author: string;
  avatar: string | null;
  body: string;
  createdAt: ISODate;
}

/** A usual weekly slot with nothing scheduled in it yet. */
export interface OpenSlot {
  status: "open";
  startsAt: ISODate;
}
