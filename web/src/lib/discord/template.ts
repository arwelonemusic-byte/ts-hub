import type { DiscordMessage } from "./api";

/*
 * THE POST TEMPLATE. A game's Discord announcement is renderGamePost(game): edit this file to change how it looks.
 * It's a pure function of PostGame, re-run on every change, and the hub edits the post only when the result differs.
 *
 * Galaxy's layout (2026-10-09), after the announcements posted by hand until now:
 *   message text  # Что | Operation <name> / # Когда | <date> / За кого, Против кого / @Анонсы @Reforger
 *   image         the mission's cover, attached to the message so it renders large
 *   card          mission name, countdown, map, author, then a block per squad (✅ taken / ⬜ free)
 *   button        «Записаться» → the game's page
 * Discord always draws them in that order (text, attachments, card, buttons). The image goes up with the first post
 * only; edits keep it.
 *
 * Discord renders `<t:UNIX:F>` (a full date) and `<t:UNIX:R>` ("через 2 дня") in each reader's own language and time
 * zone, in the message text, a card's description or a field, not in a card's title or footer. Limits (post.ts trims to
 * them anyway): message text 2000; card title 256, description 4096, 25 fields of name 256 / value 1024, 6000 in all.
 */

/** Everything a post can show (lib/discord/post.ts gathers it). URLs are absolute. */
export interface PostGame {
  status: "scheduled" | "cancelled" | "played";
  /** The game's page in the hub. */
  url: string;
  /** ISO start. */
  startsAt: string;
  mission: {
    /** Without "Operation" (the hub prints that above every mission name). */
    name: string;
    mapLabel: string;
    authors: string[];
    tags: string[];
    /** «За кого» / «Против кого» from the briefing. */
    sides: { for?: string; against?: string } | null;
    /** The cover (title printed on it), null when the mission has none. */
    coverUrl: string | null;
    workshopUrl: string;
  };
  /** In the game page's order (HQ first). Empty for a mission played without slotting. */
  squads: {
    groupId: string;
    name: string;
    slots: { role: string; requiredRole?: string; player: string | null; /** Their Discord id, for a `<@id>` mention. */ playerId?: string }[];
  }[];
  slotted: number;
  slotCount: number;
  plan: { code: string; title?: string; author: string } | null;
  /** A played game: how many played. */
  attended?: number;
  /** Roles pinged when the post goes up (DISCORD_ANNOUNCE_PING_ROLES): @Анонсы, @Reforger in #анонсы. */
  pingRoles: string[];
}

/** A post: the Discord message, plus the image attached when it first goes up. */
export interface GamePost extends DiscordMessage {
  image?: string | null;
}

const ACCENT = 0xf4db50;
const GREY = 0x2e3439;

/*
 * The pinged roles (g.pingRoles) only ping from the message text, and only on the first post: the hub's edits never
 * ping again. allowed_mentions lets exactly these roles ping, so a player's name can't. TS Hub Bot has «Mention
 * @everyone, @here and All Roles» in #анонсы.
 */

/** The message text: what and when, the sides, the pings. */
function header(g: PostGame, unix: number): string {
  const sides = g.mission.sides;
  const sideLines = [sides?.for && `**За кого:** ${sides.for}`, sides?.against && `**Против кого:** ${sides.against}`].filter(Boolean);
  return [
    `# Что | Operation ${g.mission.name}`,
    `# Когда | <t:${unix}:F>`,
    ...(sideLines.length ? ["", ...sideLines] : []),
    ...(g.pingRoles.length ? ["", g.pingRoles.map((id) => `<@&${id}>`).join(" ")] : []),
  ].join("\n");
}

export function renderGamePost(g: PostGame): GamePost {
  const unix = Math.floor(new Date(g.startsAt).getTime() / 1000);
  const about = [`Карта: ${g.mission.mapLabel}`, g.mission.authors.length ? `Автор: ${g.mission.authors.join(", ")}` : null];
  const base = {
    content: header(g, unix),
    allowed_mentions: { roles: g.pingRoles },
    image: g.mission.coverUrl,
  };

  if (g.status === "cancelled") {
    return {
      ...base,
      embeds: [{ color: GREY, title: g.mission.name, description: "**Игра отменена**" }],
      components: [],
    };
  }

  if (g.status === "played") {
    return {
      ...base,
      embeds: [
        {
          color: GREY,
          title: g.mission.name,
          url: g.url,
          description: [`**Игра сыграна**${g.attended ? ` · играло ${g.attended}` : ""}`, ...about].filter(Boolean).join("\n"),
        },
      ],
      components: [{ type: 1, components: [{ type: 2, style: 5, label: "Итоги", url: g.url }] }],
    };
  }

  return {
    ...base,
    embeds: [
      {
        color: ACCENT,
        title: g.mission.name,
        url: g.url,
        description: [`<t:${unix}:R>`, ...about, g.plan ? `План: ${g.plan.code}` : null].filter(Boolean).join("\n"),
        fields: g.squads.map((sq) => ({
          name: [sq.groupId, sq.name].filter(Boolean).join(" "),
          value: sq.slots.map((s) => (s.player ? `✅ ${s.role} — **${s.player}**` : `⬜ ${s.role}`)).join("\n"),
        })),
      },
    ],
    components: [{ type: 1, components: [{ type: 2, style: 5, label: "Записаться", url: g.url }] }],
  };
}
