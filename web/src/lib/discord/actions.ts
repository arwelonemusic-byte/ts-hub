"use server";

import { revalidatePath } from "next/cache";
import { getViewer } from "../viewer";
import { COMMENT_MAX, postComment } from "./comments";
import { postAnnouncement, type AnnounceResult } from "./post";

/** «Анонс в Дискорд» (admins): post the game's announcement; it then follows the game by itself. */
export async function announceGame(eventId: string): Promise<AnnounceResult | { error: "forbidden" }> {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return { error: "forbidden" };
  const result = await postAnnouncement(String(eventId));
  revalidatePath(`/events/${eventId}`);
  return result;
}

/** What the comment box shows after a send: an error keeps the text so nothing typed is lost. */
export type CommentState = { error: "empty" | "tooLong" | "forbidden" | "notAnnounced" | "discord"; text: string } | null;

/** «Отправить» in «Комментарии»: anyone signed in who's on the Discord server writes in the game's thread. */
export async function sendComment(_prev: CommentState, form: FormData): Promise<CommentState> {
  const eventId = String(form.get("event") ?? "");
  const text = String(form.get("text") ?? "").trim();
  const viewer = await getViewer();
  if (!viewer?.inGuild) return { error: "forbidden", text };
  if (!text) return { error: "empty", text };
  if (text.length > COMMENT_MAX) return { error: "tooLong", text };
  const result = await postComment(eventId, viewer, text);
  if ("error" in result) return { error: result.error, text };
  revalidatePath(`/events/${eventId}`);
  return null;
}
