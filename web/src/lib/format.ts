import type { Locale } from "./i18n";
import { TIME_ZONE } from "./schedule";

const tag = (l: Locale) => (l === "ru" ? "ru-RU" : "en-GB");

const fmt = (l: Locale, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(tag(l), { timeZone: TIME_ZONE, ...opts });

/** "Sunday 11 October" */
export function longDay(iso: string, l: Locale): string {
  return fmt(l, { weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
}

/** "Sun" */
export function shortWeekday(iso: string, l: Locale): string {
  return fmt(l, { weekday: "short" }).format(new Date(iso));
}

/** "11" */
export function dayOfMonth(iso: string): string {
  return fmt("en", { day: "numeric" }).format(new Date(iso));
}

/** "19:00" */
export function time(iso: string): string {
  return fmt("en", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

/** "Октябрь 2026" (no "г." suffix that ru-RU adds). */
export function monthYear(iso: string, l: Locale): string {
  const d = new Date(iso);
  const s = `${fmt(l, { month: "long" }).format(d)} ${fmt(l, { year: "numeric" }).format(d).replace(/\D/g, "")}`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "5 – 11 октября", or "1 ноября" for a one-day range. Both days are in `iso`'s month. */
export function dayRange(a: number, b: number, iso: string, l: Locale): string {
  const month = fmt(l, { day: "numeric", month: "long" }).format(new Date(iso)).replace(/^\d+\s*/, "");
  return a === b ? `${a} ${month}` : `${a} – ${b} ${month}`;
}

/** "5 – 11 October" */
export function weekRange(startIso: string, endIso: string, l: Locale): string {
  const a = new Date(startIso);
  const b = new Date(endIso);
  const sameMonth = fmt("en", { month: "numeric" }).format(a) === fmt("en", { month: "numeric" }).format(b);
  const left = sameMonth ? dayOfMonth(startIso) : fmt(l, { day: "numeric", month: "long" }).format(a);
  return `${left} – ${fmt(l, { day: "numeric", month: "long" }).format(b)}`;
}

/** "3h 04m" / "3ч 04м" */
export function duration(minutes: number, l: Locale): string {
  const h = Math.floor(minutes / 60);
  const m = String(minutes % 60).padStart(2, "0");
  return l === "ru" ? `${h}ч ${m}м` : `${h}h ${m}m`;
}

/** "Sunday, 4 October" / "Воскресенье, 4-е октября" — the event-page date line. */
export function eventDay(iso: string, l: Locale): string {
  const d = new Date(iso);
  const weekday = fmt(l, { weekday: "long" }).format(d);
  const day = dayOfMonth(iso);
  const month = fmt(l, { day: "numeric", month: "long" }).format(d).replace(/^\d+\s*/, "");
  const cap = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  return l === "ru" ? `${cap}, ${day}-е ${month}` : `${cap}, ${day} ${month}`;
}

/** "4 октября 2026" (no "г." suffix that ru-RU adds). */
export function longDate(iso: string, l: Locale): string {
  return fmt(l, { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso)).replace(/\s*г\.$/, "");
}

/** "12.04.2026" */
export function shortDate(iso: string): string {
  return fmt("ru", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
}

export function number(n: number, l: Locale): string {
  return new Intl.NumberFormat(tag(l)).format(n);
}

export function minutesBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000);
}
