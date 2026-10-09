/**
 * Op schedule. All times are Moscow time; MSK is a fixed UTC+3 (no DST since 2014),
 * so plain offset arithmetic is safe here.
 */

export const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
export const TIME_ZONE = "Europe/Moscow";

/** Usual ops: weekday (0 = Sunday) + MSK start time. Muster opens 15 minutes before. */
export const USUAL_SLOTS = [
  { weekday: 2, hour: 20, minute: 0 },
  { weekday: 0, hour: 19, minute: 0 },
] as const;

export const MUSTER_LEAD_MIN = 15;

/** Wall-clock MSK fields of an instant (month is 0-based, weekday 0 = Sunday). */
export function mskParts(d: Date) {
  const m = new Date(d.getTime() + MSK_OFFSET_MS);
  return { y: m.getUTCFullYear(), mo: m.getUTCMonth(), day: m.getUTCDate(), wd: m.getUTCDay() };
}

/** The instant for an MSK wall-clock date + time. */
export function mskDate(y: number, mo: number, day: number, hour = 0, minute = 0): Date {
  return new Date(Date.UTC(y, mo, day, hour, minute) - MSK_OFFSET_MS);
}

/** Monday 00:00 MSK of the week containing `d`. */
export function weekStart(d: Date): Date {
  const { y, mo, day, wd } = mskParts(d);
  const back = (wd + 6) % 7;
  return mskDate(y, mo, day - back);
}

/** Usual slots from `from` onwards, covering `weeks` calendar weeks (incl. the current one). */
/** One of the USUAL_SLOTS (Tue 20:00 / Sun 19:00 MSK); anything else is an extra op. */
export function isUsualSlot(d: Date): boolean {
  const m = new Date(d.getTime() + MSK_OFFSET_MS);
  return USUAL_SLOTS.some((s) => m.getUTCDay() === s.weekday && m.getUTCHours() === s.hour && m.getUTCMinutes() === s.minute);
}

/** A date field ("2026-10-10") plus a time field ("19:00"), read as MSK wall clock; null if either is malformed. */
export function fromMskFields(day: string, hhmm: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  const t = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!d || !t || Number(t[1]) > 23 || Number(t[2]) > 59) return null;
  return mskDate(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
}

export function usualSlotsFrom(from: Date, weeks: number): Date[] {
  const start = weekStart(from);
  const { y, mo, day } = mskParts(start);
  const out: Date[] = [];
  for (let w = 0; w < weeks; w++) {
    for (const s of USUAL_SLOTS) {
      const offset = (s.weekday + 6) % 7; // days after Monday
      const at = mskDate(y, mo, day + w * 7 + offset, s.hour, s.minute);
      if (at.getTime() >= from.getTime()) out.push(at);
    }
  }
  return out.sort((a, b) => a.getTime() - b.getTime());
}

/** `YYYY-MM-DD` of the MSK calendar day — stable key for matching events to slots. */
export function mskDayKey(d: Date | string): string {
  const { y, mo, day } = mskParts(typeof d === "string" ? new Date(d) : d);
  return `${y}-${String(mo + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ---------------------------------------------------------------- months

/** "YYYY-MM" in MSK. The feed loads and jumps by month. */
export type MonthKey = string;

export const isMonthKey = (s: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
export const isDayKey = (s: string) => /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s);

export const monthOf = (d: Date | string): MonthKey => mskDayKey(d).slice(0, 7);

export function addMonths(m: MonthKey, n: number): MonthKey {
  const [y, mo] = m.split("-").map(Number);
  const t = y * 12 + (mo - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

/** 00:00 MSK on the 1st. */
export function monthStart(m: MonthKey): Date {
  const [y, mo] = m.split("-").map(Number);
  return mskDate(y, mo - 1, 1);
}

export function daysInMonth(m: MonthKey): number {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

/** Calendar days of a month as MSK day keys, padded to whole Mon–Sun weeks. */
export function monthGrid(m: MonthKey): string[] {
  const [y, mo] = m.split("-").map(Number);
  const lead = (mskParts(monthStart(m)).wd + 6) % 7;
  const total = Math.ceil((lead + daysInMonth(m)) / 7) * 7;
  return Array.from({ length: total }, (_, i) => mskDayKey(mskDate(y, mo - 1, 1 - lead + i)));
}
