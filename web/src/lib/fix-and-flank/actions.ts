"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { playerIdOf } from "@/lib/players";
import { getViewer } from "@/lib/viewer";
import { FNF_COMMENT_MAX, mapPageUrl } from "./game";

/**
 * «Комментарии» on a Fix & Flank map (user request 2026-10-15): the hub's own (fnf_comments), not a Discord thread.
 * Members of the Discord write; a comment is taken down by its author or an admin (deleted_at; the row stays).
 */

/** What the comment box shows after a send (components/event/CommentForm): an error keeps the text. */
export type MapCommentState = { error: "empty" | "tooLong" | "forbidden" | "gone"; text: string } | null;

export async function postMapComment(_prev: MapCommentState, form: FormData): Promise<MapCommentState> {
  const mapId = String(form.get("map") ?? "");
  const text = String(form.get("text") ?? "").replace(/\r\n?/g, "\n").trim(); // forms send new lines as CRLF
  const viewer = await getViewer();
  const playerId = viewer?.inGuild ? await playerIdOf(viewer) : null;
  if (!playerId) return { error: "forbidden", text };
  if (!text) return { error: "empty", text };
  if (text.length > FNF_COMMENT_MAX) return { error: "tooLong", text };
  const db = await getDb();
  // Only on a published map that's up: a draft is its author's alone.
  const rows = await db.query(
    `INSERT INTO fnf_comments (map_id, player_id, body)
     SELECT id, $2, $3 FROM fnf_maps WHERE id = $1 AND published_at IS NOT NULL AND hidden_at IS NULL RETURNING id`,
    [mapId, playerId, text],
  );
  if (!rows.length) return { error: "gone", text };
  revalidatePath(mapPageUrl(mapId));
  return null;
}

/** «Удалить» under a comment: its author's, or any for an admin. */
export async function deleteMapComment(commentId: string): Promise<{ ok: true } | { error: "forbidden" }> {
  const viewer = await getViewer();
  const playerId = viewer ? await playerIdOf(viewer) : null;
  if (!viewer || (!playerId && !viewer.isAdmin) || !/^\d+$/.test(String(commentId))) return { error: "forbidden" };
  const db = await getDb();
  const [row] = await db.query(
    `UPDATE fnf_comments SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL AND (player_id = $2 OR $3) RETURNING map_id`,
    [commentId, playerId, viewer.isAdmin],
  );
  if (!row) return { error: "forbidden" };
  revalidatePath(mapPageUrl(String(row.map_id)));
  return { ok: true };
}
