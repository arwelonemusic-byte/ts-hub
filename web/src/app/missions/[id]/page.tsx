import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";
import { BriefingPanel, isOwnPlan, MissionPanel, PlanRow } from "@/components/event/Panels";
import { MissionSlotsPanel } from "@/components/mission/MissionSlotsPanel";
import { ScheduleButton } from "@/components/schedule/Schedule";
import { buttonClass, ButtonLink, Cover, Eyebrow, Icon, StatusChip } from "@/components/ui";
import { getHubData } from "@/lib/data";
import { duration, eventDay, minutesBetween } from "@/lib/format";
import { plural, type Locale, type T } from "@/lib/i18n";
import { getT } from "@/lib/i18n-server";
import { replayUrl, workshopUrl } from "@/lib/links";
import type { HubEvent, Mission, MissionHistory, PastEvent, UpcomingEvent } from "@/lib/types";
import { getViewer } from "@/lib/viewer";

/** Claude Design canvas "TS Mission Details", variant B (games as rows). */
export default async function MissionPage({ params }: PageProps<"/missions/[id]">) {
  const { id } = await params;
  const data = getHubData();
  const [mission, { locale, t }, viewer] = await Promise.all([data.getMission(id), getT(), getViewer()]);
  if (!mission) notFound();
  const [games, history] = await Promise.all([data.listMissionEvents(mission.id, new Date()), data.getMissionHistory(mission.id)]);

  return (
    <>
      <AppHeader active="missions" />
      <main className="flex flex-col items-center gap-6 px-4 pb-16 pt-6 md:px-8">
        <Hero mission={mission} games={games} canSchedule={!!viewer?.isAdmin} locale={locale} t={t} />
        <div className="flex w-full max-w-[1216px] flex-col gap-4 lg:flex-row lg:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            {mission.briefing && <BriefingPanel b={mission.briefing} t={t} />}
            <Games games={games} locale={locale} t={t} />
            <Plans missionId={mission.id} history={history} viewerId={viewer?.discordId} t={t} />
          </div>
          <aside className="flex shrink-0 flex-col gap-4 lg:w-[360px]">
            <MissionPanel mission={mission} history={history} locale={locale} t={t} onMissionPage />
            <MissionSlotsPanel squads={mission.squads} noSlotting={mission.noSlotting} locale={locale} t={t} />
          </aside>
        </div>
      </main>
    </>
  );
}

function StatBox({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-lg bg-inset px-4 py-3">
      <Eyebrow>{label}</Eyebrow>
      <span className="truncate type-heading-l text-fg">{value}</span>
    </div>
  );
}

/** Summary on the left, cover on the right (the designer's swap on the canvas). */
function Hero({ mission, games, canSchedule, locale, t }: { mission: Mission; games: HubEvent[]; canSchedule: boolean; locale: Locale; t: T }) {
  const played = games.filter((g): g is PastEvent => g.status === "past");
  const n = played.length;
  const avgPlayers = n ? Math.round(played.reduce((s, g) => s + g.attended, 0) / n) : null;
  const avgMin = n ? Math.round(played.reduce((s, g) => s + minutesBetween(g.startedAt, g.endedAt), 0) / n) : null;
  return (
    <div className="flex w-full max-w-[1216px] flex-col gap-3">
      <Link href="/missions" className="flex h-11 items-center gap-1.5 self-start type-label-s text-fg-secondary hover:text-fg">
        <Icon name="chevron-left" />
        {t("missionPage.back")}
      </Link>
      <div className="flex flex-col-reverse gap-10 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <StatusChip tone="neutral">{t("missionPage.chip")}</StatusChip>
          <div className="flex flex-col">
            <span className="type-display-kicker text-fg-label">{t("event.kicker")}</span>
            <h1 className="type-display-event text-fg">{mission.name}</h1>
          </div>
          <div className="flex flex-col gap-2 type-body-m text-fg-label">
            <span className="flex items-center gap-2">
              <Icon name="map-pin" />
              {mission.mapLabel}
            </span>
            {mission.authors.length > 0 && (
              <span className="flex items-center gap-2">
                <Icon name="user" />
                <span>
                  {t("event.author")}
                  <span className="text-fg-accent">{mission.authors.join(", ")}</span>
                </span>
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <StatBox label={t("missionPage.played")} value={n ? plural(locale, "mission.times", n) : "—"} />
            <StatBox label={t("missionPage.players")} value={avgPlayers ?? "—"} />
            <StatBox label={t("missionPage.duration")} value={avgMin === null ? "—" : `${n > 1 ? "~" : ""}${duration(avgMin, locale)}`} />
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={workshopUrl(mission)} external variant="primary" className="flex-1">
              {t("missionPage.workshop")}
              <Icon name="external-dark" />
            </ButtonLink>
            {/* Starts a new plan of the viewer's own (app/plan/open). A POST, so only a click creates one. */}
            {canSchedule && (
              <ScheduleButton
                missions={[{ id: mission.id, name: mission.name, mapLabel: mission.mapLabel, coverUrl: mission.coverUrl }]}
                initial={{ missionId: mission.id }}
                locale={locale}
                label={t("schedule.button")}
                className={buttonClass("secondary", "m")}
              />
            )}
            {mission.planning !== false && (
              <form action="/plan/open" method="post" target="_blank">
                <input type="hidden" name="mission" value={mission.id} />
                <button type="submit" className={buttonClass("secondary", "m")}>
                  {t("plan.draw")}
                  <Icon name="external-trailing" />
                </button>
              </form>
            )}
          </div>
        </div>
        <Cover
          mission={mission}
          sizes="(min-width: 1024px) 588px, 100vw"
          noCoverLabel={t("past.noCover")}
          priority
          rounded="rounded-xl"
          className="w-full lg:flex-1"
        />
      </div>
    </div>
  );
}

/** «Игры с этой миссией»: Events-page rows without the cover (it's this mission's cover every time). */
function Games({ games, locale, t }: { games: HubEvent[]; locale: Locale; t: T }) {
  const played = games.filter((g) => g.status === "past").length;
  const planned = games.length - played;
  const caption = [
    played ? plural(locale, "missionPage.games.played", played) : t("missionPage.games.never"),
    planned ? plural(locale, "missionPage.games.planned", planned) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <section className="my-4 flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4 border-b border-line pb-3">
        <h2 className="type-heading-s text-fg">{t("missionPage.games")}</h2>
        <span className="type-eyebrow text-fg-tertiary">{caption}</span>
      </div>
      {games.map((g) => (g.status === "upcoming" ? <UpcomingRow key={g.id} ev={g} locale={locale} t={t} /> : <PlayedRow key={g.id} ev={g} locale={locale} t={t} />))}
    </section>
  );
}

function UpcomingRow({ ev, locale, t }: { ev: UpcomingEvent; locale: Locale; t: T }) {
  const taken = ev.slots.filter((s) => s.playerName).length;
  return (
    <Link
      href={`/events/${ev.id}`}
      className="flex flex-wrap items-center gap-5 rounded-xl bg-surface px-5 py-4 ring-line-strong hover:ring-1"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-3">
          <StatusChip tone="accent">{t("event.status.upcoming")}</StatusChip>
          <span className="type-heading-xs text-fg">{eventDay(ev.startsAt, locale)}</span>
        </div>
        <span className="type-body-s text-fg-secondary">
          <span className="type-label-s text-fg">{taken}</span> {t("missionPage.slotted", { max: ev.slots.length })}
        </span>
      </div>
      {/* The whole row is the link; this only looks like the button. */}
      <span className="inline-flex h-11 shrink-0 items-center gap-2 rounded-lg bg-accent px-4 type-label-s text-fg-on-accent">
        {t("feed.details")}
        <Icon name="arrow-right-dark" />
      </span>
    </Link>
  );
}

/** The date links to the game; the replay button sits above that link's stretched hit area. */
function PlayedRow({ ev, locale, t }: { ev: PastEvent; locale: Locale; t: T }) {
  return (
    <article className="relative flex items-center gap-4 rounded-xl bg-inset px-4 py-3 ring-line-strong hover:ring-1">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-3">
          <StatusChip tone="neutral">{t("event.status.past")}</StatusChip>
          <Link href={`/events/${ev.id}`} className="type-heading-xs text-fg after:absolute after:inset-0">
            {eventDay(ev.startsAt, locale)}
          </Link>
        </div>
        <span className="type-caption text-fg-secondary">
          {plural(locale, "feed.players", ev.attended)} · {duration(minutesBetween(ev.startedAt, ev.endedAt), locale)}
        </span>
      </div>
      {ev.replayCodes[0] && (
        <ButtonLink href={replayUrl(ev.replayCodes[0], ev)} external className="relative z-10">
          <Icon name="play-light" />
          {t("feed.replay")}
        </ButtonLink>
      )}
    </article>
  );
}

/** Everyone's plans for the mission, the ones drawn for its games included. The viewer continues their own from here. */
function Plans({ missionId, history, viewerId, t }: { missionId: string; history: MissionHistory; viewerId?: string; t: T }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl bg-surface p-6">
      <h2 className="type-heading-m text-fg">{t("missionPage.plans")}</h2>
      {history.plans.length ? (
        <div className="flex flex-col gap-2.5">
          {history.plans.map((p) => (
            <PlanRow key={p.id ?? p.code} plan={p} missionId={missionId} t={t} own={isOwnPlan(p, viewerId)} />
          ))}
        </div>
      ) : (
        <p className="type-body-m text-fg-secondary">{t("missionPage.plans.none")}</p>
      )}
    </section>
  );
}
