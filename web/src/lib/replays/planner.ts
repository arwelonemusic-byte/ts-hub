import type { Replay, ReplayEvent } from "./stats";

/**
 * TS Replay recordings live in the planner's database (`/api/replays`, public reads). They are read from
 * the production planner even in dev — a local planner has no real recordings — unless
 * PLANNER_REPLAYS_URL says otherwise.
 */
const REPLAYS_URL = process.env.PLANNER_REPLAYS_URL ?? process.env.NEXT_PUBLIC_PLANNER_URL ?? "https://planner.tacticalshift.ru";
const CHUNK = 20000;

export interface ReplayInfo {
  code: string;
  /** World file name, e.g. "Another_Castle" or a generic "TS_Mission". */
  world: string;
  /** Recording start (server boot), epoch seconds. */
  startedAt: number;
  /** "worlds/Eden/Eden/.Data/Eden_0_supertexture.edds": the terrain's folder names the map. */
  terrain: string;
  planCode: string | null;
}

interface ReplayMeta {
  startedAt?: number;
  worldFileName?: string;
  terrainResource?: string;
  planCode?: string;
}

const toInfo = (r: { code: string; world?: string; meta?: ReplayMeta }): ReplayInfo => ({
  code: r.code,
  world: r.meta?.worldFileName ?? r.world ?? "",
  startedAt: r.meta?.startedAt ?? 0,
  terrain: r.meta?.terrainResource ?? "",
  planCode: r.meta?.planCode ?? null,
});

/** The planner's newest recordings (it returns at most 50: about a week of ops). */
export async function listRecentReplays(n = 50): Promise<ReplayInfo[] | null> {
  try {
    const res = await fetch(`${REPLAYS_URL}/api/replays?recent=${n}`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { replays?: { code: string; world?: string; meta?: ReplayMeta }[] };
    return (body.replays ?? []).map(toInfo);
  } catch {
    return null;
  }
}

/** A whole recording, every chunk of its event stream; null when it can't be read. */
export async function fetchReplay(code: string): Promise<Replay | null> {
  const events: ReplayEvent[] = [];
  let info: ReplayInfo | null = null;
  try {
    for (let offset = 0; ; ) {
      const res = await fetch(`${REPLAYS_URL}/api/replays/${encodeURIComponent(code)}?offset=${offset}&limit=${CHUNK}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { code: string; world?: string; meta?: ReplayMeta; events?: ReplayEvent[]; totalEvents?: number };
      info ??= toInfo(body);
      const chunk = body.events ?? [];
      // Not spread into push(): a chunk is 20 000 events, too many arguments for some engines.
      for (const e of chunk) events.push(e);
      offset += chunk.length;
      if (!chunk.length || offset >= (body.totalEvents ?? offset)) break;
    }
  } catch {
    return null;
  }
  return info && { code: info.code, startedAt: info.startedAt, planCode: info.planCode, events };
}
