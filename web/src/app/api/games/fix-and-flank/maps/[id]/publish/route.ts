import { answer, asMember, badRequest, jsonBody } from "@/lib/fix-and-flank/api";
import { publishMap } from "@/lib/fix-and-flank/maps";

/** Publish a draft: { name, json, thumb } saved one last time, ready to play, then locked for good. → { id } */
export async function POST(request: Request, ctx: RouteContext<"/api/games/fix-and-flank/maps/[id]/publish">) {
  const { id } = await ctx.params;
  const me = await asMember();
  if (me instanceof Response) return me;
  const body = await jsonBody(request);
  if (!body) return badRequest();
  return answer(await publishMap(id, me.playerId, body));
}
