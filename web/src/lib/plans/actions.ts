"use server";

import { revalidatePath } from "next/cache";
import { getHubData } from "../data";
import { getDb } from "../db";
import { announcePlan, refreshAnnouncement } from "../discord/post";
import { playerIdOf } from "../players";
import { getViewer } from "../viewer";
import { canAttachPlan, canDetachPlan } from "./index";
import { fetchPlan } from "./planner";
import { getPlanRecord, hidePlanRecord, insertPlanRecord, newPlanRecord } from "./store";

export type AttachState = { error: "invalid" | "notFound" | "wrongMap" | "forbidden" | "taken"; code?: string } | null;

/** The code alone, or the "/syncplan ABCDEF" line the planner copies after a push. */
const planCode = (v: FormDataEntryValue | null) => String(v ?? "").trim().replace(/^\/?syncplan\s+/i, "").toUpperCase();
const CODE = /^[A-Z0-9]{6}$/;

/** «Прикрепить план»: a planner code becomes the game's plan (or replaces the one the viewer attached). */
export async function attachPlan(_prev: AttachState, form: FormData): Promise<AttachState> {
  const [viewer, ev] = await Promise.all([getViewer(), getHubData().getEvent(String(form.get("event") ?? ""), new Date())]);
  if (!viewer || !ev || ev.status !== "upcoming" || !canAttachPlan(viewer, ev)) return { error: "forbidden" };

  const code = planCode(form.get("code"));
  if (!CODE.test(code)) return { error: "invalid", code };
  const plan = await fetchPlan(code);
  if (!plan) return { error: "notFound", code };
  // Pushes made since the hub hand-off say which map they were drawn on.
  if (plan.mapKey && plan.mapKey !== ev.mission.mapKey) return { error: "wrongMap", code };

  const player = await playerIdOf(viewer);
  const db = await getDb();
  // Someone may have attached a plan since the page loaded: only an empty slot or your own plan.
  const hit = await db.query(
    `UPDATE events SET plan_code = $2, plan_attached_by = $3, plan_attached_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND status = 'scheduled' AND (plan_code IS NULL OR plan_attached_by = $3)
     RETURNING id`,
    [ev.id, code, player],
  );
  if (!hit.length) return { error: "taken", code };
  refreshAnnouncement(ev.id);
  // A new plan (not the same code pasted again) gets a message in the thread under the game's Discord post.
  if (ev.plan?.code !== code) announcePlan(ev.id, code);
  revalidatePath(`/events/${ev.id}`);
  return null;
}

/** An admin takes the plan off a game, so someone else can attach theirs. */
export async function detachPlan(form: FormData): Promise<void> {
  const [viewer, ev] = await Promise.all([getViewer(), getHubData().getEvent(String(form.get("event") ?? ""), new Date())]);
  if (!ev || ev.status !== "upcoming" || !canDetachPlan(viewer, ev)) return;
  const db = await getDb();
  await db.query(
    `UPDATE events SET plan_code = NULL, plan_attached_by = NULL, plan_attached_at = NULL, updated_at = NOW()
     WHERE id = $1 AND status = 'scheduled'`,
    [ev.id],
  );
  refreshAnnouncement(ev.id);
  revalidatePath(`/events/${ev.id}`);
}

export type AddPlanState = {
  error: "invalid" | "notFound" | "wrongMap" | "forbidden" | "noAuthor" | "duplicate";
  code?: string;
  author?: string;
} | null;

/**
 * «Добавить план» (admin) on a mission page: a plan drawn outside the hub, by code, credited to the member who drew
 * it (user request 2026-11-18). It becomes a hub plan of theirs with the code as its seed, dated the day it's added
 * (the planner keeps no date for a code), so the author continues it from its row like one they started here.
 */
export async function addMissionPlan(_prev: AddPlanState, form: FormData): Promise<AddPlanState> {
  const code = planCode(form.get("code"));
  const author = String(form.get("author") ?? "");
  const [viewer, mission] = await Promise.all([getViewer(), getHubData().getMission(String(form.get("mission") ?? ""))]);
  if (!viewer?.isEventAdmin || !mission || mission.training) return { error: "forbidden", code, author };
  if (!CODE.test(code)) return { error: "invalid", code, author };

  const db = await getDb();
  const [member] = /^\d+$/.test(author)
    ? ((await db.query("SELECT discord_id, display_name FROM players WHERE id = $1 AND discord_id IS NOT NULL", [author])) as {
        discord_id: string;
        display_name: string;
      }[])
    : [];
  if (!member) return { error: "noAuthor", code, author };

  const plan = await fetchPlan(code);
  if (!plan) return { error: "notFound", code, author };
  if (plan.mapKey && plan.mapKey !== mission.mapKey) return { error: "wrongMap", code, author };
  // The page lists each code once (a played game's plan, the newest push of a hub plan), so a second row would never show.
  const { plans } = await getHubData().getMissionHistory(mission.id);
  if (plans.some((p) => p.code === code)) return { error: "duplicate", code, author };

  await insertPlanRecord(
    newPlanRecord({
      missionId: mission.id,
      eventId: null,
      eventStartsAt: null,
      authorId: member.discord_id,
      authorName: member.display_name,
      seed: { code, author: member.display_name, createdAt: new Date().toISOString() },
    }),
  );
  revalidatePath(`/missions/${mission.id}`);
  return null;
}

/**
 * «Удалить план» (admin) on a mission page: a plan drawn from it (junk, vandalism) leaves the page. Only
 * hidden (`plans.hidden_at`): the row stays in the database (user decision 2026-10-09). Plans of played
 * games aren't hub records and stay: they're what the game used.
 */
export async function deleteMissionPlan(form: FormData): Promise<void> {
  const viewer = await getViewer();
  const plan = await getPlanRecord(String(form.get("plan") ?? ""));
  if (!viewer?.isAdmin || !plan) return;
  await hidePlanRecord(plan.id, await playerIdOf(viewer));
  revalidatePath(`/missions/${plan.missionId}`);
}
