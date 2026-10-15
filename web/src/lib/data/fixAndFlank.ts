import { cache } from "react";
import { getDb } from "@/lib/db";
import type { FnfActivity, FnfComment, FnfMap, FnfRun, FnfSort } from "@/lib/fix-and-flank/types";

/**
 * Fix and Flank's maps, runs and comments (migration 012: fnf_maps, fnf_runs, fnf_comments). Maps are made and
 * published in the game's editor (lib/fix-and-flank/maps.ts); runs and comments aren't written yet, so the
 * leaderboards, records and «Активность» runs are empty until they are.
 */
export interface FixAndFlankData {
  /** Published maps, newest first or most played first. */
  listMaps(sort: FnfSort): Promise<FnfMap[]>;
  /** A player's own maps (players.id), drafts first, then published, newest first in each. */
  listMapsBy(playerId: string): Promise<FnfMap[]>;
  /** A published map, or the viewer's own draft. */
  getMap(id: string, playerId: string | null): Promise<FnfMap | null>;
  /** The map in the game's file format (data/maps), for the game, the editor and the preview. */
  getMapJson(id: string, playerId: string | null): Promise<unknown | null>;
  /** Up to 10 runs: each player's best win, fewest turns first, earlier first on a tie. */
  getLeaderboard(mapId: string): Promise<FnfRun[]>;
  getComments(mapId: string): Promise<FnfComment[]>;
  /** Runs finished and maps members published (not those that came with the game), newest first. */
  listActivity(limit: number): Promise<FnfActivity[]>;
}

const LEADERBOARD = 10;
const iso = (v: unknown) => new Date(v as string).toISOString();

// A map with its author's name and how it's been played.
const MAP_COLUMNS = `m.id, m.name, m.author_id, COALESCE(p.display_name, m.author_label) AS author, m.thumb_url,
  m.created_at, m.updated_at, m.published_at,
  (SELECT count(*)::int FROM fnf_runs r WHERE r.map_id = m.id) AS plays,
  (SELECT min(r.turns) FROM fnf_runs r WHERE r.map_id = m.id AND r.result = 'won') AS record
  FROM fnf_maps m LEFT JOIN players p ON p.id = m.author_id`;

type Row = Record<string, unknown>;

function toMap(r: Row): FnfMap {
  return {
    id: String(r.id),
    name: String(r.name),
    author: String(r.author ?? ""),
    authorId: r.author_id === null || r.author_id === undefined ? null : String(r.author_id),
    status: r.published_at ? "published" : "draft",
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    publishedAt: r.published_at ? iso(r.published_at) : null,
    plays: Number(r.plays ?? 0),
    record: r.record === null || r.record === undefined ? null : Number(r.record),
    thumbUrl: (r.thumb_url as string | null) ?? null,
  };
}

const listPublished = cache(async (sort: FnfSort): Promise<FnfMap[]> => {
  const db = await getDb();
  const order = sort === "popular" ? "plays DESC, m.published_at DESC" : "m.published_at DESC";
  const rows = await db.query(`SELECT ${MAP_COLUMNS} WHERE m.published_at IS NOT NULL AND m.hidden_at IS NULL ORDER BY ${order}`);
  return rows.map(toMap);
});

export const fixAndFlankData: FixAndFlankData = {
  listMaps: (sort) => listPublished(sort),
  async listMapsBy(playerId) {
    const db = await getDb();
    const rows = await db.query(
      `SELECT ${MAP_COLUMNS} WHERE m.author_id = $1 AND m.hidden_at IS NULL
       ORDER BY (m.published_at IS NULL) DESC, COALESCE(m.published_at, m.updated_at) DESC`,
      [playerId],
    );
    return rows.map(toMap);
  },
  async getMap(id, playerId) {
    const db = await getDb();
    const [row] = await db.query(
      `SELECT ${MAP_COLUMNS} WHERE m.id = $1 AND m.hidden_at IS NULL AND (m.published_at IS NOT NULL OR m.author_id = $2)`,
      [id, playerId],
    );
    return row ? toMap(row) : null;
  },
  async getMapJson(id, playerId) {
    const db = await getDb();
    const [row] = await db.query(
      `SELECT json FROM fnf_maps WHERE id = $1 AND hidden_at IS NULL AND (published_at IS NOT NULL OR author_id = $2)`,
      [id, playerId],
    );
    if (!row) return null;
    return typeof row.json === "string" ? JSON.parse(row.json) : row.json;
  },
  async getLeaderboard(mapId) {
    const db = await getDb();
    const rows = await db.query(
      `SELECT * FROM (
         SELECT DISTINCT ON (r.player_id) r.id, p.display_name, r.turns, r.finished_at
         FROM fnf_runs r JOIN players p ON p.id = r.player_id
         WHERE r.map_id = $1 AND r.result = 'won'
         ORDER BY r.player_id, r.turns, r.finished_at
       ) best ORDER BY turns, finished_at LIMIT ${LEADERBOARD}`,
      [mapId],
    );
    // Competition ranking: the same turns share a rank.
    return rows.map((r, i) => ({
      rank: rows.findIndex((x) => Number(x.turns) === Number(r.turns)) + 1 || i + 1,
      player: String(r.display_name),
      turns: Number(r.turns),
      finishedAt: iso(r.finished_at),
      runId: String(r.id),
    }));
  },
  async getComments(mapId) {
    const db = await getDb();
    const rows = await db.query(
      `SELECT c.id, p.display_name, p.avatar_url, c.body, c.created_at FROM fnf_comments c JOIN players p ON p.id = c.player_id
       WHERE c.map_id = $1 AND c.deleted_at IS NULL ORDER BY c.created_at DESC`,
      [mapId],
    );
    return rows.map((c) => ({ id: String(c.id), author: String(c.display_name), avatar: (c.avatar_url as string | null) ?? null, body: String(c.body), createdAt: iso(c.created_at) }));
  },
  async listActivity(limit) {
    const db = await getDb();
    const [maps, runs] = await Promise.all([
      db.query(
        `SELECT m.id, m.name, COALESCE(p.display_name, m.author_label) AS author, m.published_at FROM fnf_maps m
         LEFT JOIN players p ON p.id = m.author_id
         WHERE m.published_at IS NOT NULL AND m.hidden_at IS NULL AND m.author_id IS NOT NULL ORDER BY m.published_at DESC LIMIT $1`,
        [limit],
      ),
      // A win is a record when no earlier win on that map took as few turns.
      db.query(
        `SELECT r.id, r.result, r.turns, r.finished_at, p.display_name, m.id AS map_id, m.name AS map_name,
           (r.result = 'won' AND NOT EXISTS (SELECT 1 FROM fnf_runs e WHERE e.map_id = r.map_id AND e.result = 'won'
              AND e.finished_at < r.finished_at AND e.turns <= r.turns)) AS record
         FROM fnf_runs r JOIN players p ON p.id = r.player_id JOIN fnf_maps m ON m.id = r.map_id
         WHERE m.hidden_at IS NULL ORDER BY r.finished_at DESC LIMIT $1`,
        [limit],
      ),
    ]);
    const out: FnfActivity[] = [
      ...maps.map((m) => ({ id: `pub-${m.id}`, kind: "published" as const, player: String(m.author), map: { id: String(m.id), name: String(m.name) }, at: iso(m.published_at) })),
      ...runs.map((r) => ({
        id: `run-${r.id}`,
        kind: r.record ? ("record" as const) : (r.result as "won" | "lost"),
        player: String(r.display_name),
        map: { id: String(r.map_id), name: String(r.map_name) },
        turns: Number(r.turns),
        at: iso(r.finished_at),
      })),
    ];
    return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  },
};
