import type { PlanRef, UpcomingEvent } from "../types";
import type { Viewer } from "../viewer";
import { fetchVersions, type PlanVersion } from "./planner";
import { insertPlanRecord, listPlanRecords, newPlanRecord, replaceEventPlan, type PlanRecord } from "./store";

/*
 * Where a plan is started decides what it is:
 * - from a game's page (its PL, host or an admin): that game's plan. Every push
 *   becomes «План» for the game, until the game starts;
 * - from a mission page: a new plan of the author's for the mission (a PL often
 *   tries a different approach on a rerun, so a player can have several). It's
 *   listed on the mission and offered on its upcoming games, where the PL can
 *   «Использовать» it — which starts the game's plan from that version, so later
 *   pushes on either side don't touch the other.
 * A plan has no version history: each push supersedes the last.
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

/** Each upcoming game's own plan, by event id. */
export async function eventPlans(events: UpcomingEvent[]): Promise<Map<string, PlanRef>> {
  const records = await listPlanRecords({ eventIds: events.map((e) => e.id) });
  const refs = await resolvePlans(records);
  const out = new Map<string, PlanRef>();
  records.forEach((r, i) => {
    if (refs[i]) out.set(r.eventId!, refs[i]!);
  });
  return out;
}

/** The PL (or host, or an admin) can set and draw a game's plan until it starts. */
export function canEditEventPlan(viewer: Viewer | null, ev: UpcomingEvent, now = new Date()): boolean {
  if (!viewer || new Date(ev.startsAt) <= now) return false;
  return viewer.isAdmin || ev.platoonLeader === viewer.name || ev.hostName === viewer.name;
}

export async function findEventPlan(eventId: string): Promise<PlanRecord | null> {
  return (await listPlanRecords({ eventIds: [eventId] }))[0] ?? null;
}

export async function openEventPlan(viewer: Viewer, ev: UpcomingEvent): Promise<PlanRecord> {
  return (
    (await findEventPlan(ev.id)) ??
    insertPlanRecord(
      newPlanRecord({
        missionId: ev.mission.id,
        eventId: ev.id,
        eventStartsAt: ev.startsAt,
        authorId: viewer.discordId,
        authorName: viewer.name,
        seed: null,
      }),
    )
  );
}

/** «Нарисовать план» on a mission always starts a new plan; an existing one is continued from its row. */
export function newMissionPlan(viewer: Viewer, missionId: string): Promise<PlanRecord> {
  return insertPlanRecord(newPlanRecord({ missionId, eventId: null, eventStartsAt: null, authorId: viewer.discordId, authorName: viewer.name, seed: null }));
}

/**
 * «Использовать»: the game's plan restarts from `seed`. A replaced game plan the
 * PL already pushed to stays on as their mission plan; an untouched one is dropped.
 */
export async function setEventPlan(viewer: Viewer, ev: UpcomingEvent, seed: NonNullable<PlanRecord["seed"]>): Promise<void> {
  const old = await findEventPlan(ev.id);
  const oldPushed = old ? ((await fetchVersions([old.key])).get(old.key)?.length ?? 0) > 0 : false;
  const rec = newPlanRecord({
    missionId: ev.mission.id,
    eventId: ev.id,
    eventStartsAt: ev.startsAt,
    authorId: viewer.discordId,
    authorName: viewer.name,
    seed,
  });
  await replaceEventPlan(old ? { id: old.id, keepOld: oldPushed } : null, rec);
}
