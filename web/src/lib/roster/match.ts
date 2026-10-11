import { slugify } from "../missions/draft";

/*
 * Suggestions for the admin page «Игроки»: which member an unmatched in-game name probably is. Only suggestions —
 * an admin confirms every match. In order of trust:
 *   account  the name's Bohemia account already plays under another name that's matched (a rename)
 *   exact    the name equals a member's server nickname or username, ignoring clan tags, case, punctuation and
 *            Cyrillic vs Latin spelling ("[BS] Jenya" = "Jenya", "Сваркослав" = "Svarkoslav"); a nickname's part in
 *            round brackets counts on its own, as members often put their in-game name there ("Smoker (OnlineKiller)")
 *   similar  one contains the other, or they're a letter or two apart
 */

export interface MemberLite {
  id: string;
  name: string;
  username: string | null;
  avatar: string | null;
}

export type MatchReason = "account" | "exact" | "similar";

export interface Suggestion {
  memberId: string;
  reason: MatchReason;
  /** "account": the matched name sharing the account. */
  via?: string;
  /** Other members that fit as well as this one (then it's no sure thing). */
  others: number;
}

/** A name stripped to what identifies it: clan tags in brackets, case, punctuation and the alphabet don't count. */
export function nameKey(s: string): string {
  return slugify(s.replace(/\[[^\]]*\]|\([^)]*\)|\{[^}]*\}|<[^>]*>/g, " ")).replace(/-/g, "");
}

/** What a member can be matched by: their nickname, each part of it in round brackets, their username. */
function memberKeys(m: MemberLite): string[] {
  const inBrackets = [...m.name.matchAll(/\(([^)]*)\)/g)].map((x) => nameKey(x[1]));
  return [nameKey(m.name), ...inBrackets, ...(m.username ? [nameKey(m.username)] : [])].filter(Boolean);
}

function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** How close two keys are: 0 = same, 1 = one contains the other or a letter apart, 2 = two letters apart; null = not close. */
function closeness(a: string, b: string): number | null {
  if (!a || !b) return null;
  if (a === b) return 0;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length >= 4 && long.includes(short)) return 1;
  if (short.length < 5) return null;
  const d = distance(a, b);
  if (d === 1) return 1;
  if (d === 2 && short.length >= 7) return 2;
  return null;
}

export function suggest(
  name: string,
  accounts: string[],
  members: MemberLite[],
  /** Account ID → the matched name it played under and that name's member. */
  accountOwners: Map<string, { name: string; memberId: string }>,
): Suggestion | null {
  for (const a of accounts) {
    const owner = accountOwners.get(a);
    if (owner) return { memberId: owner.memberId, reason: "account", via: owner.name, others: 0 };
  }
  const key = nameKey(name);
  if (!key) return null;
  let best: { score: number; ids: string[] } | null = null;
  for (const m of members) {
    const scores = memberKeys(m).map((k) => closeness(key, k)).filter((s): s is number => s !== null);
    if (!scores.length) continue;
    const score = Math.min(...scores);
    if (!best || score < best.score) best = { score, ids: [m.id] };
    else if (score === best.score) best.ids.push(m.id);
  }
  if (!best) return null;
  return { memberId: best.ids[0], reason: best.score === 0 ? "exact" : "similar", others: best.ids.length - 1 };
}

/** Sure enough to match in bulk: the same account, or one member with exactly this name. */
export const isSure = (s: Suggestion | null) => !!s && (s.reason === "account" || (s.reason === "exact" && s.others === 0));
