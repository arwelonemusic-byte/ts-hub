import { asMember, badRequest, jsonBody } from "@/lib/fix-and-flank/api";
import { addMapComment } from "@/lib/fix-and-flank/comments";
import { FNF_COMMENT_MAX } from "@/lib/fix-and-flank/game";
import { format, makeT } from "@/lib/i18n";

const t = makeT("ru"); // the game reads these, and the game is Russian only

/**
 * A comment on a published map from the game's debrief («Оставить комментарий», user request 2026-10-15):
 * { body } → { id }. Members only, the same rules as the map page's «Комментарии».
 */
export async function POST(request: Request, ctx: RouteContext<"/api/games/fix-and-flank/maps/[id]/comments">) {
  const { id } = await ctx.params;
  const me = await asMember();
  if (me instanceof Response) return me;
  const body = await jsonBody(request);
  if (!body) return badRequest();
  const out = await addMapComment(id, me.playerId, String(body.body ?? ""));
  if ("error" in out) {
    return Response.json(
      { error: format(t(`fnf.comments.error.${out.error}`), { max: FNF_COMMENT_MAX }) },
      { status: out.error === "gone" ? 404 : 400 },
    );
  }
  return Response.json(out);
}
