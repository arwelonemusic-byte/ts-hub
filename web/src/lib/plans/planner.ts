import { createHash } from "node:crypto";
import { PLANNER_URL } from "../links";

/**
 * The planner instance plans are drawn in. In dev that's the local planner
 * (pushes from there go to its dev store); replay links keep using PLANNER_URL.
 */
export const PLANS_PLANNER_URL =
  process.env.PLANNER_PLANS_URL ?? (process.env.NODE_ENV === "production" ? PLANNER_URL : "http://localhost:3000");

export interface PlanVersion {
  code: string;
  createdAt: string;
}

/** What the planner stores pushes under: SHA-256 of the plan key (planner lib/planLineage.ts). */
const lineageOf = (key: string) => createHash("sha256").update(key).digest("hex");

/** Pushed versions per plan key, newest first. A planner that's down reads as "no versions yet". */
export async function fetchVersions(keys: string[]): Promise<Map<string, PlanVersion[]>> {
  const out = new Map<string, PlanVersion[]>();
  if (keys.length === 0) return out;
  const byHash = new Map(keys.map((k) => [lineageOf(k), k]));
  try {
    const res = await fetch(`${PLANS_PLANNER_URL}/api/plans?lineage=${[...byHash.keys()].join(",")}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { lineages } = (await res.json()) as { lineages: Record<string, PlanVersion[]> };
    for (const [hash, versions] of Object.entries(lineages)) {
      const key = byHash.get(hash);
      if (key) out.set(key, versions);
    }
  } catch (err) {
    console.error("[ts-hub] planner versions:", err);
  }
  return out;
}

/** A pushed plan's map (pushes carry `mapKey` since the hub hand-off); null when there's no such plan. */
export async function fetchPlan(code: string): Promise<{ mapKey?: string } | null> {
  try {
    const res = await fetch(`${PLANS_PLANNER_URL}/api/plans/${encodeURIComponent(code)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const { mapKey } = (await res.json()) as { mapKey?: unknown };
    return typeof mapKey === "string" ? { mapKey } : {};
  } catch {
    return null;
  }
}

/** The planner's read-only view of a plan (planner app/embed): the plan over the mission's Markers.layer, pan and zoom only. */
export function plannerEmbedUrl(p: { missionId: string; mapKey: string; code: string }): string {
  const q = new URLSearchParams({ plan: p.code, map: p.mapKey, mission: p.missionId });
  return `${PLANS_PLANNER_URL}/embed?${q.toString()}`;
}

/** Planner hand-off link (planner lib/hubLink.ts). Without `key` it opens view-only. */
export function plannerLink(p: { missionId: string; code?: string | null; key?: string | null; eventId?: string | null }): string {
  const q = new URLSearchParams({ mission: p.missionId });
  if (p.code) q.set("plan", p.code);
  if (p.key) q.set("key", p.key);
  if (p.eventId) q.set("event", p.eventId);
  return `${PLANS_PLANNER_URL}/?${q.toString()}`;
}
