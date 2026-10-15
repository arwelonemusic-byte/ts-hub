"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { playerIdOf } from "@/lib/players";
import { removeUpload } from "@/lib/uploads";
import { getViewer } from "@/lib/viewer";
import { addMapComment } from "./comments";
import { FNF_HOME, mapPageUrl } from "./game";

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
  const out = await addMapComment(mapId, playerId, text);
  return "error" in out ? { error: out.error, text } : null;
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

/**
 * An admin's «Удалить карту» on a published map's page (user request 2026-10-15: a blank map published by mistake,
 * a hate symbol drawn in terrain). The map is taken down (hidden_at), as the hub does with admins' other removals:
 * gone from the lists, its page, the game and «Повтор»; its runs and comments stay in the database. Its picture file
 * is deleted, since that is what would show the symbol. Then the game's page.
 */
export async function takeDownMap(form: FormData): Promise<void> {
  const mapId = String(form.get("map") ?? "");
  const viewer = await getViewer();
  if (!viewer?.isAdmin || !mapId) return;
  const db = await getDb();
  const [old] = await db.query(`SELECT thumb_url FROM fnf_maps WHERE id = $1 AND published_at IS NOT NULL AND hidden_at IS NULL`, [mapId]);
  if (!old) return;
  await db.query(`UPDATE fnf_maps SET hidden_at = NOW(), thumb_url = NULL WHERE id = $1`, [mapId]);
  const thumb = (old.thumb_url as string | null) ?? null;
  if (thumb?.startsWith("/uploads/")) await removeUpload(thumb); // not the game's own pictures (Trench Line's)
  revalidatePath(FNF_HOME);
  revalidatePath(mapPageUrl(mapId));
  redirect(FNF_HOME);
}
