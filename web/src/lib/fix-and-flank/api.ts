import { playerIdOf } from "@/lib/players";
import { getViewer, type Viewer } from "@/lib/viewer";
import { makeT } from "@/lib/i18n";
import type { Outcome } from "./maps";

const t = makeT("ru"); // the game reads these, and the game is Russian only

/**
 * The editor's calls (app/api/games/fix-and-flank/maps): members of the Discord only, each as their players row.
 * Errors are JSON { error }, in Russian like the game (fnf.err.* in lib/i18n.ts).
 */
export async function asMember(): Promise<{ viewer: Viewer; playerId: string } | Response> {
  const viewer = await getViewer();
  if (!viewer) return Response.json({ error: t("fnf.err.signIn") }, { status: 401 });
  if (!viewer.inGuild) return Response.json({ error: t("fnf.err.members") }, { status: 403 });
  const playerId = await playerIdOf(viewer);
  if (!playerId) return Response.json({ error: t("fnf.err.devStandIn") }, { status: 403 });
  return { viewer, playerId };
}

/** The editor sends JSON; a cross-site form can't, so this also keeps other sites from writing here. */
export async function jsonBody(request: Request): Promise<Record<string, unknown> | null> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) return null;
  const body = await request.json().catch(() => null);
  return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
}

export const answer = <T,>(out: Outcome<T>) =>
  "error" in out ? Response.json({ error: out.error }, { status: out.status }) : Response.json(out.ok);

export const badRequest = () => Response.json({ error: t("fnf.err.json") }, { status: 400 });
