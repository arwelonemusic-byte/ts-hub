import { createHash } from "node:crypto";
import { getHubData } from "../data";
import { getDb } from "../db";
import { workshopUrl } from "../links";
import { squadsOf } from "../squads";
import type { Mission } from "../types";
import { DiscordError, discordRequest, type DiscordEmbed, type DiscordFile, type DiscordMessage } from "./api";
import { renderGamePost, type PostGame } from "./template";

/*
 * A game's announcement in Discord (user decisions 2026-10-09): the hub drives slotting and the Discord post only
 * mirrors it. An admin posts it with «Анонс в Дискорд» (postAnnouncement); from then on every change to the game
 * (slots, time, plan, cancelled, played) calls refreshAnnouncement, which edits the post a moment later. Signing
 * up happens on the site: the post's button links to the game's page.
 *
 * Posts go to DISCORD_ANNOUNCE_CHANNEL_ID as the Tactical Shift bot (DISCORD_BOT_TOKEN), which needs View Channel,
 * Send Messages and Embed Links there. Without both env vars the feature is off (dev): nothing is sent.
 * The look is lib/discord/template.ts. A post deleted in Discord stays deleted: the next edit finds it gone and
 * clears its ids, and the game's page offers «Анонс в Дискорд» again.
 */

const channel = () => process.env.DISCORD_ANNOUNCE_CHANNEL_ID || null;
/** Role ids pinged when a post goes up, comma-separated (production: @Анонсы,@Reforger); empty for a test channel. */
const pingRoles = () =>
  (process.env.DISCORD_ANNOUNCE_PING_ROLES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s));
const hubUrl = () => (process.env.NEXT_PUBLIC_BASE_URL ?? "https://hub.tacticalshift.ru").replace(/\/$/, "");
const absolute = (url: string | null) => (url ? (/^https?:\/\//.test(url) ? url : `${hubUrl()}${url}`) : null);

export const announceConfigured = () => !!(process.env.DISCORD_BOT_TOKEN && channel());

/** Where an announced game's post is, for its page's link; null when it has none. */
export async function announcement(eventId: string): Promise<{ url: string } | null> {
  const [row] = (await (await getDb()).query("SELECT discord_channel_id, discord_message_id FROM events WHERE id = $1", [eventId])) as {
    discord_channel_id: string | null;
    discord_message_id: string | null;
  }[];
  if (!row?.discord_message_id) return null;
  return { url: `https://discord.com/channels/${process.env.DISCORD_GUILD_ID}/${row.discord_channel_id}/${row.discord_message_id}` };
}

function missionOf(m: Mission): PostGame["mission"] {
  return {
    name: m.name,
    mapLabel: m.mapLabel,
    authors: m.authors,
    tags: m.tags,
    sides: m.briefing?.sides ?? null,
    coverUrl: absolute(m.coverUrl),
    workshopUrl: workshopUrl(m),
  };
}

/** The game as its post shows it; null when there's no such game. */
export async function postGame(eventId: string): Promise<PostGame | null> {
  const url = `${hubUrl()}/events/${encodeURIComponent(eventId)}`;
  const ev = await getHubData().getEvent(eventId, new Date());
  if (ev?.status === "upcoming") {
    const squads = squadsOf(ev.slots).map((sq) => ({
      groupId: sq.groupId,
      name: sq.groupName,
      slots: sq.slots.map((s) => ({ role: s.role, requiredRole: s.requiredRole, player: s.playerName, playerId: s.playerId })),
    }));
    return {
      status: "scheduled",
      url,
      startsAt: ev.startsAt,
      mission: missionOf(ev.mission),
      squads,
      slotted: ev.slots.filter((s) => s.playerName).length,
      slotCount: ev.slots.length,
      plan: ev.plan ? { code: ev.plan.code, title: ev.plan.title, author: ev.plan.author } : null,
      pingRoles: pingRoles(),
    };
  }
  if (ev) {
    return {
      status: "played",
      url,
      startsAt: ev.startsAt,
      mission: missionOf(ev.mission),
      squads: [],
      slotted: 0,
      slotCount: 0,
      plan: null,
      attended: ev.attended,
      pingRoles: pingRoles(),
    };
  }
  // Cancelled games aren't in the hub's game lists any more.
  const [row] = (await (await getDb()).query("SELECT mission_id, starts_at FROM events WHERE id = $1 AND status = 'cancelled'", [eventId])) as {
    mission_id: string;
    starts_at: Date | string;
  }[];
  const mission = row && (await getHubData().getMission(row.mission_id));
  if (!mission) return null;
  return {
    status: "cancelled",
    url,
    startsAt: new Date(row.starts_at).toISOString(),
    mission: missionOf(mission),
    squads: [],
    slotted: 0,
    slotCount: 0,
    plan: null,
    pingRoles: pingRoles(),
  };
}

const clip = (s: string | undefined, n: number) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s);
const embedLength = (e: DiscordEmbed) =>
  (e.title?.length ?? 0) + (e.description?.length ?? 0) + (e.author?.name.length ?? 0) + (e.footer?.text.length ?? 0) +
  (e.fields ?? []).reduce((n, f) => n + f.name.length + f.value.length, 0);

/** Trim a message to Discord's limits, so a big game or a long template can't get the post refused. */
export function fitLimits(msg: DiscordMessage): DiscordMessage {
  const embeds = (msg.embeds ?? []).slice(0, 10).map((e) => {
    const out: DiscordEmbed = {
      ...e,
      title: clip(e.title, 256),
      description: clip(e.description, 4096),
      author: e.author && { ...e.author, name: clip(e.author.name, 256)! },
      footer: e.footer && { ...e.footer, text: clip(e.footer.text, 2048)! },
      fields: e.fields?.map((f) => ({ ...f, name: clip(f.name, 256) || "​", value: clip(f.value, 1024) || "​" })),
    };
    let dropped = 0;
    while (out.fields?.length && (out.fields.length > 25 || embedLength(out) > 6000)) {
      out.fields.pop();
      dropped++;
    }
    if (dropped && out.fields) {
      out.fields.pop();
      out.fields.push({ name: "​", value: `…и ещё ${dropped + 1} — на сайте` });
    }
    return out;
  });
  return { ...msg, content: clip(msg.content, 2000), embeds };
}

/**
 * Exactly what an edit sends: missing parts empty, so an edit replaces the whole post. The image isn't part of it:
 * it's attached once, when the post goes up, and an edit that doesn't mention attachments keeps it.
 */
function render(game: PostGame): { body: DiscordMessage; hash: string; image: string | null } {
  const { image, ...rest } = renderGamePost(game);
  const msg = fitLimits(rest);
  const body: DiscordMessage = { content: msg.content ?? "", embeds: msg.embeds ?? [], components: msg.components ?? [], allowed_mentions: msg.allowed_mentions ?? { parse: [] } };
  return { body, hash: createHash("md5").update(JSON.stringify(body)).digest("hex"), image: image ?? null };
}

/** The image to attach, downloaded from its URL; null when it can't be had (the post then goes up without it). */
async function imageFile(url: string | null): Promise<DiscordFile | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    const data = await res.blob();
    if (!type.startsWith("image/") || data.size > 9_500_000) throw new Error(`${type}, ${data.size} bytes`);
    return { name: `cover.${type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg"}`, data };
  } catch (err) {
    console.error(`[discord] cover ${url} not attached:`, err);
    return null;
  }
}

// One post or edit at a time per game (a create racing an edit would post twice), and edits wait a moment so a
// burst of sign-ups becomes one edit. On globalThis so dev reloads share it.
const g = globalThis as unknown as { __tsHubDiscord?: Map<string, { chain: Promise<unknown>; timer?: ReturnType<typeof setTimeout> }> };
const queues = (g.__tsHubDiscord ??= new Map());
const EDIT_DELAY_MS = 2000;

function serial<T>(eventId: string, job: () => Promise<T>): Promise<T> {
  const q = queues.get(eventId) ?? { chain: Promise.resolve() };
  queues.set(eventId, q);
  const run = q.chain.then(job, job);
  q.chain = run.catch(() => undefined);
  return run;
}

type Row = { discord_channel_id: string | null; discord_message_id: string | null; discord_hash: string | null };
const postRow = async (eventId: string) =>
  ((await (await getDb()).query("SELECT discord_channel_id, discord_message_id, discord_hash FROM events WHERE id = $1", [eventId])) as Row[])[0];

export type AnnounceResult = { url: string } | { error: "notConfigured" | "notFound" | "discord" };

/** «Анонс в Дискорд»: post a scheduled game's announcement (or return the one it has). */
export function postAnnouncement(eventId: string): Promise<AnnounceResult> {
  return serial(eventId, async () => {
    const ch = channel();
    if (!announceConfigured() || !ch) return { error: "notConfigured" } as const;
    const row = await postRow(eventId);
    if (row?.discord_message_id) return (await announcement(eventId))!;
    const game = await postGame(eventId);
    if (!row || game?.status !== "scheduled") return { error: "notFound" } as const;
    const { body, hash, image } = render(game);
    const file = await imageFile(image);
    try {
      const sent = await discordRequest<{ id: string }>(
        "POST",
        `/channels/${ch}/messages`,
        file ? { ...body, attachments: [{ id: 0, filename: file.name }] } : body,
        file ? [file] : [],
      );
      await (await getDb()).query(
        "UPDATE events SET discord_channel_id = $2, discord_message_id = $3, discord_hash = $4 WHERE id = $1",
        [eventId, ch, sent.id, hash],
      );
    } catch (err) {
      console.error(`[discord] posting ${eventId} failed:`, err);
      return { error: "discord" } as const;
    }
    return (await announcement(eventId))!;
  });
}

/** The game changed: bring its post (if it has one) up to date a moment from now. Never throws. */
export function refreshAnnouncement(eventId: string): void {
  if (!announceConfigured()) return;
  const q = queues.get(eventId) ?? { chain: Promise.resolve() };
  queues.set(eventId, q);
  if (q.timer) return; // an edit is already coming and will read the latest state
  q.timer = setTimeout(() => {
    q.timer = undefined;
    serial(eventId, () => editPost(eventId)).catch((err) => console.error(`[discord] updating ${eventId} failed:`, err));
  }, EDIT_DELAY_MS);
}

async function editPost(eventId: string): Promise<void> {
  const row = await postRow(eventId);
  if (!row?.discord_message_id || !row.discord_channel_id) return;
  const game = await postGame(eventId);
  if (!game) return;
  const { body, hash } = render(game);
  if (hash === row.discord_hash) return;
  const db = await getDb();
  try {
    await discordRequest("PATCH", `/channels/${row.discord_channel_id}/messages/${row.discord_message_id}`, body);
  } catch (err) {
    if (err instanceof DiscordError && err.status === 404) {
      // Deleted in Discord: forget it, so the page offers «Анонс в Дискорд» again.
      await db.query("UPDATE events SET discord_channel_id = NULL, discord_message_id = NULL, discord_hash = NULL WHERE id = $1", [eventId]);
      return;
    }
    throw err;
  }
  await db.query("UPDATE events SET discord_hash = $2 WHERE id = $1", [eventId, hash]);
}
