import { fitLimits, postGame } from "@/lib/discord/post";
import { renderGamePost } from "@/lib/discord/template";

/**
 * Dev only: `/api/dev/discord-post/<game id>` returns the Discord message the game's announcement would be
 * (lib/discord/template.ts), without sending anything. Paste its JSON into a webhook previewer such as
 * discohook.app to see it rendered.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/dev/discord-post/[id]">) {
  if (process.env.NODE_ENV !== "development") return new Response("Not found", { status: 404 });
  const { id } = await ctx.params;
  const game = await postGame(id);
  if (!game) return Response.json({ error: "no such game" }, { status: 404 });
  return Response.json({ game, message: fitLimits(renderGamePost(game)) });
}
