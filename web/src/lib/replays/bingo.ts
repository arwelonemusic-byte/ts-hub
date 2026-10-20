import type { BingoResult, BingoWinner } from "../types";
import type { Replay, ReplayEvent } from "./stats";

/*
 * TS Bingo from TS Replay recordings. The mod (addons/TS Bingo, TS_BingoReplay.c) records
 *   bingo_card {playerId, playerGuid}: a player got their card (once per player per loaded world),
 *   bingo {playerId, playerGuid, line, marked, cells}: they completed a line (once per line; uncrossing doesn't take it back).
 * It sends no names: they come from the same recording's player_join, by account, else by playerId.
 * Pure: no I/O.
 */

const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);

/** Ids that aren't a Bohemia account: Workbench and Peer Tool sessions (00bbbddd-), and a card taken before the backend verified the player (pid:N). */
const account = (v: unknown) => (typeof v === "string" && v && !v.startsWith("00bbbddd-") && !v.startsWith("pid:") ? v : null);

export function toBingo(replays: Replay[]): BingoResult | null {
  const carded = new Set<string>();
  const winners = new Map<string, BingoWinner>();
  let recorded = false;
  for (const r of [...replays].sort((a, b) => a.startedAt - b.startedAt)) {
    const byId = new Map<number, string>();
    const byAccount = new Map<string, string>();
    for (const e of r.events) {
      if (e.type !== "player_join") continue;
      byId.set(num(e.playerId), String(e.name));
      const id = account(e.playerGuid);
      if (id) byAccount.set(id, String(e.name));
    }
    const nameOf = (e: ReplayEvent) => byAccount.get(account(e.playerGuid) ?? "") ?? byId.get(num(e.playerId));

    const done = new Set<string>();
    const events = r.events.filter((e) => e.type === "bingo_card" || e.type === "bingo").sort((a, b) => a.t - b.t);
    for (const e of events) {
      recorded = true;
      const name = nameOf(e);
      if (!name) continue;
      carded.add(name);
      if (e.type !== "bingo") continue;
      const line = num(e.line);
      if (line < 0 || line > 11 || done.has(`${name}|${line}`)) continue;
      done.add(`${name}|${line}`);

      const sent = Array.isArray(e.cells) ? e.cells : [];
      const cells = Array.from({ length: 25 }, (_, i) => (i === 12 ? "" : String(sent[i] ?? "")));
      const marked = num(e.marked);
      const w = winners.get(name);
      if (!w) {
        winners.set(name, { playerName: name, at: new Date(r.startedAt * 1000 + e.t).toISOString(), count: 1, lines: [line], cells, marked });
        continue;
      }
      // A restart (or the card re-keyed once the player was verified) deals a new card: show the latest one.
      const sameCard = w.cells.every((c, i) => c === cells[i]);
      w.count++;
      w.lines = sameCard ? [...w.lines, line] : [line];
      w.cells = cells;
      w.marked = marked;
    }
  }
  if (!recorded) return null;
  return { players: carded.size, winners: [...winners.values()].sort((a, b) => a.at.localeCompare(b.at)) };
}
