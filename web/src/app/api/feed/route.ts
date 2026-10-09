import { NextRequest, NextResponse } from "next/server";
import { getFeedMeta, getFeedMonths } from "@/lib/feed";
import { addMonths, isMonthKey } from "@/lib/schedule";

/** Longest span one request may ask for. */
const MAX_MONTHS = 12;

/** GET /api/feed?from=YYYY-MM&to=YYYY-MM — feed months, clamped to the feed's range. */
export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from") ?? "";
  const to = req.nextUrl.searchParams.get("to") ?? from;
  if (!isMonthKey(from) || !isMonthKey(to) || from > to) {
    return NextResponse.json({ error: "from/to must be YYYY-MM, from ≤ to" }, { status: 400 });
  }
  const meta = await getFeedMeta(new Date());
  const a = from < meta.first ? meta.first : from;
  let b = to > meta.last ? meta.last : to;
  if (a > b) return NextResponse.json({ months: [] });
  if (addMonths(a, MAX_MONTHS - 1) < b) b = addMonths(a, MAX_MONTHS - 1);
  return NextResponse.json({ months: await getFeedMonths(a, b, meta) });
}
