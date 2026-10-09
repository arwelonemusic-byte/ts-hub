"use server";

import { revalidatePath } from "next/cache";
import { getHubData } from "../data";
import { getDb } from "../db";
import { playerIdOf } from "../players";
import { getViewer } from "../viewer";
import { canAttachPlan, canDetachPlan } from "./index";
import { fetchPlan } from "./planner";

export type AttachState = { error: "invalid" | "notFound" | "wrongMap" | "forbidden" | "taken"; code?: string } | null;

/** «Прикрепить план»: a planner code becomes the game's plan (or replaces the one the viewer attached). */
export async function attachPlan(_prev: AttachState, form: FormData): Promise<AttachState> {
  const [viewer, ev] = await Promise.all([getViewer(), getHubData().getEvent(String(form.get("event") ?? ""), new Date())]);
  if (!viewer || !ev || ev.status !== "upcoming" || !canAttachPlan(viewer, ev)) return { error: "forbidden" };

  const code = String(form.get("code") ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) return { error: "invalid", code };
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
  revalidatePath(`/events/${ev.id}`);
}
