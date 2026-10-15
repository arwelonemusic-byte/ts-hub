import { answer, asMember, badRequest, jsonBody } from "@/lib/fix-and-flank/api";
import { startRun } from "@/lib/fix-and-flank/runs";

/** A run starts on a published map: { mapId } → { id, seed }. The game plays with the hub's seed. */
export async function POST(request: Request) {
  const me = await asMember();
  if (me instanceof Response) return me;
  const body = await jsonBody(request);
  if (!body) return badRequest();
  return answer(await startRun(me.playerId, body.mapId));
}
