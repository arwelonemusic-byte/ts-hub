import { getDb } from "../db";
import { suggest, type MemberLite, type Suggestion } from "./match";

/*
 * The admin page «Игроки» (user decision 2026-10-11: matching in-game names to members is done by hand, not by
 * players). Every name from a played game's roster, with the member it's matched to (player_names) or a suggestion
 * (match.ts). Account IDs stay on the server: the page only learns whether a name has one.
 */

export interface InGameName {
  name: string;
  /** Played games under this name. */
  games: number;
  /** ISO start of the latest of them. */
  lastPlayed: string;
  /** A recording carried this name's Bohemia account (games from 2026-10-10 on). */
  hasAccount: boolean;
  memberId: string | null;
  suggestion: Suggestion | null;
}

export async function playerLinks(): Promise<{ names: InGameName[]; members: MemberLite[] }> {
  const db = await getDb();
  const [rows, memberRows] = await Promise.all([
    db.query(
      `SELECT a.player_name AS name, count(DISTINCT a.event_id)::int AS games,
              max(coalesce(e.started_at, e.starts_at)) AS last_played,
              coalesce(array_agg(DISTINCT a.account_id) FILTER (WHERE a.account_id IS NOT NULL), '{}'::text[]) AS accounts,
              pn.player_id
         FROM event_attendance a
         JOIN events e ON e.id = a.event_id
         LEFT JOIN player_names pn ON pn.name = a.player_name
        WHERE a.attended AND e.status = 'played'
        GROUP BY a.player_name, pn.player_id`,
    ) as Promise<{ name: string; games: number; last_played: Date | string; accounts: string[]; player_id: string | number | null }[]>,
    db.query("SELECT id, display_name, username, avatar_url FROM players ORDER BY lower(display_name)") as Promise<
      { id: string | number; display_name: string; username: string | null; avatar_url: string | null }[]
    >,
  ]);
  const members: MemberLite[] = memberRows.map((m) => ({ id: String(m.id), name: m.display_name, username: m.username, avatar: m.avatar_url }));
  const owners = new Map<string, { name: string; memberId: string }>();
  for (const r of rows) if (r.player_id !== null) for (const a of r.accounts) owners.set(a, { name: r.name, memberId: String(r.player_id) });

  const names = rows.map((r) => ({
    name: r.name,
    games: r.games,
    lastPlayed: new Date(r.last_played).toISOString(),
    hasAccount: r.accounts.length > 0,
    memberId: r.player_id === null ? null : String(r.player_id),
    suggestion: r.player_id === null ? suggest(r.name, r.accounts, members, owners) : null,
  }));
  // Most recently played first: the regulars, then the occasional guests.
  names.sort((a, b) => b.lastPlayed.localeCompare(a.lastPlayed) || b.games - a.games || a.name.localeCompare(b.name));
  return { names, members };
}
