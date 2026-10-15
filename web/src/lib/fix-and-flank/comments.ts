import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { FNF_COMMENT_MAX, mapPageUrl } from "./game";

/**
 * A member's comment on a map (fnf_comments), written from the map page's «Комментарии» (actions.ts) or the game's
 * debrief (app/api/games/fix-and-flank/maps/[id]/comments). Not a server action: the caller has checked who writes.
 */

export type MapCommentError = "empty" | "tooLong" | "gone";

/** The text as typed (new lines may be CRLF); only on a published map that's up: a draft is its author's alone. */
export async function addMapComment(mapId: string, playerId: string, raw: string): Promise<{ id: string } | { error: MapCommentError }> {
  const text = raw.replace(/\r\n?/g, "\n").trim();
  if (!text) return { error: "empty" };
  if (text.length > FNF_COMMENT_MAX) return { error: "tooLong" };
  const db = await getDb();
  const [row] = await db.query(
    `INSERT INTO fnf_comments (map_id, player_id, body)
     SELECT id, $2, $3 FROM fnf_maps WHERE id = $1 AND published_at IS NOT NULL AND hidden_at IS NULL RETURNING id`,
    [mapId, playerId, text],
  );
  if (!row) return { error: "gone" };
  revalidatePath(mapPageUrl(mapId));
  return { id: String(row.id) };
}
