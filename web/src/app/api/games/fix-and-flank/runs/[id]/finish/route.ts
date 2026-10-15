import { answer, asMember, badRequest, jsonBody } from "@/lib/fix-and-flank/api";
import { finishRun } from "@/lib/fix-and-flank/runs";

/** A run ends: { commits } (BLUFOR's orders) → the hub plays them through and answers { result, turns, record, personalBest }. */
export async function POST(request: Request, ctx: RouteContext<"/api/games/fix-and-flank/runs/[id]/finish">) {
  const { id } = await ctx.params;
  const me = await asMember();
  if (me instanceof Response) return me;
  const body = await jsonBody(request);
  if (!body) return badRequest();
  return answer(await finishRun(id, me.playerId, body.commits));
}
