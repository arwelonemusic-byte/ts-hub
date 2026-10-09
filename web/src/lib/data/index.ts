import type { HubEvent, Mission, MissionHistory, PastEvent, UpcomingEvent } from "@/lib/types";
import { gamesData } from "./games";

/**
 * Everything the pages read goes through this interface, so the sources behind it
 * change only in this folder. Missions (missions.ts) and games (games.ts) come from
 * the database.
 */
export interface HubData {
  /** Scheduled events from `now` on, soonest first. */
  listUpcoming(now: Date): Promise<UpcomingEvent[]>;
  /** Played events, newest first. */
  listPast(): Promise<PastEvent[]>;
  getEvent(id: string, now: Date): Promise<HubEvent | null>;
  /** A fingerprint of what changes on a game's page while people look at it (slots, attached plan); null = no such game. */
  getEventVersion(id: string): Promise<string | null>;
  /** Every event (played or scheduled) starting in [from, to), soonest first. */
  listBetween(from: Date, to: Date, now: Date): Promise<HubEvent[]>;
  /** Start of the earliest and latest event on record — the feed's scroll limits. */
  getRange(now: Date): Promise<{ first: Date; last: Date } | null>;
  /** The whole mission catalogue, in no particular order. */
  listMissions(): Promise<Mission[]>;
  getMission(id: string): Promise<Mission | null>;
  /** The mission's Markers.layer file (for the planner), null when it has none. */
  getMarkersLayer(id: string): Promise<string | null>;
  /** A mission's games: scheduled ones soonest first, then played ones newest first. */
  listMissionEvents(missionId: string, now: Date): Promise<HubEvent[]>;
  /** How often a mission was played and the plans drawn for it. */
  getMissionHistory(missionId: string): Promise<MissionHistory>;
}

export function getHubData(): HubData {
  return gamesData;
}
