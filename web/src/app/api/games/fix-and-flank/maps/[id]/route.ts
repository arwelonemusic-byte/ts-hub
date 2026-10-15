import { getFixAndFlankData } from "@/lib/data";
import { getViewer } from "@/lib/viewer";

/** A map in the game's file format, for the game (play?src=) and the turning preview. A draft only for its author. */
export async function GET(_req: Request, ctx: RouteContext<"/api/games/fix-and-flank/maps/[id]">) {
  const { id } = await ctx.params;
  const viewer = await getViewer();
  const json = await getFixAndFlankData().getMapJson(id, viewer?.name ?? null);
  if (!json) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(json, { headers: { "Cache-Control": "no-cache" } });
}
