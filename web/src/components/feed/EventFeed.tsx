"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { FeedItem, FeedMeta, FeedMonth } from "@/lib/feed";
import { dayRange, monthYear } from "@/lib/format";
import { makeT, plural, type Locale, type T } from "@/lib/i18n";
import { addMonths, daysInMonth, monthOf, monthStart, mskDayKey, mskParts, weekStart, type MonthKey } from "@/lib/schedule";
import { FeedCalendar } from "./Calendar";
import { FeedRow, WeekHeader } from "./Cards";

/** App header (60px) + 24px: the line that counts as "the top of the feed". */
const TOP = 84;
const DAY_MS = 86_400_000;
/** Start loading a neighbouring month this far before its edge scrolls into view. */
const PRELOAD_MARGIN = "800px 0px";

type Dir = "prev" | "next";
type Target = { month: MonthKey; day?: string };

/** Weeks of one month, clipped to it (a week spanning two months shows up in both). */
function weeksOf(m: FeedMonth, now: Date, locale: Locale, t: T) {
  const groups = new Map<number, FeedItem[]>();
  for (const it of m.items) {
    const ws = weekStart(new Date(it.startsAt)).getTime();
    const g = groups.get(ws);
    if (g) g.push(it);
    else groups.set(ws, [it]);
  }
  const thisWeek = weekStart(now).getTime();
  const monthIso = monthStart(m.month).toISOString();
  return [...groups].map(([ws, items]) => {
    const mon = new Date(ws);
    const sun = new Date(ws + 6 * DAY_MS);
    const from = monthOf(mon) === m.month ? mskParts(mon).day : 1;
    const to = monthOf(sun) === m.month ? mskParts(sun).day : daysInMonth(m.month);
    const n = Math.round((ws - thisWeek) / (7 * DAY_MS));
    const label =
      n === 0 ? t("feed.week.this")
      : n === 1 ? t("feed.week.next")
      : n === -1 ? t("feed.week.last")
      : n > 1 ? plural(locale, "feed.week.later", n)
      : plural(locale, "feed.week.ago", -n);
    return { key: `${m.month}-${ws}`, title: dayRange(from, to, monthIso, locale), label, items };
  });
}

const itemKey = (it: FeedItem) => (it.kind === "open" ? `open-${it.startsAt}` : it.id);

/**
 * Top/bottom edge of the loaded range: the auto-load trigger, plus loading / retry state.
 * Fixed height, so the status text appearing above the viewport can't nudge the feed.
 */
function Edge({ edgeRef, loading, failed, onRetry, t }: { edgeRef: RefObject<HTMLDivElement | null>; loading: boolean; failed: boolean; onRetry: () => void; t: T }) {
  return (
    <div ref={edgeRef} className="flex h-8 items-center justify-center">
      {loading && <span className="type-caption text-fg-tertiary">{t("feed.loading")}</span>}
      {failed && (
        <span className="flex items-center gap-2 type-caption text-fg-tertiary">
          {t("feed.error")}
          <button type="button" onClick={onRetry} className="type-caption-strong text-fg-accent hover:underline">
            {t("feed.retry")}
          </button>
        </span>
      )}
    </div>
  );
}

/**
 * One chronological feed of played ops, scheduled ops and open slots. Lands on the
 * next op, loads neighbouring months as you scroll, and keeps the calendar in step:
 * the calendar shows the month at the top of the feed, and clicking it jumps the feed.
 */
export function EventFeed({ initial, meta, anchorDay, locale }: { initial: FeedMonth[]; meta: FeedMeta; anchorDay: string | null; locale: Locale }) {
  const t = useMemo(() => makeT(locale), [locale]);
  const now = useMemo(() => new Date(meta.now), [meta.now]);

  const [months, setMonths] = useState(initial);
  const [busy, setBusy] = useState<Dir | null>(null);
  const [failed, setFailed] = useState<Dir | null>(null);
  const [activeDay, setActiveDay] = useState<string | null>(anchorDay);
  const [calMonth, setCalMonth] = useState<MonthKey>(anchorDay?.slice(0, 7) ?? initial[0].month);

  // Handlers run after awaits, so they read the latest list from a ref, not a stale closure.
  const monthsRef = useRef(months);
  const busyRef = useRef(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  /** Page height + scroll position just before months are prepended, to keep the view still. */
  const prepended = useRef<{ h: number; y: number } | null>(null);
  /** A jump waiting for its month to load. */
  const pending = useRef<Target | null>(null);
  /** While a jump scrolls, the calendar stays on the target month instead of flicking through. */
  const lock = useRef<MonthKey | null>(null);

  const first = months[0].month;
  const last = months[months.length - 1].month;

  const scrollTo = useCallback((target: Target) => {
    const feed = feedRef.current;
    if (!feed) return;
    const el = target.day
      ? [...feed.querySelectorAll<HTMLElement>("[data-feed-date]")].find((r) => r.dataset.feedDate! >= target.day!)
      : feed.querySelector<HTMLElement>(`[data-month-section="${target.month}"]`);
    if (!el) return;
    lock.current = target.month;
    const release = () => (lock.current = null);
    window.addEventListener("scrollend", release, { once: true });
    setTimeout(release, 1500);
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  /** Load months towards `until` (default: one month) in one direction. Resolves to success. */
  const load = useCallback(
    async (dir: Dir, until?: MonthKey, force = false): Promise<boolean> => {
      if (busyRef.current || (failed === dir && !force)) return false;
      const list = monthsRef.current;
      const edge = dir === "prev" ? list[0].month : list[list.length - 1].month;
      let from = dir === "prev" ? (until ?? addMonths(edge, -1)) : addMonths(edge, 1);
      let to = dir === "prev" ? addMonths(edge, -1) : (until ?? addMonths(edge, 1));
      if (from < meta.first) from = meta.first;
      if (to > meta.last) to = meta.last;
      if (from > to) return false;

      busyRef.current = true;
      setBusy(dir);
      setFailed(null);
      try {
        const res = await fetch(`/api/feed?from=${from}&to=${to}`);
        if (!res.ok) throw new Error(String(res.status));
        const got: FeedMonth[] = (await res.json()).months;
        const next = dir === "prev" ? [...got, ...monthsRef.current] : [...monthsRef.current, ...got];
        if (dir === "prev") prepended.current = { h: document.documentElement.scrollHeight, y: window.scrollY };
        monthsRef.current = next;
        setMonths(next);
        return true;
      } catch {
        setFailed(dir);
        return false;
      } finally {
        busyRef.current = false;
        setBusy(null);
      }
    },
    [failed, meta.first, meta.last],
  );

  const jumpTo = useCallback(
    async (month: MonthKey, day?: string) => {
      if (month < meta.first) month = meta.first;
      if (month > meta.last) month = meta.last;
      lock.current = month;
      setCalMonth(month);
      if (day) setActiveDay(day);
      const list = monthsRef.current;
      const target = { month, day };
      if (month >= list[0].month && month <= list[list.length - 1].month) {
        scrollTo(target);
        return;
      }
      pending.current = target;
      const ok = await load(month < list[0].month ? "prev" : "next", month, true);
      if (!ok) pending.current = null;
    },
    [load, meta.first, meta.last, scrollTo],
  );

  // After months change: keep the view still if we prepended, then run any waiting jump.
  useLayoutEffect(() => {
    if (prepended.current) {
      const { h, y } = prepended.current;
      prepended.current = null;
      window.scrollTo(0, y + document.documentElement.scrollHeight - h);
    }
    if (pending.current) {
      const target = pending.current;
      pending.current = null;
      scrollTo(target);
    }
  }, [months, scrollTo]);

  // Land on the anchor (the next op by default). A passive effect runs after Next's own
  // layout-phase scroll-to-top on navigation, so this wins. (Not rAF: it stalls in hidden tabs.)
  // Declared before the tracking / loading effects, so they start from the landed position.
  useEffect(() => {
    const root = document.documentElement;
    const anchor = root.style.overflowAnchor;
    // We compensate prepends by hand; the browser's scroll anchoring would double it.
    root.style.overflowAnchor = "none";
    const rows = feedRef.current?.querySelectorAll<HTMLElement>("[data-feed-date]") ?? [];
    const el = anchorDay ? [...rows].find((r) => r.dataset.feedDate! >= anchorDay) : null;
    el?.scrollIntoView({ block: "start" });
    return () => {
      root.style.overflowAnchor = anchor;
    };
  }, [anchorDay]);

  // Track the row at the top of the feed: it drives the calendar and the ?date= in the URL.
  useEffect(() => {
    let raf = 0;
    let urlTimer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      raf = 0;
      const rows = feedRef.current?.querySelectorAll<HTMLElement>("[data-feed-date]");
      if (!rows?.length) return;
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      // A row counts as "at the top" once less than a sliver of the one above it is left.
      const hit = atBottom ? rows[rows.length - 1] : ([...rows].find((r) => r.getBoundingClientRect().bottom > TOP + 24) ?? rows[rows.length - 1]);
      const day = hit.dataset.feedDate!;
      setActiveDay(day);
      if (!lock.current) setCalMonth(day.slice(0, 7));
      // Keep the URL on what's in view, so reload and Back return here.
      clearTimeout(urlTimer);
      urlTimer = setTimeout(() => {
        const url = new URL(window.location.href);
        if (day === meta.nextDay) url.searchParams.delete("date");
        else url.searchParams.set("date", day);
        window.history.replaceState(null, "", url);
      }, 400);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
      clearTimeout(urlTimer);
    };
  }, [meta.nextDay]);

  // Auto-load neighbours near the edges. Re-observed on every change, so a short month
  // that leaves the edge in range immediately pulls the next one.
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          void load(e.target === topRef.current ? "prev" : "next");
        }
      },
      { rootMargin: PRELOAD_MARGIN },
    );
    if (topRef.current) io.observe(topRef.current);
    if (bottomRef.current) io.observe(bottomRef.current);
    return () => io.disconnect();
  }, [months, load]);

  const itemsByDay = useMemo(() => {
    const map = new Map<string, FeedItem[]>();
    for (const m of months)
      for (const it of m.items) {
        const d = mskDayKey(it.startsAt);
        const g = map.get(d);
        if (g) g.push(it);
        else map.set(d, [it]);
      }
    return map;
  }, [months]);

  const retryPrev = useCallback(() => void load("prev", undefined, true), [load]);
  const retryNext = useCallback(() => void load("next", undefined, true), [load]);

  return (
    <div className="flex items-start gap-8">
      <div ref={feedRef} className="flex min-w-0 flex-1 flex-col gap-10">
        {first > meta.first && <Edge edgeRef={topRef} loading={busy === "prev"} failed={failed === "prev"} onRetry={retryPrev} t={t} />}
        {months.map((m) => (
          <section key={m.month} data-month-section={m.month} className="flex scroll-mt-[84px] flex-col gap-10">
            {m.items.length === 0 ? (
              <div data-feed-date={`${m.month}-01`} className="flex scroll-mt-[84px] flex-col gap-3">
                <WeekHeader title={monthYear(monthStart(m.month).toISOString(), locale)} label="" />
                <p className="type-body-s text-fg-tertiary">{t("feed.emptyMonth")}</p>
              </div>
            ) : (
              weeksOf(m, now, locale, t).map((w) => (
                <div key={w.key} className="flex flex-col gap-3">
                  <WeekHeader title={w.title} label={w.label} />
                  {w.items.map((it) => (
                    <div key={itemKey(it)} data-feed-date={mskDayKey(it.startsAt)} className="scroll-mt-[84px]">
                      <FeedRow item={it} nextId={meta.nextId} locale={locale} t={t} />
                    </div>
                  ))}
                </div>
              ))
            )}
          </section>
        ))}
        {last < meta.last && <Edge edgeRef={bottomRef} loading={busy === "next"} failed={failed === "next"} onRetry={retryNext} t={t} />}
      </div>
      <aside className="sticky top-[84px] hidden w-[300px] shrink-0 lg:block">
        <FeedCalendar
          month={calMonth}
          itemsByDay={itemsByDay}
          today={meta.today}
          nextDay={meta.nextDay}
          activeDay={activeDay}
          canPrev={calMonth > meta.first}
          canNext={calMonth < meta.last}
          onMonth={(d) => void jumpTo(addMonths(calMonth, d))}
          onPickDay={(day) => void jumpTo(day.slice(0, 7), day)}
          locale={locale}
          t={t}
        />
      </aside>
    </div>
  );
}
