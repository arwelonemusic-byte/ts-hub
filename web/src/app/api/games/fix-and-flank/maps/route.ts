import { answer, asMember, badRequest, jsonBody } from "@/lib/fix-and-flank/api";
import { createDraft, listMine } from "@/lib/fix-and-flank/maps";
import { makeT } from "@/lib/i18n";

/** The viewer's own maps (?mine=1), for the editor's Maps menu. The editor also asks this to know the hub is there. */
export async function GET(request: Request) {
  if (new URL(request.url).searchParams.get("mine") !== "1") return Response.json({ error: makeT("ru")("fnf.err.mineOnly") }, { status: 400 });
  const me = await asMember();
  if (me instanceof Response) return me;
  return Response.json({ name: me.viewer.name, maps: await listMine(me.playerId) }, { headers: { "Cache-Control": "no-store" } });
}

/** A new draft: { name, json, thumb? } → { id }. */
export async function POST(request: Request) {
  const me = await asMember();
  if (me instanceof Response) return me;
  const body = await jsonBody(request);
  if (!body) return badRequest();
  return answer(await createDraft(me.playerId, body));
}
