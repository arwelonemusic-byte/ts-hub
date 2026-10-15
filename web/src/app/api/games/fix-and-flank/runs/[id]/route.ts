import { getRun } from "@/lib/fix-and-flank/runs";

/** A finished run, for «Повтор»: the map, the seed and BLUFOR's orders; the game plays the rest again. */
export async function GET(_req: Request, ctx: RouteContext<"/api/games/fix-and-flank/runs/[id]">) {
  const { id } = await ctx.params;
  const run = await getRun(id);
  if (!run) return Response.json({ error: "No such run." }, { status: 404 });
  return Response.json(run, { headers: { "Cache-Control": "no-cache" } });
}
