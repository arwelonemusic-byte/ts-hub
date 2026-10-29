import { modStatus } from "@/lib/mods/jobs";
import { getViewer } from "@/lib/viewer";

/** A «Скачать мод» job's status, polled by the dialog. Members of the Discord only. */
export async function GET(_req: Request, ctx: RouteContext<"/api/mods/[guid]">) {
  const viewer = await getViewer();
  if (!viewer?.inGuild) return Response.json({ error: "forbidden" }, { status: 403 });
  const { guid } = await ctx.params;
  const status = modStatus(guid.toUpperCase());
  if (!status) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(status, { headers: { "Cache-Control": "no-store" } });
}
