import { GUID_RE } from "@/lib/missions/draft";
import { memberJob, startJob } from "@/lib/mods/jobs";
import { modsEnabled } from "@/lib/mods/mirror";
import { getViewer } from "@/lib/viewer";

const noStore = { "Cache-Control": "no-store" };

/** The member's «Скачать мод» job (the dialog picks it up again after a reload), or `{ job: null }`. */
export async function GET() {
  const viewer = await getViewer();
  if (!viewer?.inGuild) return Response.json({ error: "forbidden" }, { status: 403 });
  return Response.json({ job: memberJob(viewer.discordId) }, { headers: noStore });
}

/** Queues getting a mod onto the box without the dependencies in `skip`: `{ guid, skip }`. One job per member at a time. */
export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer?.inGuild) return Response.json({ error: "forbidden" }, { status: 403 });
  if (!modsEnabled()) return Response.json({ error: "disabled" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { guid?: unknown; skip?: unknown } | null;
  const guid = typeof body?.guid === "string" ? body.guid.toUpperCase() : "";
  if (!GUID_RE.test(guid)) return Response.json({ error: "badLink" }, { status: 400 });
  const skip = Array.isArray(body?.skip) ? body.skip.filter((s): s is string => typeof s === "string").map((s) => s.toUpperCase()).filter((s) => GUID_RE.test(s)) : [];
  const result = startJob(viewer.discordId, guid, skip);
  return Response.json(result, { status: "error" in result ? 409 : 200, headers: noStore });
}
