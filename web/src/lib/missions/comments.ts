"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "../db";
import { playerIdOf } from "../players";
import { getViewer } from "../viewer";
import { MISSION_COMMENT_MAX } from ".";

/**
 * «Комментарии» on a mission's page (user request 2026-10-27): players' feedback on the mission itself, bugs and the
 * like, in the hub's own table (mission_comments) and never in Discord, unlike a game's. Members of the Discord write;
 * a comment is taken down by its writer or an admin (deleted_at; the row stays).
 */

/** What the comment box shows after a send (components/event/CommentForm): an error keeps the text. */
export type MissionCommentState = { error: "empty" | "tooLong" | "forbidden" | "gone"; text: string } | null;

export async function postMissionComment(_prev: MissionCommentState, form: FormData): Promise<MissionCommentState> {
  const missionId = String(form.get("mission") ?? "");
  const text = String(form.get("text") ?? "").replace(/\r\n?/g, "\n").trim(); // forms send new lines as CRLF
  const viewer = await getViewer();
  const playerId = viewer?.inGuild ? await playerIdOf(viewer) : null;
  if (!playerId) return { error: "forbidden", text };
  if (!text) return { error: "empty", text };
  if (text.length > MISSION_COMMENT_MAX) return { error: "tooLong", text };
  const db = await getDb();
  const [row] = await db.query(
    `INSERT INTO mission_comments (mission_id, player_id, body) SELECT id, $2, $3 FROM missions WHERE id = $1 RETURNING id`,
    [missionId, playerId, text],
  );
  if (!row) return { error: "gone", text };
  revalidatePath(`/missions/${missionId}`);
  return null;
}

/** «Удалить» under a comment: its writer's, or any for an admin. */
export async function deleteMissionComment(commentId: string): Promise<{ ok: true } | { error: "forbidden" }> {
  const viewer = await getViewer();
  if (!viewer || !/^\d+$/.test(String(commentId))) return { error: "forbidden" };
  const db = await getDb();
  const [row] = await db.query(
    `UPDATE mission_comments c SET deleted_at = NOW() FROM players p
     WHERE c.id = $1 AND p.id = c.player_id AND c.deleted_at IS NULL AND (p.discord_id = $2 OR $3) RETURNING c.mission_id`,
    [commentId, viewer.discordId, viewer.isAdmin],
  );
  if (!row) return { error: "forbidden" };
  revalidatePath(`/missions/${row.mission_id}`);
  return { ok: true };
}
