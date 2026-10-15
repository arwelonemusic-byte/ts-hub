import { readFile, stat } from "node:fs/promises";
import { NextResponse } from "next/server";
import { gameFile } from "@/lib/fix-and-flank/files";
import { siteUrl } from "@/lib/site";
import { getViewer } from "@/lib/viewer";

/**
 * The game itself (games/fix-and-flank in the repo): its pages at /games/fix-and-flank/play, /editor and
 * /preview, and the files they load. Playing and making maps is for members of the Discord (user decision
 * 2026-10-15): signed out goes to the login, signed in but not a member back to the game's page.
 * Files change with a deploy, so they're revalidated (ETag) rather than cached for a time.
 */
export async function GET(request: Request, ctx: RouteContext<"/games/fix-and-flank/[...path]">) {
  const { path: parts } = await ctx.params;
  const found = await gameFile(parts);
  if (!found) return new Response("Not found", { status: 404 });
  if (found.members) {
    const viewer = await getViewer();
    if (!viewer) return NextResponse.redirect(siteUrl("/api/auth/login", request));
    if (!viewer.inGuild) return NextResponse.redirect(siteUrl("/games/fix-and-flank?members=1", request));
  }
  try {
    const info = await stat(found.file);
    const etag = `"${info.size.toString(36)}-${Math.floor(info.mtimeMs).toString(36)}"`;
    const headers = { "Content-Type": found.type, "Cache-Control": "no-cache", ETag: etag };
    if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
    return new Response(await readFile(found.file), { headers });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
