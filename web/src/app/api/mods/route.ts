import { workshopGuid } from "@/lib/missions/workshop";
import { lookupMod } from "@/lib/mods/jobs";
import { modsEnabled } from "@/lib/mods/mirror";
import { getViewer } from "@/lib/viewer";

/**
 * «Скачать мод» (the server pill): the mod behind a Workshop link and its dependencies, with where the box stands
 * with each, for the member to choose from before anything is downloaded (lib/mods/jobs.ts). Members only.
 */
export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer?.inGuild) return Response.json({ error: "forbidden" }, { status: 403 });
  if (!modsEnabled()) return Response.json({ error: "disabled" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { link?: unknown } | null;
  const guid = typeof body?.link === "string" ? workshopGuid(body.link) : null;
  if (!guid) return Response.json({ error: "badLink" }, { status: 400 });
  const choice = await lookupMod(guid);
  if (typeof choice === "string") return Response.json({ error: choice }, { status: choice === "notFound" ? 404 : 502 });
  return Response.json(choice, { headers: { "Cache-Control": "no-store" } });
}
