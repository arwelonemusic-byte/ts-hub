import Image from "next/image";
import Link from "next/link";
import { Avatar } from "@/components/event/Avatar";
import { shortDay, time } from "@/lib/format";
import { mapPageUrl } from "@/lib/fix-and-flank/game";
import type { FnfActivity } from "@/lib/fix-and-flank/types";
import { format, plural, type Locale, type T } from "@/lib/i18n";

/**
 * «Активность» (the game page's side rail): who won or lost which map, new records and new maps, newest first.
 * «Prais777 прошёл карту Лесная дорога за 16 ходов».
 */
export function ActivityPanel({ items, now, locale, t }: { items: FnfActivity[]; now: Date; locale: Locale; t: T }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl bg-inset p-5">
      <h2 className="type-heading-xs text-fg">{t("fnf.activity")}</h2>
      {items.length ? (
        <ol className="flex flex-col">
          {items.map((a) => (
            <li key={a.id} className="flex gap-3 border-t border-line py-3 first:border-t-0 first:pt-0">
              <Avatar name={a.player} src={a.avatar} size={32} />
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="type-body-s text-fg-body">
                  <span className="type-label-s text-fg">{a.player}</span> {t(`fnf.act.${a.kind}`)}{" "}
                  <Link href={mapPageUrl(a.map.id)} className="text-fg-accent hover:underline">
                    {a.map.name}
                  </Link>
                  {(a.kind === "won" || a.kind === "record") && a.turns !== undefined && (
                    <> {format(t("fnf.act.in"), { turns: plural(locale, "fnf.turns", a.turns) })}</>
                  )}
                  {a.kind === "record" && <Image src="/icons/medal-gold.svg" alt="" width={14} height={14} className="ml-1.5 inline-block align-[-2px]" />}
                </p>
                <span className="type-caption text-fg-tertiary">
                  {shortDay(a.at, now, locale)}, {time(a.at)}
                </span>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="type-body-s text-fg-secondary">{t("fnf.activity.empty")}</p>
      )}
    </section>
  );
}
