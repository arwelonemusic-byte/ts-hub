import { cancelJob, jobStatus } from "@/lib/mods/jobs";
import { getViewer } from "@/lib/viewer";

const noStore = { "Cache-Control": "no-store" };

/** A «Скачать мод» job's status, polled by the dialog. Its member only. */
export async function GET(_req: Request, ctx: RouteContext<"/api/mods/jobs/[id]">) {
  const viewer = await getViewer();
  if (!viewer?.inGuild) return Response.json({ error: "forbidden" }, { status: 403 });
  const status = jobStatus((await ctx.params).id, viewer.discordId);
  if (!status) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(status, { headers: noStore });
}

/** Leaves the queue, or cancels the download (the server is stopped; what it got stays for next time). */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/mods/jobs/[id]">) {
  const viewer = await getViewer();
  if (!viewer?.inGuild) return Response.json({ error: "forbidden" }, { status: 403 });
  const status = cancelJob((await ctx.params).id, viewer.discordId, viewer.isAdmin);
  if (!status) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(status, { headers: noStore });
}
