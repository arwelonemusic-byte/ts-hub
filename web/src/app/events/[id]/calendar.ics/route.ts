import { getHubData } from "@/lib/data";
import { MUSTER_LEAD_MIN } from "@/lib/schedule";
import { siteUrl } from "@/lib/site";

/** Most ops run 2–3 hours; the calendar entry just needs a sensible block. */
const DEFAULT_LENGTH_MIN = 180;

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
// RFC 5545 text escaping.
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

export async function GET(request: Request, ctx: RouteContext<"/events/[id]/calendar.ics">) {
  const { id } = await ctx.params;
  const ev = await getHubData().getEvent(id, new Date());
  if (!ev || ev.status !== "upcoming") return new Response("Not found", { status: 404 });

  const start = new Date(ev.startsAt);
  const end = new Date(start.getTime() + DEFAULT_LENGTH_MIN * 60_000);
  const url = siteUrl(`/events/${ev.id}`, request);
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tactical Shift//TS Hub//EN",
    "BEGIN:VEVENT",
    `UID:${ev.id}@ts-hub`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(`Tactical Shift · ${ev.mission.name}`)}`,
    `LOCATION:${esc(ev.mission.mapLabel)}`,
    `DESCRIPTION:${esc(`${url}`)}`,
    `URL:${url}`,
    "BEGIN:VALARM",
    `TRIGGER:-PT${MUSTER_LEAD_MIN}M`,
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(ev.mission.name)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${ev.mission.id}.ics"`,
    },
  });
}
