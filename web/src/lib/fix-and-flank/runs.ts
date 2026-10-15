import { randomInt } from "node:crypto";
import { getDb } from "@/lib/db";
import type { Outcome } from "./maps";
import { gameVersion, replayRun } from "./rules";
import { makeT } from "@/lib/i18n";

const t = makeT("ru"); // the game reads these, and the game is Russian only

/**
 * Runs (fnf_runs): a member playing a published map, recorded. The hub hands out the seed when the run starts, so the
 * dice aren't the player's to pick. At the end the game sends BLUFOR's orders and the hub plays them through the game's
 * own rules (rules.ts → src/ai/run.js): the result and the turns are the server's, never the browser's. The leaderboard
 * ranks wins by turns alone (user decision 2026-10-15). A run left unfinished counts for nothing.
 */

const SEED_MAX = 0x7fffffff;

export interface RunEnd {
  result: "won" | "lost";
  turns: number;
  /** Fewer turns than any win on this map before. */
  record: boolean;
  /** The player's best win on this map so far (a first win counts). */
  personalBest: boolean;
}

export interface RunReplay {
  id: string;
  mapId: string;
  mapName: string;
  player: string;
  seed: number;
  commits: unknown[];
  result: "won" | "lost";
  turns: number;
  finishedAt: string;
  /** Played with the rules the hub has now; if not, a replay may go differently. */
  sameRules: boolean;
}

/** A new run on a published map: its id and seed. */
export async function startRun(playerId: string, mapId: unknown): Promise<Outcome<{ id: string; seed: number }>> {
  if (typeof mapId !== "string" || !mapId) return { error: t("fnf.err.whichMap"), status: 400 };
  const db = await getDb();
  const [map] = await db.query(`SELECT published_at FROM fnf_maps WHERE id = $1 AND hidden_at IS NULL`, [mapId]);
  if (!map) return { error: t("fnf.err.mapNotFound"), status: 404 };
  if (!map.published_at) return { error: t("fnf.err.draftRun"), status: 409 };
  const seed = randomInt(1, SEED_MAX);
  const [row] = await db.query(
    `INSERT INTO fnf_runs (map_id, player_id, seed, game_version) VALUES ($1, $2, $3, $4) RETURNING id`,
    [mapId, playerId, seed, await gameVersion()],
  );
  return { ok: { id: String(row.id), seed } };
}

/** The end of a run: its orders played through here; the result stored and how it compares. */
export async function finishRun(runId: string, playerId: string, commits: unknown): Promise<Outcome<RunEnd>> {
  if (!/^\d+$/.test(runId)) return { error: t("fnf.err.runNotFound"), status: 404 };
  const db = await getDb();
  const [run] = await db.query(
    `SELECT r.player_id, r.map_id, r.seed, r.result, m.json FROM fnf_runs r JOIN fnf_maps m ON m.id = r.map_id WHERE r.id = $1`,
    [runId],
  );
  if (!run || String(run.player_id) !== String(playerId)) return { error: t("fnf.err.notYourRun"), status: 404 };
  if (run.result) return { error: t("fnf.err.runDone"), status: 409 };
  const json = typeof run.json === "string" ? JSON.parse(run.json) : run.json;
  const end = await replayRun(json, Number(run.seed), commits);
  if ("error" in end) return { error: end.error, status: 400 };
  const [best] = await db.query(
    `SELECT min(turns) AS any, min(turns) FILTER (WHERE player_id = $2) AS mine FROM fnf_runs
     WHERE map_id = $1 AND result = 'won' AND id <> $3`,
    [run.map_id, playerId, runId],
  );
  const rows = await db.query(
    `UPDATE fnf_runs SET orders = $2::jsonb, result = $3, turns = $4, finished_at = NOW() WHERE id = $1 AND result IS NULL RETURNING id`,
    [runId, JSON.stringify(end.commits), end.result, end.turns],
  );
  if (!rows.length) return { error: t("fnf.err.runDone"), status: 409 };
  const won = end.result === "won";
  const beats = (v: unknown) => v === null || v === undefined || end.turns < Number(v);
  return { ok: { result: end.result, turns: end.turns, record: won && beats(best?.any), personalBest: won && beats(best?.mine) } };
}

/** A finished run, to play back («Повтор»). */
export async function getRun(runId: string): Promise<RunReplay | null> {
  if (!/^\d+$/.test(runId)) return null;
  const db = await getDb();
  const [r] = await db.query(
    `SELECT r.id, r.map_id, m.name AS map_name, p.display_name, r.seed, r.orders, r.result, r.turns, r.finished_at, r.game_version
     FROM fnf_runs r JOIN fnf_maps m ON m.id = r.map_id JOIN players p ON p.id = r.player_id
     WHERE r.id = $1 AND r.result IS NOT NULL AND m.hidden_at IS NULL`,
    [runId],
  );
  if (!r) return null;
  return {
    id: String(r.id),
    mapId: String(r.map_id),
    mapName: String(r.map_name),
    player: String(r.display_name),
    seed: Number(r.seed),
    commits: typeof r.orders === "string" ? JSON.parse(r.orders) : r.orders,
    result: r.result as "won" | "lost",
    turns: Number(r.turns),
    finishedAt: new Date(r.finished_at as string).toISOString(),
    sameRules: r.game_version === (await gameVersion()),
  };
}
