import type { DiscordMessage } from "./api";

/*
 * THE POST TEMPLATE. A game's Discord announcement is renderGamePost(game): edit this file to change how it looks.
 * It's a pure function of PostGame, re-run on every change, and the hub edits the post only when the result differs.
 *
 * Galaxy's layout (2026-10-09), after the announcements posted by hand until now:
 *   message text  # Что | Operation <name> / # Когда | <date> / За кого, Против кого / the briefing's first
 *                 paragraph / # Полный брифинг и слоты (link) / @Анонсы @Reforger
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
    /** The briefing's sections, as authored (plain text: blank lines split paragraphs, "- " lines are list items). */
    briefing: { title: string; body: string }[];
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

/** Text from the catalogue shown as typed: Discord's markdown characters escaped. */
const plain = (s: string) => s.replace(/([\\*_~`|<>[\]])/g, "\\$1").replace(/^([#>-])/, "\\$1");

/** About as much briefing as the teaser shows; a longer first paragraph is cut at a word. */
const TEASER_MAX = 600;

/**
 * The briefing's first paragraph (usually the start of «Ситуация»), ending in «…» to lead to the full briefing.
 * List items don't count as a paragraph. null when the briefing has no text.
 */
function teaser(sections: PostGame["mission"]["briefing"]): string | null {
  for (const s of sections) {
    for (const para of s.body.split(/\n\s*\n/)) {
      const lines = para.split("\n").map((l) => l.trim()).filter(Boolean);
      if (!lines.length || lines.every((l) => l.startsWith("- "))) continue;
      let text = lines.filter((l) => !l.startsWith("- ")).join(" ").replace(/\s+/g, " ");
      if (text.length > TEASER_MAX) text = text.slice(0, text.lastIndexOf(" ", TEASER_MAX) > 0 ? text.lastIndexOf(" ", TEASER_MAX) : TEASER_MAX);
      return `${text.replace(/[\s.,;:!?…—-]+$/, "")}…`;
    }
  }
  return null;
}

/**
 * The big link under the briefing: to the briefing and slots before the game, to the results after it. A cancelled
 * game's page is gone, so it has none. A heading-sized link stands in for a bright button (bots' link buttons are
 * always grey); <url> in a masked link keeps Discord from adding its own preview card for the hub page; 👉 is the
 * character itself, since Discord turns ":point_right:" into an emoji only as a person types it.
 */
function bigLink(g: PostGame): string | null {
  if (g.status === "scheduled") return `# 👉 [Полный брифинг и слоты](<${g.url}#briefing>)`;
  if (g.status === "played") return `# 👉 [Итоги игры](<${g.url}>)`;
  return null;
}

/**
 * The message text: what and when, the sides, the briefing's start with a link to the rest, the pings. It ends with
 * an invisible line (Discord drops trailing blank lines) so the cover sits a little below the text.
 */
function header(g: PostGame, unix: number): string {
  const sides = g.mission.sides;
  const forSide = sides?.for?.trim();
  const against = sides?.against?.trim();
  const sideLines = [forSide && `**За кого:** ${plain(forSide)}`, against && `**Против кого:** ${plain(against)}`].filter(Boolean);
  const intro = teaser(g.mission.briefing);
  const link = bigLink(g);
  return [
    `# Что | Operation ${plain(g.mission.name)}`,
    `# Когда | <t:${unix}:F>`,
    ...(sideLines.length ? ["", ...sideLines] : []),
    ...(intro ? ["", plain(intro)] : []),
    ...(link ? [link] : []),
    ...(g.pingRoles.length ? ["", g.pingRoles.map((id) => `<@&${id}>`).join(" ")] : []),
    "\u200b",
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
