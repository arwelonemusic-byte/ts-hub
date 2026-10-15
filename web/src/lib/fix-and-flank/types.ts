/** Fix and Flank in the hub (user decisions 2026-10-15). The game itself is games/fix-and-flank. */

/** A draft is its author's only; a published map is locked (no edits: they would void its runs and records). */
export type FnfMapStatus = "draft" | "published";

export interface FnfMap {
  id: string;
  name: string;
  /** Display name: the author's, or the credit of a map that came with the game. */
  author: string;
  /** players.id; null for a map that came with the game. */
  authorId: string | null;
  status: FnfMapStatus;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  /** Finished runs, won or lost: what «Популярные» sorts by. */
  plays: number;
  /** The fewest turns anyone has won it in; null until someone has. */
  record: number | null;
  /** A still of the map for lists (16:10), taken in the editor; null until it has one. */
  thumbUrl: string | null;
}

/** A row of a map's leaderboard: each player's best win, fewest turns first (turns only, user decision 2026-10-15). */
export interface FnfRun {
  rank: number;
  player: string;
  turns: number;
  finishedAt: string;
  /** For «Повтор»: a run is its map, seed and orders, which the game plays back. */
  runId: string;
}

export interface FnfComment {
  id: string;
  author: string;
  avatar: string | null;
  body: string;
  createdAt: string;
}

/** The game page's «Активность»: runs finished (a record when it beat the map's best) and maps published. */
export interface FnfActivity {
  id: string;
  kind: "won" | "lost" | "record" | "published";
  player: string;
  map: { id: string; name: string };
  turns?: number;
  at: string;
}

export type FnfSort = "fresh" | "popular";
