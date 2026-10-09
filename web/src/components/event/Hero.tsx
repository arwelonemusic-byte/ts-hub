import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { eventDay, time } from "@/lib/format";
import { mskDayKey } from "@/lib/schedule";
import type { Locale, T } from "@/lib/i18n";
import type { HubEvent } from "@/lib/types";
import { Cover, Icon, StatusChip } from "../ui";

/**
 * The mission cover, blurred and faded, behind the top of the page (Figma "Blurred_bg_cover").
 * Stretched edge to edge at the design's 1450:905 proportions, so it grows with the window;
 * the blur hides the upscaling. It overhangs the sides by 40px so the blur's soft edge is clipped.
 * The image is fully desaturated. The fade to the page colour is a fixed 905px (the design's box
 * height) whatever the width, so on wide screens the image doesn't reach further down the page.
 */
export function Backdrop({ coverUrl }: { coverUrl: string | null }) {
  if (!coverUrl) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute -inset-x-10 -top-[59px] aspect-[1450/905] overflow-hidden opacity-24 blur-[13.4px]"
    >
      <Image src={coverUrl} alt="" fill sizes="100vw" className="object-cover grayscale" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent,var(--ts-color-bg-page)_905px)]" />
    </div>
  );
}

/** Back link + cover | summary. `children` are the status boxes and action buttons. */
export function Hero({ ev, locale, t, children }: { ev: HubEvent; locale: Locale; t: T; children: ReactNode }) {
  const m = ev.mission;
  const upcoming = ev.status === "upcoming";
  return (
    <div className="relative flex w-full max-w-[1216px] flex-col gap-3">
      <Link
        href={`/events?date=${mskDayKey(ev.startsAt)}`}
        className="flex h-11 items-center gap-1.5 self-start type-label-s text-fg-secondary hover:text-fg"
      >
        <Icon name="chevron-left" />
        {t("event.back")}
      </Link>
      <div className="flex flex-col gap-10 lg:flex-row lg:items-center">
        <Cover
          mission={m}
          sizes="(min-width: 1024px) 588px, 100vw"
          noCoverLabel={t("past.noCover")}
          priority
          rounded={upcoming ? "rounded-xl" : "rounded-lg"}
          className="w-full lg:flex-1"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <StatusChip tone={upcoming ? "accent" : "neutral"}>{t(upcoming ? "event.status.upcoming" : "event.status.past")}</StatusChip>
            <span className="type-label-s text-fg">
              {eventDay(ev.startsAt, locale)} · {time(ev.startsAt)} {t("events.msk")}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="type-display-kicker text-fg-label">{t("event.kicker")}</span>
            <h1 className="type-display-event text-fg">{m.name}</h1>
          </div>
          <div className="flex flex-col gap-2">
            <span className="flex items-center gap-2 type-body-m text-fg-label">
              <Icon name="map-pin" />
              {m.mapLabel}
            </span>
            {m.authors.length > 0 && (
              <span className="flex items-center gap-2 type-body-m text-fg-label">
                <Icon name="user" />
                <span>
                  {t("event.author")}
                  <span className="text-fg-accent">{m.authors.join(", ")}</span>
                </span>
              </span>
            )}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Inset stat box used in the hero (slots, plan, attendance, duration). */
export function HeroBox({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-lg bg-inset px-4 py-3">{children}</div>;
}
