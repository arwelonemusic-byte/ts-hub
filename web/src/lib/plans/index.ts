import type { PlanRef, UpcomingEvent } from "../types";
import type { Viewer } from "../viewer";
import { fetchVersions, type PlanVersion } from "./planner";
import { insertPlanRecord, listPlanRecords, newPlanRecord, type PlanRecord } from "./store";

/*
 * Two kinds of plan:
 * - a game's plan: a planner code someone pastes on the game's page («Прикрепить план»,
 *   lib/plans/actions.ts, stored on the event). The page only shows that one. Whoever
 *   attached it can swap in a newer code; an admin can detach it. What the game really
 *   used comes from its replay (the /syncplan stamp), not from here;
 * - a mission plan: «Нарисовать план» on a mission page starts a new hub plan of the
 *   author's (a PL often tries a different approach on a rerun, so a player can have
 *   several). Pushes made from it are its versions; each supersedes the last.
 */

function toRef(r: PlanRecord, versions: PlanVersion[]): PlanRef | null {
  const vs = r.eventStartsAt ? versions.filter((v) => v.createdAt <= r.eventStartsAt!) : versions;
  const event = r.eventId && r.eventStartsAt ? { id: r.eventId, startsAt: r.eventStartsAt } : undefined;
  if (vs.length) return { id: r.id, code: vs[0].code, author: r.authorName, authorId: r.authorId, createdAt: vs[0].createdAt, pushed: true, event };
  if (r.seed) return { id: r.id, code: r.seed.code, author: r.seed.author, createdAt: r.seed.createdAt, pushed: false, event };
  return null;
}

/** The version to show for each record; null until it has one. */
export async function resolvePlans(records: PlanRecord[]): Promise<(PlanRef | null)[]> {
  const versions = await fetchVersions(records.map((r) => r.key));
  return records.map((r) => toRef(r, versions.get(r.key) ?? []));
}

/**
 * A mission's plans, newest first: hub plans plus codes known only from its played
 * games. A game plan nobody has pushed to yet only points at another plan's version,
 * so that plan's row stands for it.
 */
export async function missionPlans(missionId: string, fromGames: PlanRef[]): Promise<PlanRef[]> {
  const records = await listPlanRecords({ missionId });
  const refs = (await resolvePlans(records)).filter((p): p is PlanRef => !!p);
  const out: PlanRef[] = [];
  const seen = new Set<string>();
  const add = (list: PlanRef[]) => {
    for (const p of list) {
      if (seen.has(p.code)) continue;
      seen.add(p.code);
      out.push(p);
    }
  };
  add(refs.filter((p) => p.pushed));
  add(fromGames);
  add(refs.filter((p) => !p.pushed));
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Anyone signed in can attach a plan to a game that has none; whoever attached it can replace it. */
export function canAttachPlan(viewer: Viewer | null, ev: UpcomingEvent): boolean {
  if (!viewer) return false;
  return !ev.plan || (!!ev.plan.authorId && ev.plan.authorId === viewer.discordId);
}

/** Detaching someone's plan is for admins. */
export function canDetachPlan(viewer: Viewer | null, ev: UpcomingEvent): boolean {
  return !!viewer?.isAdmin && !!ev.plan;
}

/** «Нарисовать план» on a mission always starts a new plan; an existing one is continued from its row. */
export function newMissionPlan(viewer: Viewer, missionId: string): Promise<PlanRecord> {
  return insertPlanRecord(newPlanRecord({ missionId, eventId: null, eventStartsAt: null, authorId: viewer.discordId, authorName: viewer.name, seed: null }));
}
