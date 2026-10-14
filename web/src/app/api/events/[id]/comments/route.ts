import { getComments } from "@/lib/discord/comments";
import { getViewer } from "@/lib/viewer";

/** The version of the game's comments (its Discord thread), for the comments section's polling. Members only. */
export async function GET(_req: Request, ctx: RouteContext<"/api/events/[id]/comments">) {
  const viewer = await getViewer();
  if (!viewer?.inGuild) return Response.json({ error: "forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const comments = await getComments(id);
  const version = comments.status === "ok" ? comments.version : comments.status;
  return Response.json({ version }, { headers: { "Cache-Control": "no-store" } });
}
