import type { NextRequest } from "next/server";
import { getHubData } from "@/lib/data";
import { PLANS_PLANNER_URL } from "@/lib/plans/planner";

/** Read by the planner page itself (cross-origin), so only the planner may read it from a browser. */
const cors = { "Access-Control-Allow-Origin": new URL(PLANS_PLANNER_URL).origin, Vary: "Origin" };

/**
 * What the planner needs to open a mission (planner lib/hubLink.ts):
 * `{ id, name, mapKey, layer }`, `layer` being the Markers.layer text or null.
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/missions/[id]/planner">) {
  const { id } = await ctx.params;
  const data = getHubData();
  const mission = await data.getMission(id);
  if (!mission) return Response.json({ error: "Not found" }, { status: 404, headers: cors });
  const layer = mission.hasMarkersLayer ? await data.getMarkersLayer(mission.id) : null;
  return Response.json({ id: mission.id, name: mission.name, mapKey: mission.mapKey, layer }, { headers: cors });
}
