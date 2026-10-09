"use server";

import { revalidatePath } from "next/cache";
import { getViewer } from "../viewer";
import { postAnnouncement, type AnnounceResult } from "./post";

/** «Анонс в Дискорд» (admins): post the game's announcement; it then follows the game by itself. */
export async function announceGame(eventId: string): Promise<AnnounceResult | { error: "forbidden" }> {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return { error: "forbidden" };
  const result = await postAnnouncement(String(eventId));
  revalidatePath(`/events/${eventId}`);
  return result;
}
