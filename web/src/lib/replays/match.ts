import type { ReplayInfo } from "./planner";

/*
 * Which recordings belong to a game. Every server boot starts a new recording (and so ends the one before),
 * so an op is in the last recording on its map that started before the game, plus any that started during
 * it (a crash restart). Test sessions earlier that day are their own, earlier recordings. The «Игра окончена»
 * dialog ticks those; the admin confirms.
 */

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9а-яё]/g, "");

/**
 * Terrain folders in a recording's terrainResource → planner map keys, from the recordings of the games
 * played so far (2026-10-09). An unknown folder (a new terrain) just means no map hint.
 */
const TERRAIN_FOLDERS: Record<string, string> = {
  eden: "everon",
  arland: "arland",
  cain: "kolguyev",
  chernot: "chernarus",
  zarichne: "zarichne",
  zargabadempty: "zargabad",
  zimnitrita: "zimnitrita",
  serhiivka: "serhiivka",
  takistan: "takistan",
  ruha: "ruha",
  armenhof: "armenhof",
  alhadra: "alhadra",
  seitenbuch: "seitenbuch",
  iraq: "iraq1990",
  kunar: "kunar",
  merakisland: "merak",
  mogadishu: "mogadishu",
  westzagoria: "westzagoria",
  // Faircroft Islands' terrain is "BritMapProject" inside.
  britmapproject: "faircroft",
};

/** The planner map a recording was made on, when its terrain folder is a known one. */
export function replayMap(terrain: string): string | null {
  for (const part of terrain.split(/[\\/]/)) {
    const key = TERRAIN_FOLDERS[squash(part)];
    if (key) return key;
  }
  return null;
}

export interface ReplayMatch {
  /** The recording's map vs the mission's: true, false, or null when its terrain isn't a known one. */
  sameMap: boolean | null;
  /** The world is this mission's own ("Another_Castle"), not the shared "TS_Mission" one. */
  sameName: boolean;
  /** Ticked by default (suggest()). */
  suggested: boolean;
}

const HOUR = 3600_000;

type Game = { startsAt: string; mission: { name: string; mapKey: string; scenarioId?: string } };

/**
 * A recording's world file is its scenario's (Another_Castle.conf plays Another_Castle.ent; checked on every
 * op since 2026-09-15), so the world names the mission. Several missions share the TS_Mission world: for
 * those the map has to agree too, or at least not disagree (an unknown terrain).
 */
function matchReplay(r: ReplayInfo, game: Game): Omit<ReplayMatch, "suggested"> & { fits: boolean } {
  const map = replayMap(r.terrain);
  const sameMap = map === null ? null : map === game.mission.mapKey;
  const world = squash(r.world);
  const stem = squash(game.mission.scenarioId?.split("/").pop()?.replace(/\.conf$/i, "") ?? "");
  const sameWorld = world !== "" && (world === stem || world === squash(game.mission.name));
  return { sameMap, sameName: sameWorld && world !== "tsmission", fits: sameWorld && sameMap !== false };
}

/**
 * Each recording with how it matches the game. Suggested: of this mission's recordings, the last one started
 * up to 3 hours before the game, and those started in the 3 hours after its start.
 */
export function suggest(replays: ReplayInfo[], game: Game): (ReplayInfo & ReplayMatch)[] {
  const start = Date.parse(game.startsAt);
  const matched = replays.map((r) => {
    const { fits, ...m } = matchReplay(r, game);
    return { r: { ...r, ...m, suggested: false }, fits };
  });
  const fits = matched.filter((x) => x.fits).map((x) => x.r);
  const at = (r: ReplayInfo) => r.startedAt * 1000;
  const before = fits.filter((r) => at(r) <= start && at(r) > start - 3 * HOUR).sort((a, b) => b.startedAt - a.startedAt)[0];
  for (const r of fits) if (r === before || (at(r) > start && at(r) < start + 3 * HOUR)) r.suggested = true;
  return matched.map((x) => x.r);
}
