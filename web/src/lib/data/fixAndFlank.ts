import type { FnfActivity, FnfComment, FnfMap, FnfRun, FnfSort } from "@/lib/fix-and-flank/types";
import mock from "./fix-and-flank-mock.json";

/**
 * Fix and Flank's maps, runs and comments. MOCK for now: fix-and-flank-mock.json, made with the game's own map
 * generator (6 maps, one a draft; 73 runs; a few comments). The tables to replace it are drafted in
 * db/schema.sql (fnf_*); the pages only see this interface, so nothing else changes when they are built.
 */
export interface FixAndFlankData {
  /** Published maps, newest first or most played first. */
  listMaps(sort: FnfSort): Promise<FnfMap[]>;
  /** A player's own maps, drafts first, then published, newest first in each. */
  listMapsBy(author: string): Promise<FnfMap[]>;
  /** A published map, or the viewer's own draft. */
  getMap(id: string, viewerName: string | null): Promise<FnfMap | null>;
  /** The map in the game's file format (data/maps), for the game and the preview. */
  getMapJson(id: string, viewerName: string | null): Promise<unknown | null>;
  /** Up to 10 runs: each player's best win, fewest turns first, earlier first on a tie. */
  getLeaderboard(mapId: string): Promise<FnfRun[]>;
  getComments(mapId: string): Promise<FnfComment[]>;
  /** The newest first. */
  listActivity(limit: number): Promise<FnfActivity[]>;
}

type MockMap = (typeof mock.maps)[number];
const LEADERBOARD = 10;

const thumbUrl = (id: string) => `/fix-and-flank/maps/${id}.jpg`;

function toMap(m: MockMap): FnfMap {
  const runs = mock.plays.filter((p) => p.mapId === m.id);
  const wins = runs.filter((p) => p.result === "won").map((p) => p.turns);
  return {
    id: m.id,
    name: m.name,
    author: m.author,
    status: m.status as FnfMap["status"],
    createdAt: m.createdAt,
    publishedAt: m.publishedAt,
    plays: runs.length,
    record: wins.length ? Math.min(...wins) : null,
    thumbUrl: thumbUrl(m.id),
  };
}

const visible = (m: MockMap, viewerName: string | null) => m.status === "published" || m.author === viewerName;
const newest = (a: FnfMap, b: FnfMap) => (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt);

export const fixAndFlankData: FixAndFlankData = {
  async listMaps(sort) {
    const maps = mock.maps.filter((m) => m.status === "published").map(toMap);
    return maps.sort(sort === "popular" ? (a, b) => b.plays - a.plays || newest(a, b) : newest);
  },
  async listMapsBy(author) {
    const maps = mock.maps.filter((m) => m.author === author).map(toMap);
    return maps.sort((a, b) => Number(b.status === "draft") - Number(a.status === "draft") || newest(a, b));
  },
  async getMap(id, viewerName) {
    const m = mock.maps.find((x) => x.id === id);
    return m && visible(m, viewerName) ? toMap(m) : null;
  },
  async getMapJson(id, viewerName) {
    const m = mock.maps.find((x) => x.id === id);
    return m && visible(m, viewerName) ? m.json : null;
  },
  async getLeaderboard(mapId) {
    const best = new Map<string, (typeof mock.plays)[number]>();
    for (const p of mock.plays) {
      if (p.mapId !== mapId || p.result !== "won") continue;
      const had = best.get(p.player);
      if (!had || p.turns < had.turns || (p.turns === had.turns && p.finishedAt < had.finishedAt)) best.set(p.player, p);
    }
    const rows = [...best.values()].sort((a, b) => a.turns - b.turns || a.finishedAt.localeCompare(b.finishedAt)).slice(0, LEADERBOARD);
    // Competition ranking: the same turns share a rank.
    return rows.map((p, i) => ({
      rank: i > 0 && rows[i - 1].turns === p.turns ? rows.findIndex((r) => r.turns === p.turns) + 1 : i + 1,
      player: p.player,
      turns: p.turns,
      finishedAt: p.finishedAt,
      runId: p.id,
    }));
  },
  async getComments(mapId) {
    return mock.comments
      .filter((c) => c.mapId === mapId)
      .map((c) => ({ id: c.id, author: c.author, avatar: null, body: c.body, createdAt: c.createdAt }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async listActivity(limit) {
    const names = new Map(mock.maps.map((m) => [m.id, m.name]));
    const out: FnfActivity[] = [];
    for (const m of mock.maps) {
      if (m.publishedAt) out.push({ id: `pub-${m.id}`, kind: "published", player: m.author, map: { id: m.id, name: m.name }, at: m.publishedAt });
    }
    const bestSoFar = new Map<string, number>();
    for (const p of mock.plays) {
      const prev = bestSoFar.get(p.mapId);
      const record = p.result === "won" && (prev === undefined || p.turns < prev);
      if (record) bestSoFar.set(p.mapId, p.turns);
      const kind = record ? "record" : (p.result as "won" | "lost");
      out.push({ id: p.id, kind, player: p.player, map: { id: p.mapId, name: names.get(p.mapId) ?? p.mapId }, turns: p.turns, at: p.finishedAt });
    }
    return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  },
};
