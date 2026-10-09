import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import type { FeedItem } from "@/lib/feed";
import { dayOfMonth, duration, eventDay, shortWeekday, time } from "@/lib/format";
import { plural, type Locale, type T } from "@/lib/i18n";
import { buttonClass, Cover, Icon, ProgressBar, StatusChip } from "../ui";

type Upcoming = Extract<FeedItem, { kind: "upcoming" }>;
type Played = Extract<FeedItem, { kind: "played" }>;

/** Figma "Week header" (8:23). */
export function WeekHeader({ title, label }: { title: string; label: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-line pb-3">
      <h2 className="type-heading-s text-fg">{title}</h2>
      <span className="type-eyebrow text-fg-tertiary">{label}</span>
    </div>
  );
}

/** Figma "Date block" (8:22): Highlight = next op, Muted = played or open slot. */
export function DateBlock({ iso, tone, locale }: { iso: string; tone: "default" | "highlight" | "muted"; locale: Locale }) {
  const c = {
    default: ["text-fg-tertiary", "text-fg", "text-fg-secondary"],
    highlight: ["text-fg-accent", "text-fg-accent", "text-fg"],
    muted: ["text-fg-tertiary", "text-fg-tertiary", "text-fg-tertiary"],
  }[tone];
  return (
    <div className="flex w-14 shrink-0 flex-col items-center">
      <span className={`type-eyebrow ${c[0]}`}>{shortWeekday(iso, locale)}</span>
      <span className={`type-heading-number ${c[1]}`}>{dayOfMonth(iso)}</span>
      <span className={`type-caption ${c[2]}`}>{time(iso)}</span>
    </div>
  );
}

function Meta({ mission }: { mission: Upcoming["mission"] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 type-body-s text-fg-secondary">
      <span className="flex items-center gap-1.5">
        <Icon name="map-pin-muted" />
        {mission.mapLabel}
      </span>
      {mission.authors.length > 0 && (
        <span className="flex items-center gap-1.5">
          <Icon name={mission.authors.length > 1 ? "users-muted" : "user-muted"} />
          {mission.authors.join(", ")}
        </span>
      )}
    </div>
  );
}

/** Slots meter + plan status, side by side. */
function Status({ ev, t }: { ev: Upcoming; t: T }) {
  return (
    <div className="flex w-full gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-lg bg-inset px-4 py-3">
        <div className="flex items-baseline justify-between">
          <span className="type-eyebrow text-fg-tertiary">{t("feed.slots")}</span>
          <span className="type-body-s text-fg-secondary">
            <span className="type-label-s text-fg">{ev.taken}</span> / {ev.max}
          </span>
        </div>
        <ProgressBar value={ev.taken} max={ev.max} />
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg bg-inset px-4 py-3">
        <Icon name={ev.planReady ? "check-circle" : "plan-pending"} />
        <span className={`type-label-s ${ev.planReady ? "text-fg-success" : "text-fg"}`}>
          {t(ev.planReady ? "feed.plan.ready" : "feed.plan.awaiting")}
        </span>
      </div>
    </div>
  );
}

/**
 * Figma "Event card", Featured (13:98): the next op. The Подробнее link stretches over the
 * whole card, so clicking anywhere on it opens the event (one link, one tab stop).
 */
export function FeaturedCard({ ev, locale, t }: { ev: Upcoming; locale: Locale; t: T }) {
  return (
    <article className="relative flex min-w-0 flex-1 flex-col gap-6 rounded-xl bg-surface p-4 shadow-floating ring-line-strong hover:ring-1 md:flex-row md:items-center">
      <Cover mission={ev.mission} sizes="400px" noCoverLabel={t("past.noCover")} priority className="w-full shrink-0 md:w-[400px]" />
      <div className="flex min-w-0 flex-1 flex-col gap-3.5 py-1 pr-2">
        <div className="flex flex-wrap items-center gap-3">
          <StatusChip tone="accent">{t("event.status.upcoming")}</StatusChip>
          <span className="type-body-s text-fg-secondary">
            {eventDay(ev.startsAt, locale)} · {time(ev.startsAt)} {t("events.msk")}
          </span>
        </div>
        <h3 className="type-heading-xl text-fg">{ev.mission.name}</h3>
        <Meta mission={ev.mission} />
        <Status ev={ev} t={t} />
        <Link href={`/events/${ev.id}`} className={`${buttonClass("primary", "m")} w-full after:absolute after:inset-0 after:rounded-xl`}>
          {t("feed.details")}
          <Icon name="arrow-right-dark" />
        </Link>
      </div>
    </article>
  );
}

/** Figma "Event card", Upcoming (13:189). The whole card opens the event. */
export function UpcomingCard({ ev, locale, t }: { ev: Upcoming; locale: Locale; t: T }) {
  return (
    <Link
      href={`/events/${ev.id}`}
      className="flex min-w-0 flex-1 flex-col gap-5 rounded-xl bg-surface p-3 ring-line-strong hover:ring-1 sm:flex-row sm:items-center"
    >
      <Cover mission={ev.mission} sizes="288px" noCoverLabel={t("past.noCover")} className="w-full shrink-0 sm:w-[288px]" />
      <div className="flex min-w-0 flex-1 flex-col gap-2.5 py-1 pr-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="type-label-s text-fg">
            {eventDay(ev.startsAt, locale)} · {time(ev.startsAt)} {t("events.msk")}
          </span>
        </div>
        <h3 className="type-heading-m text-fg">{ev.mission.name}</h3>
        <Meta mission={ev.mission} />
        <Status ev={ev} t={t} />
      </div>
    </Link>
  );
}

/** Figma "Played row" (13:75). The title link stretches over the row; the replay button sits above it. */
export function PlayedRow({ ev, locale, t }: { ev: Played; locale: Locale; t: T }) {
  return (
    <article className="relative flex min-w-0 flex-1 items-center gap-4 rounded-xl bg-inset p-3 ring-line-strong hover:ring-1">
      <Cover mission={ev.mission} sizes="112px" noCoverLabel="" rounded="rounded-md" className="w-28 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <StatusChip tone="neutral">{t("event.status.past")}</StatusChip>
        <Link href={`/events/${ev.id}`} className="truncate type-heading-xs text-fg after:absolute after:inset-0">
          {ev.mission.name}
        </Link>
        <span className="truncate type-caption text-fg-secondary">
          {ev.mission.mapLabel} · {plural(locale, "feed.players", ev.attended)} · {duration(ev.durationMin, locale)}
        </span>
      </div>
      {ev.replayHref && (
        <a
          href={ev.replayHref}
          target="_blank"
          rel="noreferrer"
          className={`${buttonClass("secondary", "m")} relative z-10 hidden sm:inline-flex`}
        >
          <Icon name="play-light" />
          {t("feed.replay")}
        </a>
      )}
    </article>
  );
}

/** Figma "Open slot" (13:347): a usual slot with no mission picked yet. */
export function OpenSlot({ t }: { t: T }) {
  return (
    <div className="flex h-[76px] min-w-0 flex-1 flex-col justify-center gap-0.5 rounded-xl border border-dashed border-line-strong px-5 py-4">
      <span className="type-label-m text-fg-label">{t("feed.open.title")}</span>
      <span className="type-caption text-fg-tertiary">{t("feed.open.detail")}</span>
    </div>
  );
}

/** One feed row: date block + the card for its kind. */
export function FeedRow({ item, nextId, locale, t }: { item: FeedItem; nextId: string | null; locale: Locale; t: T }) {
  const featured = item.kind === "upcoming" && item.id === nextId;
  let body: ReactNode;
  if (item.kind === "open") body = <OpenSlot t={t} />;
  else if (item.kind === "played") body = <PlayedRow ev={item} locale={locale} t={t} />;
  else body = featured ? <FeaturedCard ev={item} locale={locale} t={t} /> : <UpcomingCard ev={item} locale={locale} t={t} />;
  return (
    <div className={`flex gap-4 ${item.kind === "open" ? "items-center" : "items-start"}`}>
      <div className={item.kind === "open" ? "" : "pt-2.5"}>
        <DateBlock iso={item.startsAt} tone={featured ? "highlight" : item.kind === "upcoming" ? "default" : "muted"} locale={locale} />
      </div>
      {body}
    </div>
  );
}

export function Dot({ name, size = 5 }: { name: string; size?: 5 | 6 }) {
  return <Image src={`/icons/${name}.svg`} alt="" width={size} height={size} className="shrink-0" />;
}
