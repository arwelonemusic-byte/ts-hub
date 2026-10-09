import Image from "next/image";
import type { FeedItem } from "@/lib/feed";
import { monthYear, shortWeekday } from "@/lib/format";
import type { Locale, T } from "@/lib/i18n";
import { monthGrid, monthStart, USUAL_SLOTS, type MonthKey } from "@/lib/schedule";
import { Dot } from "./Cards";

type DayState = "default" | "muted" | "played" | "today" | "next" | "planned" | "open" | "mutedPlayed" | "mutedOpen";

/** Figma "Calendar day" (6:159) states → number style, cell style, dot asset. */
const STYLE: Record<DayState, { num: string; cell: string; dot: string }> = {
  default: { num: "type-body-s text-fg-body", cell: "", dot: "dot-none" },
  muted: { num: "type-body-s text-fg-faint", cell: "", dot: "dot-none" },
  played: { num: "type-body-s text-fg-secondary", cell: "", dot: "dot-played" },
  today: { num: "type-label-s text-fg", cell: "bg-raised", dot: "dot-none" },
  next: { num: "type-label-s text-fg-accent", cell: "border border-line-accent bg-accent-subtle", dot: "dot-planned" },
  planned: { num: "type-label-s text-fg", cell: "", dot: "dot-planned" },
  open: { num: "type-body-s text-fg-body", cell: "", dot: "dot-open" },
  mutedPlayed: { num: "type-body-s text-fg-faint", cell: "", dot: "dot-muted-played" },
  mutedOpen: { num: "type-body-s text-fg-faint", cell: "", dot: "dot-muted-open" },
};

function stateOf(day: string, inMonth: boolean, items: FeedItem[] | undefined, today: string, nextDay: string | null): DayState {
  const played = items?.some((i) => i.kind === "played");
  const ahead = items?.some((i) => i.kind !== "played");
  if (!inMonth) return played ? "mutedPlayed" : ahead ? "mutedOpen" : "muted";
  if (day === nextDay) return "next";
  if (day === today) return "today";
  if (items?.some((i) => i.kind === "upcoming")) return "planned";
  if (played) return "played";
  if (ahead) return "open";
  return "default";
}

/** Midday MSK of a day key, as an ISO instant (safe to format in any time zone). */
const noon = (day: string) => new Date(`${day}T12:00:00+03:00`).toISOString();
/** Column index (Mon = 0) of the usual op days, highlighted in the weekday row. */
const OP_DAYS = new Set<number>(USUAL_SLOTS.map((s) => (s.weekday + 6) % 7));

/**
 * Figma "Calendar" (13:368). Follows the feed: shows the month in view and rings the
 * day at the top of the feed. Days with an op jump to it; arrows jump a month.
 */
export function FeedCalendar({
  month,
  itemsByDay,
  today,
  nextDay,
  activeDay,
  canPrev,
  canNext,
  onMonth,
  onPickDay,
  locale,
  t,
}: {
  month: MonthKey;
  itemsByDay: Map<string, FeedItem[]>;
  today: string;
  nextDay: string | null;
  activeDay: string | null;
  canPrev: boolean;
  canNext: boolean;
  onMonth: (delta: -1 | 1) => void;
  onPickDay: (day: string) => void;
  locale: Locale;
  t: T;
}) {
  const days = monthGrid(month);
  const weeks = Array.from({ length: days.length / 7 }, (_, w) => days.slice(w * 7, w * 7 + 7));
  const navBtn = "flex size-11 items-center justify-center rounded-lg bg-raised hover:bg-raised-hover disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <section className="flex flex-col gap-4 rounded-xl bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="type-heading-xs text-fg" aria-live="polite">
          {monthYear(monthStart(month).toISOString(), locale)}
        </h2>
        <div className="flex gap-1">
          <button type="button" className={navBtn} onClick={() => onMonth(-1)} disabled={!canPrev} aria-label={t("calendar.prev")}>
            <Image src="/icons/chevron-left-nav.svg" alt="" width={16} height={16} />
          </button>
          <button type="button" className={navBtn} onClick={() => onMonth(1)} disabled={!canNext} aria-label={t("calendar.next")}>
            <Image src="/icons/chevron-right-nav.svg" alt="" width={16} height={16} />
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-0.5">
        <div className="flex gap-0.5">
          {weeks[0].map((day, i) => (
            <span key={day} className={`flex-1 text-center type-eyebrow ${OP_DAYS.has(i) ? "text-fg-accent" : "text-fg-tertiary"}`}>
              {shortWeekday(noon(day), locale)}
            </span>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0]} className="flex gap-0.5">
            {week.map((day) => {
              const items = itemsByDay.get(day);
              const st = STYLE[stateOf(day, day.startsWith(month), items, today, nextDay)];
              const active = day === activeDay;
              const cls = `flex h-10 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg ${st.cell} ${
                active ? "ring-1 ring-line-outline" : ""
              }`;
              const body = (
                <>
                  <span className={st.num}>{Number(day.slice(8))}</span>
                  <Dot name={st.dot} />
                </>
              );
              return items ? (
                <button key={day} type="button" onClick={() => onPickDay(day)} className={`${cls} hover:bg-raised-hover`} aria-current={active ? "date" : undefined}>
                  {body}
                </button>
              ) : (
                <div key={day} className={cls}>
                  {body}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {(
          [
            ["legend-planned", "calendar.legend.planned"],
            ["legend-open", "calendar.legend.open"],
            ["legend-played", "calendar.legend.played"],
          ] as const
        ).map(([dot, key]) => (
          <span key={key} className="flex items-center gap-1.5 type-caption text-fg-secondary">
            <Dot name={dot} size={6} />
            {t(key)}
          </span>
        ))}
      </div>
    </section>
  );
}
