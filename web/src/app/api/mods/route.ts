import { workshopGuid } from "@/lib/missions/workshop";
import { requestMod } from "@/lib/mods/jobs";
import { modsEnabled } from "@/lib/mods/mirror";
import { getViewer } from "@/lib/viewer";

/**
 * «Скачать мод» (the server pill): starts, or joins, getting the mod behind a Workshop link onto the box, and
 * answers its status (lib/mods/jobs.ts). Members of the Discord only.
 */
export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer?.inGuild) return Response.json({ error: "forbidden" }, { status: 403 });
  if (!modsEnabled()) return Response.json({ error: "disabled" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { link?: unknown } | null;
  const guid = typeof body?.link === "string" ? workshopGuid(body.link) : null;
  if (!guid) return Response.json({ error: "badLink" }, { status: 400 });
  return Response.json(requestMod(guid), { headers: { "Cache-Control": "no-store" } });
}
