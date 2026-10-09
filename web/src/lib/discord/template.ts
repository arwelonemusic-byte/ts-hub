import { eventDay, time } from "../format";
import type { DiscordMessage } from "./api";

/*
 * THE POST TEMPLATE. A game's Discord announcement is renderGamePost(game): edit this file to change how it looks.
 * It's a pure function of PostGame, re-run on every change, and the hub edits the post only when the result differs.
 * PLACEHOLDER until Galaxy's template: the slotting bot's layout (time above the title, a field per squad,
 * ✅ taken / ⬜ free) plus the cover and a «Записаться» link button to the game's page.
 *
 * Discord renders `<t:UNIX:F>` / `<t:UNIX:R>` in each reader's own time zone ("через 2 дня") in content, a
 * description or a field value, not in a title, author or footer. Limits (post.ts trims to them anyway):
 * title 256, description 4096, 25 fields of name 256 / value 1024, footer 2048, 6000 characters per embed.
 */

/** Everything a post can show (lib/discord/post.ts gathers it). URLs are absolute. */
export interface PostGame {
  status: "scheduled" | "cancelled" | "played";
  /** The game's page in the hub. */
  url: string;
  /** ISO start. */
  startsAt: string;
  mission: {
    name: string;
    mapLabel: string;
    authors: string[];
    tags: string[];
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
}

const ACCENT = 0xf4db50;
const GREY = 0x2e3439;

/**
 * Pinged when the post goes up (@Анонсы, @Reforger). Mentions only ping from the message text above the card, and
 * only on the first post: the hub's edits never ping again. allowed_mentions lets exactly these roles ping, so a
 * player's name in a slot can't. TS Hub Bot has «Mention @everyone, @here and All Roles» in #анонсы.
 */
const PING_ROLES = ["1211570718592991312", "1260874468641869894"];
const ping = { content: PING_ROLES.map((id) => `<@&${id}>`).join(" "), allowed_mentions: { roles: PING_ROLES } };

export function renderGamePost(g: PostGame): DiscordMessage {
  const unix = Math.floor(new Date(g.startsAt).getTime() / 1000);
  const when = `${eventDay(g.startsAt, "ru")} · ${time(g.startsAt)} МСК`;
  const about = [`Карта: ${g.mission.mapLabel}`, g.mission.authors.length ? `Автор: ${g.mission.authors.join(", ")}` : null];

  if (g.status === "cancelled") {
    return {
      ...ping,
      embeds: [{ color: GREY, author: { name: when }, title: g.mission.name, description: "**Игра отменена**" }],
      components: [],
    };
  }

  if (g.status === "played") {
    return {
      ...ping,
      embeds: [
        {
          color: GREY,
          author: { name: when },
          title: g.mission.name,
          url: g.url,
          description: [`**Игра сыграна**${g.attended ? ` · играло ${g.attended}` : ""}`, ...about].filter(Boolean).join("\n"),
          thumbnail: g.mission.coverUrl ? { url: g.mission.coverUrl } : undefined,
        },
      ],
      components: [{ type: 1, components: [{ type: 2, style: 5, label: "Итоги", url: g.url }] }],
    };
  }

  return {
    ...ping,
    embeds: [
      {
        color: ACCENT,
        author: { name: when },
        title: g.mission.name,
        url: g.url,
        description: [`<t:${unix}:R>`, ...about, g.plan ? `План: ${g.plan.code}` : null].filter(Boolean).join("\n"),
        fields: g.squads.map((sq) => ({
          name: [sq.groupId, sq.name].filter(Boolean).join(" "),
          value: sq.slots.map((s) => (s.player ? `✅ ${s.role} — **${s.player}**` : `⬜ ${s.role}`)).join("\n"),
        })),
        image: g.mission.coverUrl ? { url: g.mission.coverUrl } : undefined,
        footer: g.slotCount ? { text: `Записались: ${g.slotted} из ${g.slotCount}` } : undefined,
      },
    ],
    components: [{ type: 1, components: [{ type: 2, style: 5, label: "Записаться", url: g.url }] }],
  };
}
