import { AppHeader } from "@/components/AppHeader";
import { EventFeed } from "@/components/feed/EventFeed";
import { getHubData } from "@/lib/data";
import { getFeedMeta, getFeedMonths } from "@/lib/feed";
import { getT } from "@/lib/i18n-server";
import { isDayKey, monthOf } from "@/lib/schedule";
import { getViewer } from "@/lib/viewer";

const AUTH_NOTICE: Record<string, string> = {
  not_configured: "auth.notConfigured",
  not_in_guild: "auth.notInGuild",
  failed: "auth.failed",
};

/**
 * Figma "Events · Upcoming" (13:2): one feed of every op, past and future. Opens on the
 * next op (or on `?date=YYYY-MM-DD`), with only that month rendered; the rest loads on scroll.
 */
export default async function EventsPage({ searchParams }: PageProps<"/events">) {
  const { auth, date } = await searchParams;
  const [{ locale, t }, meta, viewer] = await Promise.all([getT(), getFeedMeta(new Date()), getViewer()]);
  // Admins schedule games from the feed: the missions for the dialog's picker.
  const missions = viewer?.isAdmin
    ? (await getHubData().listMissions())
        .map((m) => ({ id: m.id, name: m.name, mapLabel: m.mapLabel, coverUrl: m.coverUrl }))
        .sort((a, b) => a.name.localeCompare(b.name))
    : null;

  const asked = typeof date === "string" && isDayKey(date) ? date : null;
  let anchorDay = asked ?? meta.nextDay ?? meta.today;
  let month = anchorDay.slice(0, 7);
  if (month < meta.first || month > meta.last) {
    anchorDay = meta.nextDay ?? meta.today;
    month = monthOf(new Date(`${anchorDay}T12:00:00+03:00`));
  }
  const initial = await getFeedMonths(month, month, meta);
  const notice = typeof auth === "string" ? AUTH_NOTICE[auth] : undefined;

  return (
    <>
      <AppHeader active="events" />
      <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-8 px-4 pb-16 pt-10 md:px-8">
        {notice && (
          <div className="rounded-lg border border-line-danger bg-danger-subtle px-4 py-3 type-body-m text-fg-body">{t(notice)}</div>
        )}
        <div className="flex flex-col gap-2">
          <h1 className="type-display-page text-fg">{t("events.title")}</h1>
          <p className="type-body-l text-fg-secondary">
            {t("events.intro.a")}
            <strong className="font-medium text-fg">{t("events.intro.tue")}</strong>
            {t("events.intro.b")}
            <strong className="font-medium text-fg">{t("events.intro.sun")}</strong>
            {t("events.intro.c")}
          </p>
        </div>
        <EventFeed initial={initial} meta={meta} anchorDay={anchorDay} locale={locale} missions={missions} />
      </main>
    </>
  );
}
