"use client";

import { useMemo, useState } from "react";
import type { FnfMap } from "@/lib/fix-and-flank/types";
import { makeT, type Locale } from "@/lib/i18n";
import { MapCard } from "./MapCard";

export type MapsTab = "fresh" | "popular" | "mine";
const TABS: MapsTab[] = ["fresh", "popular", "mine"];

/**
 * «Карты» on the game page: Свежие (newest published), Популярные (most played), Мои карты (the viewer's own,
 * drafts first). The heading, the tabs and each map's card sit on the page itself, not in a panel (the user's design,
 * 2026-10-15). The tab is in the URL (?tab=) so reload and Back keep it; switching doesn't reload the page.
 */
export function MapsSection({
  lists,
  played,
  initial,
  canPlay,
  signedIn,
  locale,
}: {
  lists: Record<MapsTab, FnfMap[]>;
  /** Ids of the maps the viewer has finished a run on. */
  played: string[];
  initial: MapsTab;
  canPlay: boolean;
  signedIn: boolean;
  locale: Locale;
}) {
  const t = useMemo(() => makeT(locale), [locale]);
  const playedSet = useMemo(() => new Set(played), [played]);
  const [tab, setTab] = useState<MapsTab>(initial);
  const pick = (next: MapsTab) => {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "fresh") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
  };
  const maps = lists[tab];
  const empty = tab === "mine" ? t(signedIn ? "fnf.mine.empty" : "fnf.mine.login") : t("fnf.pick.empty");
  return (
    <section className="flex flex-col gap-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="type-heading-l text-fg">{t("fnf.maps")}</h2>
        <div role="tablist" className="flex gap-1 rounded-lg bg-inset p-1">
          {TABS.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => pick(k)}
              className={`h-11 rounded-md px-3.5 type-label-s ${tab === k ? "bg-raised text-fg" : "text-fg-secondary hover:text-fg"}`}
            >
              {t(`fnf.tab.${k}`)}
            </button>
          ))}
        </div>
      </div>
      {maps.length ? (
        <ul className="flex flex-col gap-3">
          {maps.map((m) => (
            <MapCard key={m.id} map={m} played={playedSet.has(m.id)} canPlay={canPlay} locale={locale} t={t} />
          ))}
        </ul>
      ) : (
        <p className="rounded-xl bg-surface p-6 type-body-m text-fg-secondary">{empty}</p>
      )}
    </section>
  );
}
