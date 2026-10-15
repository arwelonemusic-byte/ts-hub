import Image from "next/image";
import Link from "next/link";
import { buttonClass, Eyebrow, Icon, StatusChip } from "@/components/ui";
import { shortDate } from "@/lib/format";
import { gameUrl, mapPageUrl, playUrl } from "@/lib/fix-and-flank/game";
import type { FnfMap } from "@/lib/fix-and-flank/types";
import { plural, type Locale, type T } from "@/lib/i18n";

/** A map's still (16:10), or a plain box until it has one (a draft saved without a picture). */
export function MapThumb({ url, sizes, className, label }: { url: string | null; sizes: string; className: string; label: string }) {
  if (!url) {
    return <span className={`flex aspect-[16/10] items-center justify-center rounded-lg bg-page type-caption text-fg-tertiary ${className}`}>{label}</span>;
  }
  return <Image src={url} alt="" width={640} height={400} sizes={sizes} className={`aspect-[16/10] rounded-lg bg-page object-cover ${className}`} />;
}

/**
 * A map in the game page's «Карты» (the user's design, 2026-10-15): the still on the left; date, author and «Вы играли»
 * (the viewer has finished a run on it), the name, «Сыграна» and «Рекорд», then Играть and Подробнее. A draft is its
 * author's: «Черновик», no stats, and «Продолжить» (back to the editor). `canPlay` false (not a member): Играть goes
 * to the login.
 */
export function MapCard({ map, played, canPlay, locale, t }: { map: FnfMap; played: boolean; canPlay: boolean; locale: Locale; t: T }) {
  const draft = map.status === "draft";
  // A draft opens in the editor, where its author goes on with it; a published map has its page.
  const href = draft ? gameUrl("editor", { draft: map.id }) : mapPageUrl(map.id);
  const Anchor = draft ? "a" : Link;
  return (
    <li className="flex flex-col gap-4 rounded-xl bg-surface p-3 sm:flex-row sm:items-center sm:gap-5">
      <Anchor href={href} className="shrink-0">
        <MapThumb url={map.thumbUrl} sizes="(min-width: 640px) 288px, 100vw" className="w-full sm:w-72" label={t("fnf.noPreview")} />
      </Anchor>
      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:pr-2">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3 type-body-s text-fg-tertiary">
            <span className="shrink-0">{shortDate(draft ? map.updatedAt : (map.publishedAt ?? map.createdAt))}</span>
            <span className="flex min-w-0 items-center gap-1.5">
              <Icon name="user-muted" />
              <span className="truncate">{map.author}</span>
            </span>
            {draft ? (
              <span className="ml-auto">
                <StatusChip tone="neutral">{t("fnf.draft")}</StatusChip>
              </span>
            ) : (
              played && (
                <span className="ml-auto flex shrink-0 items-center gap-1.5 type-label-s text-fg-success">
                  <Icon name="check-circle" />
                  {t("fnf.youPlayed")}
                </span>
              )
            )}
          </div>
          <Anchor href={href} className="truncate type-heading-m text-fg hover:text-fg-accent">
            {map.name}
          </Anchor>
        </div>
        {!draft && (
          <div className="grid grid-cols-2 gap-2">
            <Stat label={t("fnf.played")} n={map.plays || null} text={map.plays ? plural(locale, "fnf.times", map.plays) : t("fnf.never")} />
            <Stat label={t("fnf.record")} n={map.record} text={map.record === null ? "—" : plural(locale, "fnf.turns", map.record)} />
          </div>
        )}
        <div className="flex gap-2">
          {draft ? (
            <a href={href} className={`${buttonClass("secondary", "s")} flex-1`}>
              <Icon name="pencil" />
              {t("fnf.continue")}
            </a>
          ) : (
            <>
              <a href={canPlay ? playUrl(map.id) : "/api/auth/login"} className={`${buttonClass("primary", "s")} flex-1`}>
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

/** «СЫГРАНА … 18 раз»: the label on the left, the value on the right with its number standing out. */
function Stat({ label, n, text }: { label: string; n: number | null; text: string }) {
  const at = n === null ? -1 : text.indexOf(String(n));
  return (
    <div className="flex h-11 min-w-0 items-center justify-between gap-3 rounded-md bg-inset px-4">
      <Eyebrow>{label}</Eyebrow>
      <span className="truncate type-body-s text-fg-secondary">
        {at < 0 ? (
          text
        ) : (
          <>
            {text.slice(0, at)}
            <span className="type-label-s text-fg">{n}</span>
            {text.slice(at + String(n).length)}
          </>
        )}
      </span>
    </div>
  );
}
