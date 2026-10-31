import Image from "next/image";
import { monthYear } from "@/lib/format";
import { plural, type Locale, type T } from "@/lib/i18n";
import type { Retro } from "@/lib/retro";
import { monthStart } from "@/lib/schedule";
import { Icon } from "../ui";

/**
 * The latest month's retrospective deck, above the feed calendar: a full-bleed portrait photo from the deck,
 * with the month and its cover numbers on a dark scrim at the bottom.
 */
export function RetroBanner({ retro, locale, t }: { retro: Retro; locale: Locale; t: T }) {
  const numbers = [
    plural(locale, "retro.games", retro.games),
    plural(locale, "retro.hours", retro.hours),
    plural(locale, "feed.players", retro.players),
  ];
  return (
    <a
      href={retro.url}
      target="_blank"
      rel="noreferrer noopener"
      className="group relative flex aspect-[9/10] shrink-0 flex-col justify-end overflow-hidden rounded-xl bg-surface"
    >
      <Image
        src={retro.image}
        alt=""
        width={600}
        height={667}
        className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-105"
      />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(to_top,var(--ts-color-bg-page)_20%,transparent)]" />
      <div className="relative flex flex-col gap-1 p-5">
        <span className="type-eyebrow text-fg-accent">{t("retro.eyebrow")}</span>
        <span className="type-heading-s text-fg">{monthYear(monthStart(retro.month).toISOString(), locale)}</span>
        <span className="type-body-s text-fg-secondary">{numbers.join(" · ")}</span>
        <span className="mt-2 inline-flex items-center gap-1 type-label-s text-fg-accent group-hover:underline">
          {t("retro.cta")}
          <Icon name="external-accent" />
        </span>
      </div>
    </a>
  );
}
