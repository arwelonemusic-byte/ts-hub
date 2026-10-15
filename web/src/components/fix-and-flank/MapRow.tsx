import Image from "next/image";
import Link from "next/link";
import { buttonClass, Icon, StatusChip } from "@/components/ui";
import { shortDate } from "@/lib/format";
import { gameUrl, mapPageUrl, playUrl } from "@/lib/fix-and-flank/game";
import type { FnfMap } from "@/lib/fix-and-flank/types";
import { plural, type Locale, type T } from "@/lib/i18n";

/** «Сыграна 34 раза · Рекорд 13 ходов» (no record until someone has won it). */
export function mapStats(m: FnfMap, locale: Locale, t: T): string {
  const parts = [`${t("fnf.played")} ${plural(locale, "fnf.times", m.plays)}`];
  if (m.record !== null) parts.push(`${t("fnf.record")} ${plural(locale, "fnf.turns", m.record)}`);
  return parts.join(" · ");
}

/**
 * A map in the game page's lists (sketch: still on the left; date, name, author, Играть and Подробнее on the
 * right). A draft is its author's: «Черновик» and «Продолжить» (back to the editor) instead.
 * `canPlay` false (not a member): Играть goes to the login.
 */
export function MapRow({ map, canPlay, locale, t }: { map: FnfMap; canPlay: boolean; locale: Locale; t: T }) {
  const draft = map.status === "draft";
  return (
    <li className="flex flex-col gap-4 rounded-xl bg-inset p-3 sm:flex-row sm:items-center">
      <Link href={draft ? gameUrl("editor") : mapPageUrl(map.id)} className="shrink-0">
        <Image src={map.thumbUrl} alt="" width={640} height={400} sizes="(min-width: 640px) 224px, 100vw" className="aspect-[16/10] w-full rounded-lg bg-page object-cover sm:w-56" />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="flex items-center gap-2 type-caption text-fg-tertiary">
          {draft ? <StatusChip tone="neutral">{t("fnf.draft")}</StatusChip> : shortDate(map.publishedAt ?? map.createdAt)}
        </span>
        <Link href={draft ? gameUrl("editor") : mapPageUrl(map.id)} className="truncate type-heading-xs text-fg hover:text-fg-accent">
          {map.name}
        </Link>
        <span className="flex items-center gap-2 type-body-s text-fg-secondary">
          <Icon name="user-muted" />
          {map.author}
        </span>
        {!draft && <span className="type-caption text-fg-tertiary">{mapStats(map, locale, t)}</span>}
        <div className="mt-1 flex flex-wrap gap-2">
          {draft ? (
            <a href={gameUrl("editor")} className={buttonClass("secondary", "s")}>
              <Icon name="pencil" />
              {t("fnf.continue")}
            </a>
          ) : (
            <>
              <a href={canPlay ? playUrl(map.id) : "/api/auth/login"} className={buttonClass("primary", "s")}>
                <Icon name="play" />
                {t("fnf.play")}
              </a>
              <Link href={mapPageUrl(map.id)} className={buttonClass("secondary", "s")}>
                {t("fnf.details")}
              </Link>
            </>
          )}
        </div>
      </div>
    </li>
  );
}
