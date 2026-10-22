"use server";

import { revalidatePath } from "next/cache";
import { avatarUrl, fetchGuildMemberByBot } from "../auth/discord";
import { getDb } from "../db";
import { playerIdOf, upsertPlayer } from "../players";
import { getViewer } from "../viewer";

export type LinkResult = { error: "forbidden" | "invalid" } | null;

/** «Привязать» (admins): in-game names → members. A name already matched is moved to the new member. */
export async function linkPlayerNames(pairs: { name: string; memberId: string }[]): Promise<LinkResult> {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return { error: "forbidden" };
  const clean = (Array.isArray(pairs) ? pairs : []).filter(
    (p) => typeof p?.name === "string" && p.name.trim() && p.name.length <= 100 && /^\d+$/.test(String(p?.memberId)),
  );
  if (!clean.length || clean.length !== pairs.length || clean.length > 500) return { error: "invalid" };
  const db = await getDb();
  const ids = [...new Set(clean.map((p) => String(p.memberId)))];
  const [{ n }] = (await db.query("SELECT count(*)::int AS n FROM players WHERE id = ANY($1::bigint[])", [ids])) as { n: number }[];
  if (n !== ids.length) return { error: "invalid" };
  const by = await playerIdOf(viewer);
  await db.transaction(async (tx) => {
    for (const p of clean) {
      await tx.query(
        `INSERT INTO player_names (name, player_id, linked_by) VALUES ($1, $2, $3)
         ON CONFLICT (name) DO UPDATE SET player_id = EXCLUDED.player_id, linked_by = EXCLUDED.linked_by, linked_at = NOW()`,
        [p.name, p.memberId, by],
      );
    }
  });
  revalidatePath("/players");
  return null;
}

/** «Отвязать» (admins): the name is unmatched again. */
export async function unlinkPlayerName(name: string): Promise<LinkResult> {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return { error: "forbidden" };
  if (typeof name !== "string" || !name) return { error: "invalid" };
  await (await getDb()).query("DELETE FROM player_names WHERE name = $1", [name]);
  revalidatePath("/players");
  return null;
}

export type AddMemberState = { error: "forbidden" | "invalid" | "notInGuild" | "exists"; name?: string } | { added: string } | null;

/**
 * «Добавить участника» (admins): a members' players row by Discord ID, so they can be seated in a slot before
 * they ever log in (the member list the seed loaded holds only members with @Reforger as of 2026-10-09).
 * The bot fills in the nickname, username and avatar as a login would; when it can't ask Discord (dev, an outage)
 * the typed display name stands in. A member already in the hub is left as they are (`exists`).
 */
export async function addMember(_prev: AddMemberState, form: FormData): Promise<AddMemberState> {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return { error: "forbidden" };
  const discordId = String(form.get("discordId") ?? "").trim();
  const typed = String(form.get("name") ?? "").trim();
  if (!/^\d{17,20}$/.test(discordId) || !typed || typed.length > 100) return { error: "invalid" };
  const db = await getDb();
  const [known] = (await db.query("SELECT display_name FROM players WHERE discord_id = $1", [discordId])) as { display_name: string }[];
  if (known) return { error: "exists", name: known.display_name };

  const member = await fetchGuildMemberByBot(discordId);
  if (member === "NOT_IN_GUILD") return { error: "notInGuild" };
  const name = member?.nick ?? member?.user?.globalName ?? member?.user?.username ?? typed;
  await upsertPlayer({
    discordId,
    name,
    username: member?.user?.username ?? null,
    avatar: member?.user ? avatarUrl(discordId, member.user.avatar) : null,
  });
  revalidatePath("/players");
  return { added: name };
}
