import { getFixAndFlankData } from "@/lib/data";
import { answer, asMember, badRequest, jsonBody } from "@/lib/fix-and-flank/api";
import { deleteDraft, saveDraft } from "@/lib/fix-and-flank/maps";
import { makeT } from "@/lib/i18n";
import { playerIdOf } from "@/lib/players";
import { getViewer } from "@/lib/viewer";

/** A map in the game's file format, for the game (play?src=), the editor and the turning preview. A draft only for its author. */
export async function GET(_req: Request, ctx: RouteContext<"/api/games/fix-and-flank/maps/[id]">) {
  const { id } = await ctx.params;
  const viewer = await getViewer();
  const playerId = viewer ? await playerIdOf(viewer) : null;
  const map = await getFixAndFlankData().getMapJson(id, playerId);
  if (!map) return Response.json({ error: makeT("ru")("fnf.err.mapNotFound") }, { status: 404 });
  return Response.json(map, { headers: { "Cache-Control": "no-cache" } });
}

/** Save a draft: { name, json, thumb? }. A published map can't be changed (409). */
export async function PUT(request: Request, ctx: RouteContext<"/api/games/fix-and-flank/maps/[id]">) {
  const { id } = await ctx.params;
  const me = await asMember();
  if (me instanceof Response) return me;
  const body = await jsonBody(request);
  if (!body) return badRequest();
  return answer(await saveDraft(id, me.playerId, body));
}

/** Delete a draft (a published map stays). */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/games/fix-and-flank/maps/[id]">) {
  const { id } = await ctx.params;
  const me = await asMember();
  if (me instanceof Response) return me;
  return answer(await deleteDraft(id, me.playerId));
}
