/**
 * The events feed: one chronological stream of played ops, scheduled ops and open
 * usual slots, served a month at a time. Built on the server (page + /api/feed);
 * the client only imports the types.
 */
import { getHubData } from "@/lib/data";
import { minutesBetween } from "@/lib/format";
import { replayUrl } from "@/lib/links";
import { addMonths, monthOf, monthStart, mskDayKey, usualSlotsFrom, type MonthKey } from "@/lib/schedule";
import type { ISODate, Mission } from "@/lib/types";

type CardMission = Pick<Mission, "name" | "mapLabel" | "coverUrl" | "authors">;

export type FeedItem =
  | {
      kind: "upcoming";
      id: string;
      startsAt: ISODate;
      mission: CardMission;
      taken: number;
      max: number;
      planReady: boolean;
    }
  | {
      kind: "played";
      id: string;
      startsAt: ISODate;
      mission: CardMission;
      attended: number;
      durationMin: number;
      /** Planner link for the first replay, with the game's plan and layer. */
      replayHref: string | null;
    }
  /** A usual Tue/Sun slot ahead of us with nothing scheduled. */
  | { kind: "open"; startsAt: ISODate };

export interface FeedMonth {
  month: MonthKey;
  items: FeedItem[];
}

export interface FeedMeta {
  /** Scroll limits: the earliest month with an op, and the furthest month we show open slots for. */
  first: MonthKey;
  last: MonthKey;
  /** The next op — rendered as the Featured card. */
  nextId: string | null;
  nextDay: string | null;
  today: string;
  now: ISODate;
}

/** Open slots are shown up to the end of next month (or the last scheduled op, if later). */
const OPEN_SLOT_MONTHS_AHEAD = 1;

export async function getFeedMeta(now: Date): Promise<FeedMeta> {
  const data = getHubData();
  const [range, upcoming] = await Promise.all([data.getRange(now), data.listUpcoming(now)]);
  const current = monthOf(now);
  const ahead = addMonths(current, OPEN_SLOT_MONTHS_AHEAD);
  const last = range && monthOf(range.last) > ahead ? monthOf(range.last) : ahead;
  return {
    first: range && monthOf(range.first) < current ? monthOf(range.first) : current,
    last,
    nextId: upcoming[0]?.id ?? null,
    nextDay: upcoming[0] ? mskDayKey(upcoming[0].startsAt) : null,
    today: mskDayKey(now),
    now: now.toISOString(),
  };
}

const card = (m: Mission): CardMission => ({ name: m.name, mapLabel: m.mapLabel, coverUrl: m.coverUrl, authors: m.authors });

/** Months `from`..`to` inclusive, each with its items in time order. */
export async function getFeedMonths(from: MonthKey, to: MonthKey, meta: FeedMeta): Promise<FeedMonth[]> {
  const now = new Date(meta.now);
  const start = monthStart(from);
  const end = monthStart(addMonths(to, 1));
  const events = await getHubData().listBetween(start, end, now);

  const items: FeedItem[] = events.map((e) =>
    e.status === "upcoming"
      ? {
          kind: "upcoming",
          id: e.id,
          startsAt: e.startsAt,
          mission: card(e.mission),
          taken: e.slots.filter((s) => s.playerName).length,
          max: e.slots.length,
          planReady: !!e.plan,
        }
      : {
          kind: "played",
          id: e.id,
          startsAt: e.startsAt,
          mission: card(e.mission),
          attended: e.attended,
          durationMin: minutesBetween(e.startedAt, e.endedAt),
          replayHref: e.replayCodes[0] ? replayUrl(e.replayCodes[0], e) : null,
        },
  );

  // Future usual slots with nothing on that day, up to the feed's last month.
  const taken = new Set(events.map((e) => mskDayKey(e.startsAt)));
  const openUntil = monthStart(addMonths(meta.last, 1));
  const openFrom = now > start ? now : start;
  const weeks = Math.ceil((Math.min(end.getTime(), openUntil.getTime()) - openFrom.getTime()) / (7 * 86_400_000)) + 1;
  if (weeks > 0) {
    for (const d of usualSlotsFrom(openFrom, weeks)) {
      if (d >= end || d >= openUntil || taken.has(mskDayKey(d))) continue;
      items.push({ kind: "open", startsAt: d.toISOString() });
    }
  }

  items.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const months: FeedMonth[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) {
    months.push({ month: m, items: items.filter((i) => monthOf(i.startsAt) === m) });
  }
  return months;
}
