import type { NextRequest } from "next/server";
import { getHubData } from "@/lib/data";
import { newMissionPlan, resolvePlans } from "@/lib/plans";
import { plannerLink } from "@/lib/plans/planner";
import { getPlanRecord, type PlanRecord } from "@/lib/plans/store";
import { getViewer } from "@/lib/viewer";

/**
 * Every «open in the planner» goes through here, so the plan key only goes to
 * people who may push to that plan:
 *   GET  ?event=<id>             draw a plan for the game: its mission's map and Markers.layer,
 *                                no hub plan (the code gets pasted back with «Прикрепить план»)
 *   GET  ?plan=<id>              open a hub plan — editable if it's yours
 *   GET  ?mission=<id>&code=<c>  view a code that has no hub plan (a played game's)
 *   POST mission=<id>            start a new plan of your own for the mission
 * GETs come from plain links opening a new tab and are idempotent (a repeat click lands on
 * the same plan); starting a new plan is a form POST, so reloads and prefetches can't.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const now = new Date();
  const data = getHubData();
  const viewer = await getViewer();
  const back = (path: string) => Response.redirect(new URL(path, req.url), 303);
  const latest = async (rec: PlanRecord) => (await resolvePlans([rec]))[0]?.code ?? null;

  const eventId = sp.get("event");
  if (eventId) {
    const ev = await data.getEvent(eventId, now);
    if (!ev) return back("/events");
    if (!viewer) return back("/api/auth/login");
    return Response.redirect(plannerLink({ missionId: ev.mission.id, eventId: ev.id }), 303);
  }

  const planId = sp.get("plan");
  if (planId) {
    const rec = await getPlanRecord(planId);
    if (!rec) return back("/missions");
    const editable = !!viewer && rec.authorId === viewer.discordId;
    return Response.redirect(
      plannerLink({ missionId: rec.missionId, code: await latest(rec), key: editable ? rec.key : null, eventId: rec.eventId }),
      303,
    );
  }

  const missionId = sp.get("mission");
  const mission = missionId ? await data.getMission(missionId) : null;
  if (!mission) return back("/missions");
  const code = sp.get("code");
  return code ? Response.redirect(plannerLink({ missionId: mission.id, code }), 303) : back(`/missions/${mission.id}`);
}

export async function POST(req: NextRequest) {
  const back = (path: string) => Response.redirect(new URL(path, req.url), 303);
  const form = await req.formData();
  const mission = await getHubData().getMission(String(form.get("mission") ?? ""));
  if (!mission) return back("/missions");
  const viewer = await getViewer();
  if (!viewer) return back("/api/auth/login");
  if (mission.planning === false) return back(`/missions/${mission.id}`);
  const rec = await newMissionPlan(viewer, mission.id);
  return Response.redirect(plannerLink({ missionId: mission.id, key: rec.key }), 303);
}
