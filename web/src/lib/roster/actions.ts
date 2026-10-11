"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "../db";
import { playerIdOf } from "../players";
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
