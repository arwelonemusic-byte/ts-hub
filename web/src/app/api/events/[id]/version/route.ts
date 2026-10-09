import { getHubData } from "@/lib/data";

/** The game's fingerprint (slots, attached plan) for LiveRefresh on its page. */
export async function GET(_req: Request, ctx: RouteContext<"/api/events/[id]/version">) {
  const { id } = await ctx.params;
  const version = await getHubData().getEventVersion(id);
  if (!version) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ version }, { headers: { "Cache-Control": "no-store" } });
}
