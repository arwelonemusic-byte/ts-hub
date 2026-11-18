import { getDb } from "./db";
import type { MemberLite } from "./roster/match";
import type { Viewer } from "./viewer";

/**
 * Keep a signed-in member's players row current, creating it on first login: the member list
 * the seed loads holds only members with the Reforger role. Returns the row id.
 */
export async function upsertPlayer(p: { discordId: string; name: string; username?: string | null; avatar: string | null }): Promise<string> {
  const db = await getDb();
  const [row] = await db.query(
    `INSERT INTO players (discord_id, display_name, username, avatar_url) VALUES ($1, $2, $3, $4)
     ON CONFLICT (discord_id) DO UPDATE SET display_name = EXCLUDED.display_name,
       username = COALESCE(EXCLUDED.username, players.username), avatar_url = COALESCE(EXCLUDED.avatar_url, players.avatar_url)
     RETURNING id`,
    [p.discordId, p.name, p.username ?? null, p.avatar],
  );
  return String(row.id);
}

/** Every member who can be credited with something (a plan): has a Discord account, by nickname. */
export async function memberOptions(): Promise<MemberLite[]> {
  const db = await getDb();
  const rows = (await db.query(
    "SELECT id, display_name, username, avatar_url FROM players WHERE discord_id IS NOT NULL ORDER BY lower(display_name)",
  )) as { id: string | number; display_name: string; username: string | null; avatar_url: string | null }[];
  return rows.map((m) => ({ id: String(m.id), name: m.display_name, username: m.username, avatar: m.avatar_url }));
}

/** The viewer's players row id; null for a dev stand-in who isn't a member. */
export async function playerIdOf(viewer: Viewer): Promise<string | null> {
  if (viewer.discordId.startsWith("dev:")) return null;
  return upsertPlayer({ discordId: viewer.discordId, name: viewer.name, avatar: viewer.avatar });
}
