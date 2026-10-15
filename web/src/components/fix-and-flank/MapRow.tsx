import Image from "next/image";
import Link from "next/link";
import { buttonClass, Icon, StatusChip } from "@/components/ui";
import { shortDate } from "@/lib/format";
import { gameUrl, mapPageUrl, playUrl } from "@/lib/fix-and-flank/game";
import type { FnfMap } from "@/lib/fix-and-flank/types";
import { plural, type Locale, type T } from "@/lib/i18n";

/** «Сыграна 34 раза · Рекорд 13 ходов» (no record until someone has won it). */
export function mapStats(m: FnfMap, locale: Locale, t: T): string {
  const parts = [`${t("fnf.played")} ${m.plays ? plural(locale, "fnf.times", m.plays) : t("fnf.never")}`];
  if (m.record !== null) parts.push(`${t("fnf.record")} ${plural(locale, "fnf.turns", m.record)}`);
  return parts.join(" · ");
}

/** A map's still (16:10), or a plain box until it has one (a draft saved without a picture). */
export function MapThumb({ url, sizes, className, label }: { url: string | null; sizes: string; className: string; label: string }) {
  if (!url) {
    return <span className={`flex aspect-[16/10] items-center justify-center rounded-lg bg-page type-caption text-fg-tertiary ${className}`}>{label}</span>;
  }
  return <Image src={url} alt="" width={640} height={400} sizes={sizes} className={`aspect-[16/10] rounded-lg bg-page object-cover ${className}`} />;
}

/**
 * A map in the game page's lists (sketch: still on the left; date, name, author, Играть and Подробнее on the
 * right). A draft is its author's: «Черновик» and «Продолжить» (back to the editor) instead.
 * `canPlay` false (not a member): Играть goes to the login.
 */
export function MapRow({ map, canPlay, locale, t }: { map: FnfMap; canPlay: boolean; locale: Locale; t: T }) {
  const draft = map.status === "draft";
  // A draft opens in the editor, where its author goes on with it; a published map has its page.
  const href = draft ? gameUrl("editor", { draft: map.id }) : mapPageUrl(map.id);
  const Anchor = draft ? "a" : Link;
  return (
    <li className="flex flex-col gap-4 rounded-xl bg-inset p-3 sm:flex-row sm:items-center">
      <Anchor href={href} className="shrink-0">
        <MapThumb url={map.thumbUrl} sizes="(min-width: 640px) 224px, 100vw" className="w-full sm:w-56" label={t("fnf.noPreview")} />
      </Anchor>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="flex items-center gap-2 type-caption text-fg-tertiary">
          {draft && <StatusChip tone="neutral">{t("fnf.draft")}</StatusChip>}
          {shortDate(draft ? map.updatedAt : (map.publishedAt ?? map.createdAt))}
        </span>
        <Anchor href={href} className="truncate type-heading-xs text-fg hover:text-fg-accent">
          {map.name}
        </Anchor>
        <span className="flex items-center gap-2 type-body-s text-fg-secondary">
          <Icon name="user-muted" />
          {map.author}
        </span>
        {!draft && <span className="type-caption text-fg-tertiary">{mapStats(map, locale, t)}</span>}
        <div className="mt-1 flex flex-wrap gap-2">
          {draft ? (
            <a href={href} className={buttonClass("secondary", "s")}>
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
