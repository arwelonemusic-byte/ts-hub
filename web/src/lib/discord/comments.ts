import { createHash } from "node:crypto";
import { avatarUrl, mapRoleIdsToNames } from "../auth/discord";
import { getDb } from "../db";
import type { Viewer } from "../viewer";
import { discordRequest } from "./api";
import { announceConfigured, inThread, isDiscord, postGame, threadOf, threadUrl } from "./post";

/*
 * «Комментарии» on a game's page (user request 2026-10-14): the thread under the game's Discord announcement, read
 * and written from the hub. It's the thread the plan notices go to (post.ts), so the hub stores nothing.
 *
 * Reading: the bot fetches the thread's last 100 messages, at most once per 10 s per game however many are looking;
 * pages poll the version (CommentsPanel) and re-render when it changes. Writing: a member's comment goes out through
 * the announce channel's «TS Hub» webhook under their name and avatar (Discord tags it APP), into the thread; the
 * first comment starts the thread, and a webhook post reopens an archived one. The bot needs Manage Webhooks in the
 * channel for that. Nobody is pinged from the hub.
 *
 * Discord sends members' message text only to apps with the Message Content intent (Developer Portal → Bot →
 * Privileged Gateway Intents), on REST reads too: without it their comments arrive empty (2026-10-14: it was off).
 *
 * A game that isn't announced has no thread to talk in, and the section says so.
 */

/** The part of Discord's message object the hub reads. */
interface ApiUser {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
  bot?: boolean;
}
interface ApiMessage {
  id: string;
  type: number;
  content: string;
  timestamp: string;
  edited_timestamp: string | null;
  author: ApiUser;
  webhook_id?: string;
  mentions?: ApiUser[];
  attachments?: { id: string; filename: string; url: string; content_type?: string; width?: number | null; height?: number | null }[];
  components?: { type: number; components?: { type: number; style?: number; label?: string; url?: string }[] }[];
  sticker_items?: { id: string; name: string }[];
  referenced_message?: ApiMessage | null;
  /** A forwarded message: its text is here, not in `content`. */
  message_snapshots?: { message: { content?: string } }[];
}

/** One message of the thread, as the page shows it. */
export interface Comment {
  id: string;
  at: string;
  edited: boolean;
  /** Messages in a row from the same `author.key` are drawn as one block. */
  author: { key: string; name: string; avatar: string | null };
  /** The hub bot's own messages (a plan attached): a line, not a message. */
  notice: boolean;
  /** Discord markdown (components/event/DiscordText.tsx draws it). */
  content: string;
  /** Who `<@id>` and `<@&id>` (key "&id") in `content` are. */
  names: Record<string, string>;
  attachments: { url: string; name: string; image: boolean; width: number | null; height: number | null }[];
  /** Link buttons (the plan notice's «Открыть в Планировщике»). */
  links: { label: string; url: string }[];
  stickers: string[];
  replyTo: { name: string; content: string } | null;
}

export type Comments =
  | { status: "notAnnounced" }
  | { status: "error" }
  | {
      status: "ok";
      /** The thread in Discord; null until someone writes (the first comment starts it). */
      url: string | null;
      /** Oldest first. */
      comments: Comment[];
      /** The thread has older messages than these (open it in Discord for them). */
      more: boolean;
      /** Changes when a message comes, goes or is edited: what the page polls. */
      version: string;
    };

const LIMIT = 100;
const TTL_MS = 10_000;
/** Ordinary messages and replies; joins, pins, "thread created" and the like are left out. */
const SHOWN_TYPES = new Set([0, 19]);
export const COMMENT_MAX = 2000;

const g = globalThis as unknown as {
  __tsHubComments?: Map<string, { at: number; result: Promise<Comments> }>;
  __tsHubHooks?: Map<string, Promise<{ id: string; token: string }>>;
};
const cache = (g.__tsHubComments ??= new Map());
const hooks = (g.__tsHubHooks ??= new Map());

/** The game's comments, fetched from Discord at most every 10 s. */
export function getComments(eventId: string): Promise<Comments> {
  const hit = cache.get(eventId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.result;
  const result = load(eventId, hit?.result);
  cache.set(eventId, { at: Date.now(), result });
  return result;
}

async function load(eventId: string, previous: Promise<Comments> | undefined): Promise<Comments> {
  const at = announceConfigured() ? await threadOf(eventId) : null;
  if (!at) return { status: "notAnnounced" };
  let messages: ApiMessage[];
  try {
    messages = await discordRequest<ApiMessage[]>("GET", `/channels/${at.thread}/messages?limit=${LIMIT}`);
  } catch (err) {
    // Unknown Channel: nobody has written yet.
    if (isDiscord(err, 10003)) return { status: "ok", url: null, comments: [], more: false, version: "none" };
    console.error(`[discord] reading comments of ${eventId} failed:`, err);
    // Keep showing what was there (a rate limit, Discord down for a moment).
    const last = await previous?.catch(() => null);
    return last?.status === "ok" ? last : { status: "error" };
  }
  const comments = await normalize(messages.filter((m) => SHOWN_TYPES.has(m.type)).reverse());
  const version = createHash("md5")
    .update(messages.map((m) => `${m.id}:${m.edited_timestamp ?? ""}`).join(","))
    .digest("hex");
  return { status: "ok", url: threadUrl(at.thread), comments, more: messages.length === LIMIT, version };
}

type Player = { discord_id: string; display_name: string; avatar_url: string | null };

/** `SELECT … WHERE col IN (…)` with one parameter per value (works the same on PGlite and postgres.js). */
async function playersWhere(col: "discord_id" | "display_name", values: string[]): Promise<Player[]> {
  if (!values.length) return [];
  const marks = values.map((_, i) => `$${i + 1}`).join(", ");
  return (await getDb()).query(`SELECT discord_id, display_name, avatar_url FROM players WHERE ${col} IN (${marks})`, values) as Promise<Player[]>;
}

/**
 * Names and avatars as the hub has them (the server nickname), else Discord's. A comment written in the hub comes
 * from the webhook under the member's display name, which finds them again.
 */
async function normalize(messages: ApiMessage[]): Promise<Comment[]> {
  const all = messages.flatMap((m) => (m.referenced_message ? [m, m.referenced_message] : [m]));
  const ids = new Set<string>();
  const hubNames = new Set<string>();
  for (const m of all) {
    if (m.webhook_id) hubNames.add(m.author.username);
    else ids.add(m.author.id);
    m.mentions?.forEach((u) => ids.add(u.id));
  }
  const [byId, byName] = await Promise.all([playersWhere("discord_id", [...ids]), playersWhere("display_name", [...hubNames])]);
  const players = new Map(byId.map((p) => [p.discord_id, p]));
  const named = new Map(byName.map((p) => [p.display_name, p]));

  const who = (m: ApiMessage): Comment["author"] => {
    const p = m.webhook_id ? named.get(m.author.username) : players.get(m.author.id);
    return {
      // A webhook's messages share its id whoever wrote them: the name tells them apart.
      key: p?.discord_id ?? `${m.author.id}:${m.author.username}`,
      name: p?.display_name ?? (m.webhook_id ? m.author.username : (m.author.global_name ?? m.author.username)),
      avatar: p?.avatar_url ?? avatarUrl(m.author.id, m.author.avatar ?? null),
    };
  };

  return messages.map((m) => {
    const names: Record<string, string> = {};
    m.mentions?.forEach((u) => (names[u.id] = players.get(u.id)?.display_name ?? u.global_name ?? u.username));
    for (const [, id] of m.content.matchAll(/<@&(\d+)>/g)) {
      const role = mapRoleIdsToNames([id])[0];
      if (role) names[`&${id}`] = role;
    }
    const ref = m.referenced_message;
    return {
      id: m.id,
      at: m.timestamp,
      edited: !!m.edited_timestamp,
      author: who(m),
      notice: !!m.author.bot && !m.webhook_id,
      content: m.content || m.message_snapshots?.[0]?.message.content || "",
      names,
      attachments: (m.attachments ?? []).map((a) => ({
        url: a.url,
        name: a.filename,
        image: !!a.content_type?.startsWith("image/") && !!a.width,
        width: a.width ?? null,
        height: a.height ?? null,
      })),
      links: (m.components ?? []).flatMap((row) =>
        (row.components ?? []).filter((c) => c.type === 2 && c.url && c.label).map((c) => ({ label: c.label!, url: c.url! })),
      ),
      stickers: (m.sticker_items ?? []).map((s) => s.name),
      replyTo: ref ? { name: who(ref).name, content: ref.content.replace(/\s+/g, " ").slice(0, 140) } : null,
    };
  });
}

export type CommentResult = { ok: true } | { error: "notAnnounced" | "discord" };

/** A member's comment, posted to the game's thread under their name (the thread starts if it has none). */
export async function postComment(eventId: string, viewer: Viewer, text: string): Promise<CommentResult> {
  const at = announceConfigured() ? await threadOf(eventId) : null;
  const game = at && (await postGame(eventId));
  if (!at || !game) return { error: "notAnnounced" };
  try {
    await inThread(at, game, () => asMember(at, viewer, text));
  } catch (err) {
    console.error(`[discord] comment on ${eventId} by ${viewer.name} failed:`, err);
    return { error: "discord" };
  }
  cache.delete(eventId);
  return { ok: true };
}

const HOOK_NAME = "TS Hub";

/** The channel's «TS Hub» webhook, made the first time it's needed. */
function webhook(channel: string): Promise<{ id: string; token: string }> {
  let hook = hooks.get(channel);
  if (!hook) {
    hook = (async () => {
      const list = await discordRequest<{ id: string; type: number; name: string | null; token?: string }[]>("GET", `/channels/${channel}/webhooks`);
      const mine = list.find((w) => w.type === 1 && w.name === HOOK_NAME && w.token);
      if (mine) return { id: mine.id, token: mine.token! };
      return discordRequest<{ id: string; token: string }>("POST", `/channels/${channel}/webhooks`, { name: HOOK_NAME });
    })();
    hooks.set(channel, hook);
    hook.catch(() => hooks.delete(channel));
  }
  return hook;
}

/** Discord refuses a webhook name containing "discord" or "clyde"; a zero-width space breaks the word up. */
const hookName = (name: string) => name.replace(/(d)(iscord)|(c)(lyde)/gi, "$1$3​$2$4").slice(0, 80) || "Игрок";

async function asMember(at: { channel: string; thread: string }, viewer: Viewer, text: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    const hook = await webhook(at.channel);
    try {
      await discordRequest("POST", `/webhooks/${hook.id}/${hook.token}?wait=true&thread_id=${at.thread}`, {
        content: text,
        username: hookName(viewer.name),
        avatar_url: viewer.avatar ?? undefined,
        allowed_mentions: { parse: [] },
      });
      return;
    } catch (err) {
      // Unknown Webhook: someone deleted it in Discord. Make a new one.
      if (isDiscord(err, 10015) && attempt === 0) {
        hooks.delete(at.channel);
        continue;
      }
      throw err;
    }
  }
}
