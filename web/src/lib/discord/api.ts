/*
 * Discord's REST API as the Tactical Shift bot (DISCORD_BOT_TOKEN: the account that already reads members' roles,
 * lib/auth/discord.ts). Posting and editing a message is plain REST, so the hub needs no gateway connection.
 */
// DISCORD_API_URL points it elsewhere (a local stand-in for testing); unset in production.
const API = process.env.DISCORD_API_URL || "https://discord.com/api/v10";

/** The part of Discord's message object the hub sends. */
export interface DiscordMessage {
  content?: string;
  embeds?: DiscordEmbed[];
  components?: unknown[];
  /** Who may be pinged. The hub sends `{ parse: [] }` (nobody) unless the template says otherwise. */
  allowed_mentions?: { parse?: ("roles" | "users" | "everyone")[]; roles?: string[]; users?: string[] };
}

export interface DiscordEmbed {
  title?: string;
  url?: string;
  description?: string;
  color?: number;
  author?: { name: string; url?: string; icon_url?: string };
  fields?: { name: string; value: string; inline?: boolean }[];
  image?: { url: string };
  thumbnail?: { url: string };
  footer?: { text: string; icon_url?: string };
  timestamp?: string;
}

export class DiscordError extends Error {
  constructor(
    readonly status: number,
    /** Discord's JSON error code, e.g. 10008 = Unknown Message. */
    readonly code: number | undefined,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Discord wants a longer pause than is worth holding the request for. The caller tries again after `retryAfterMs`
 * with content made then: an edit held through a long wait would go out stale.
 */
export class DiscordRateLimited extends DiscordError {
  constructor(
    readonly retryAfterMs: number,
    message: string,
  ) {
    super(429, undefined, message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** A rate limit up to this long is sat out; a longer one is thrown (DiscordRateLimited). */
const MAX_WAIT_MS = 5000;

/** A file sent with a message: it shows as an attachment (an image renders large, above the card). */
export interface DiscordFile {
  name: string;
  data: Blob;
}

/**
 * One API call; sits out a short rate limit (429) up to three times and throws DiscordRateLimited for a long one.
 * Edits to a published post get long ones (2026-10-12: #анонсы is an Announcement channel and its posts are
 * published, and an edit was held off for minutes). With files it's a multipart upload.
 */
export async function discordRequest<T>(method: "GET" | "POST" | "PATCH", path: string, body?: unknown, files: DiscordFile[] = []): Promise<T> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new DiscordError(0, undefined, "DISCORD_BOT_TOKEN is not set");
  for (let attempt = 0; ; attempt++) {
    const headers: Record<string, string> = { Authorization: `Bot ${token}` };
    let payload: BodyInit | undefined;
    if (files.length) {
      // The message as payload_json, each file as files[n] (fetch sets the multipart boundary itself).
      const form = new FormData();
      form.append("payload_json", JSON.stringify(body ?? {}));
      files.forEach((f, i) => form.append(`files[${i}]`, f.data, f.name));
      payload = form;
    } else if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const res = await fetch(API + path, { method, headers, body: payload, cache: "no-store", signal: AbortSignal.timeout(20_000) });
    const json = await res.json().catch(() => null);
    if (res.status === 429) {
      const wait = Math.ceil((json?.retry_after ?? 1) * 1000) + 100;
      const scope = `${res.headers.get("x-ratelimit-scope") ?? "?"}${json?.global ? ", global" : ""}`;
      console.warn(`[discord] ${method} ${path}: rate limited for ${(wait / 1000).toFixed(1)} s (${scope})`);
      if (wait > MAX_WAIT_MS || attempt >= 3) throw new DiscordRateLimited(wait, json?.message ?? "rate limited");
      await sleep(wait);
      continue;
    }
    if (!res.ok) {
      // A 400's `errors` names the field Discord refused (a too-long embed value, a bad URL…).
      const detail = json?.errors ? ` ${JSON.stringify(json.errors)}` : "";
      throw new DiscordError(res.status, json?.code, `${json?.message ?? res.statusText}${detail}`);
    }
    return json as T;
  }
}
