import { getDb } from "./db";
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

/** The viewer's players row id; null for a dev stand-in who isn't a member. */
export async function playerIdOf(viewer: Viewer): Promise<string | null> {
  if (viewer.discordId.startsWith("dev:")) return null;
  return upsertPlayer({ discordId: viewer.discordId, name: viewer.name, avatar: viewer.avatar });
}
