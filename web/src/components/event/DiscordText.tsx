import { Fragment, type ReactNode } from "react";
import { discordTimestamp } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import { onlyEmoji, parse, type Block, type Inline } from "@/lib/discord/markdown";

/** What a message needs to draw its markdown: who its mentions are, and the clock for <t:…:R>. */
export interface TextContext {
  names: Record<string, string>;
  now: Date;
  locale: Locale;
  /** Shown for a mention the hub can't name, and for a channel link. */
  unknown: { member: string; role: string; channel: string };
}

const emojiUrl = (n: Extract<Inline, { t: "emoji" }>, size: number) =>
  `https://cdn.discordapp.com/emojis/${n.id}.${n.animated ? "gif" : "webp"}?size=${size}`;

function inlines(nodes: Inline[], cx: TextContext, big = false): ReactNode {
  return nodes.map((n, i) => {
    switch (n.t) {
      case "text":
        return <Fragment key={i}>{n.v}</Fragment>;
      case "b":
        return <strong key={i} className="font-semibold text-fg">{inlines(n.c, cx)}</strong>;
      case "i":
        return <em key={i}>{inlines(n.c, cx)}</em>;
      case "u":
        return <u key={i}>{inlines(n.c, cx)}</u>;
      case "s":
        return <s key={i}>{inlines(n.c, cx)}</s>;
      case "spoiler":
        // Hidden until hovered or tapped (focus).
        return (
          <span key={i} tabIndex={0} className="cursor-pointer rounded-xs bg-raised-hover text-transparent transition-colors hover:bg-raised hover:text-fg-body focus:bg-raised focus:text-fg-body focus:outline-none">
            {inlines(n.c, cx)}
          </span>
        );
      case "code":
        return <code key={i} className="rounded-xs bg-inset px-1 py-px font-mono">{n.v}</code>;
      case "link":
        return (
          <a key={i} href={n.url} target="_blank" rel="noreferrer noopener" className="break-all text-fg-accent hover:underline">
            {inlines(n.c, cx)}
          </a>
        );
      case "mention":
        return (
          <span key={i} className="rounded-xs bg-accent-subtle px-0.5 text-fg-accent">
            @{cx.names[n.id] ?? (n.id.startsWith("&") ? cx.unknown.role : cx.unknown.member)}
          </span>
        );
      case "channel":
        return <span key={i} className="rounded-xs bg-accent-subtle px-0.5 text-fg-accent">#{cx.unknown.channel}</span>;
      case "emoji":
        return (
          // eslint-disable-next-line @next/next/no-img-element -- Discord's emoji CDN, any size: next/image adds nothing here
          <img key={i} src={emojiUrl(n, big ? 96 : 48)} alt={`:${n.name}:`} title={`:${n.name}:`} className={`inline-block overflow-hidden align-[-0.3em] ${big ? "size-12" : "size-5"}`} />
        );
      case "time":
        return (
          <time key={i} dateTime={new Date(n.unix * 1000).toISOString()} className="rounded-xs bg-raised px-1">
            {discordTimestamp(n.unix, n.style, cx.now, cx.locale)}
          </time>
        );
    }
  });
}

function blocks(list: Block[], cx: TextContext, big: boolean): ReactNode {
  return list.map((b, i) => {
    switch (b.t) {
      case "p":
        return <p key={i} className="whitespace-pre-wrap break-words">{inlines(b.c, cx, big)}</p>;
      case "pre":
        return (
          <pre key={i} className="overflow-x-auto whitespace-pre rounded-md border border-line bg-inset p-3 font-mono text-fg-body">
            {b.v}
          </pre>
        );
      case "quote":
        return (
          <blockquote key={i} className="flex flex-col gap-1 border-l-4 border-line-strong pl-3">
            {blocks(b.c, cx, false)}
          </blockquote>
        );
      case "h":
        return (
          <p key={i} className={`${["", "type-heading-s", "type-heading-xs", "type-heading-xxs"][b.level]} text-fg`}>
            {inlines(b.c, cx)}
          </p>
        );
      case "small":
        return <p key={i} className="type-caption text-fg-tertiary">{inlines(b.c, cx)}</p>;
      case "list": {
        const List = b.ordered ? "ol" : "ul";
        return (
          <List key={i} start={b.ordered ? b.start : undefined} className={`flex flex-col gap-0.5 pl-5 ${b.ordered ? "list-decimal" : "list-disc"}`}>
            {b.items.map((item, j) => (
              <li key={j} className="break-words">{inlines(item, cx)}</li>
            ))}
          </List>
        );
      }
    }
  });
}

/** A Discord message's text, drawn with the hub's type styles (lib/discord/markdown.ts reads it). */
export function DiscordText({ text, cx, className = "" }: { text: string; cx: TextContext; className?: string }) {
  const parsed = parse(text);
  if (!parsed.length) return null;
  return <div className={`flex flex-col gap-1.5 ${className}`}>{blocks(parsed, cx, onlyEmoji(parsed))}</div>;
}
