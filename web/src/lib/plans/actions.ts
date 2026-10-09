"use server";

import { revalidatePath } from "next/cache";
import { getHubData } from "../data";
import { getViewer } from "../viewer";
import { canEditEventPlan, resolvePlans, setEventPlan } from "./index";
import { planExists } from "./planner";
import { getPlanRecord } from "./store";

export type AttachState = { error: "invalid" | "notFound" | "forbidden"; code?: string } | null;

/**
 * Make a plan game `event`'s plan: a listed hub plan (`plan` = its id) or a code
 * (`code`, typed in or a played game's). The game's plan then starts from that version.
 */
export async function attachPlan(_prev: AttachState, form: FormData): Promise<AttachState> {
  const data = getHubData();
  const [viewer, ev] = await Promise.all([getViewer(), data.getEvent(String(form.get("event") ?? ""), new Date())]);
  if (!viewer || !ev || ev.status !== "upcoming" || !canEditEventPlan(viewer, ev)) return { error: "forbidden" };

  const planId = form.get("plan");
  let seed: { code: string; author: string; createdAt: string };
  if (typeof planId === "string" && planId) {
    const rec = await getPlanRecord(planId);
    const ref = rec?.missionId === ev.mission.id ? (await resolvePlans([rec]))[0] : null;
    if (!ref) return { error: "notFound" };
    seed = { code: ref.code, author: ref.author, createdAt: ref.createdAt };
  } else {
    const code = String(form.get("code") ?? "").trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) return { error: "invalid", code };
    if (!(await planExists(code))) return { error: "notFound", code };
    // A code the mission already lists keeps its author; one from elsewhere counts as the PL's own.
    const known = (await data.getMissionHistory(ev.mission.id)).plans.find((p) => p.code === code);
    seed = { code, author: known?.author ?? viewer.name, createdAt: known?.createdAt ?? new Date().toISOString() };
  }
  await setEventPlan(viewer, ev, seed);
  revalidatePath(`/events/${ev.id}`);
  return null;
}
