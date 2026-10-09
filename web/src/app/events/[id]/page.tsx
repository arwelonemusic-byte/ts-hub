import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Backdrop, Hero, HeroBox } from "@/components/event/Hero";
import {
  AwardsPanel,
  BriefingBody,
  BriefingPanel,
  Collapsible,
  LeaderboardsPanel,
  MissionPanel,
  OpTotals,
  PlanPanel,
  PlanRow,
  SlotsPanel,
} from "@/components/event/Panels";
import { ButtonLink, Eyebrow, Icon, ProgressBar } from "@/components/ui";
import { getHubData } from "@/lib/data";
import { duration, minutesBetween } from "@/lib/format";
import type { Locale, T } from "@/lib/i18n";
import { getT } from "@/lib/i18n-server";
import { replayUrl, workshopUrl } from "@/lib/links";
import { canAttachPlan, canDetachPlan } from "@/lib/plans";
import { plannerEmbedUrl } from "@/lib/plans/planner";
import { playerNames, viewerSlot } from "@/lib/slots";
import type { MissionHistory, PastEvent, UpcomingEvent } from "@/lib/types";
import { getViewer, type Viewer } from "@/lib/viewer";

/** Figma: "Event details · Upcoming" (20:1337) and "Event details · Past" (20:1990). */
export default async function EventPage({ params }: PageProps<"/events/[id]">) {
  const { id } = await params;
  const data = getHubData();
  const [ev, { locale, t }, viewer] = await Promise.all([data.getEvent(id, new Date()), getT(), getViewer()]);
  if (!ev) notFound();
  const [history, players] = await Promise.all([
    data.getMissionHistory(ev.mission.id),
    // Names for an admin's «Посадить» picker.
    ev.status === "upcoming" && viewer?.isAdmin ? playerNames() : null,
  ]);

  return (
    <>
      <AppHeader active="events" />
      <main className="relative flex flex-col items-center gap-6 overflow-clip px-4 pb-16 pt-6 md:px-8">
        <Backdrop coverUrl={ev.mission.coverUrl} />
        {ev.status === "upcoming" ? (
          <Upcoming ev={ev} history={history} viewer={viewer} players={players} locale={locale} t={t} />
        ) : (
          <Played ev={ev} history={history} locale={locale} t={t} />
        )}
      </main>
    </>
  );
}

function Columns({ content, aside }: { content: ReactNode; aside: ReactNode }) {
  return (
    <div className="relative flex w-full max-w-[1216px] flex-col gap-4 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-4">{content}</div>
      <aside className="flex shrink-0 flex-col gap-4 lg:w-[360px]">{aside}</aside>
    </div>
  );
}

function Upcoming({
  ev,
  history,
  viewer,
  players,
  locale,
  t,
}: {
  ev: UpcomingEvent;
  history: MissionHistory;
  viewer: Viewer | null;
  players: string[] | null;
  locale: Locale;
  t: T;
}) {
  const taken = ev.slots.filter((s) => s.playerName).length;
  const mySlot = viewerSlot(viewer, ev);
  const attached = ev.plan;
  return (
    <>
      <Hero ev={ev} locale={locale} t={t}>
        <div className="flex gap-3">
          <HeroBox>
            <div className="flex items-baseline gap-1.5">
              <span className="type-heading-l text-fg">{taken}</span>
              <span className="type-body-s text-fg-secondary">{t("event.slotted", { max: ev.slots.length })}</span>
            </div>
            <ProgressBar value={taken} max={ev.slots.length} />
          </HeroBox>
          <HeroBox>
            <Eyebrow>{t("event.plan")}</Eyebrow>
            <span className="flex items-center gap-1.5 type-label-l text-fg">
              <Icon name={attached ? "check-circle" : "plan-pending"} />
              {attached ? `${t("event.plan.ready")} · ${attached.code}` : t("event.plan.none")}
            </span>
          </HeroBox>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="#slots" variant="primary" className="flex-1">
            {mySlot ? t("event.yourSlot", { role: mySlot.role }) : t("event.slotIn")}
          </ButtonLink>
          <ButtonLink href={`/events/${ev.id}/calendar.ics`}>
            <Icon name="calendar" />
            {t("event.addToCalendar")}
          </ButtonLink>
          <ButtonLink href={workshopUrl(ev.mission)} external>
            {t("event.workshop")}
            <Icon name="external-trailing" />
          </ButtonLink>
        </div>
      </Hero>
      <Columns
        content={
          <>
            {ev.mission.briefing && <BriefingPanel b={ev.mission.briefing} t={t} />}
            <PlanPanel
              ev={ev}
              embedUrl={ev.plan ? plannerEmbedUrl({ missionId: ev.mission.id, mapKey: ev.mission.mapKey, code: ev.plan.code }) : null}
              signedIn={!!viewer}
              canAttach={canAttachPlan(viewer, ev)}
              canDetach={canDetachPlan(viewer, ev)}
              t={t}
            />
          </>
        }
        aside={
          <>
            <SlotsPanel ev={ev} viewer={viewer} players={players} t={t} />
            <MissionPanel mission={ev.mission} history={history} locale={locale} t={t} />
          </>
        }
      />
    </>
  );
}

function Played({ ev, history, locale, t }: { ev: PastEvent; history: MissionHistory; locale: Locale; t: T }) {
  const used = ev.planCode
    ? (history.plans.find((p) => p.code === ev.planCode) ?? { code: ev.planCode, author: ev.platoonLeader ?? "—", createdAt: ev.startsAt })
    : null;
  return (
    <>
      <Hero ev={ev} locale={locale} t={t}>
        <div className="flex gap-3">
          <HeroBox>
            <Eyebrow>{t("event.attended")}</Eyebrow>
            <div className="flex items-baseline gap-1.5">
              <span className="type-heading-l text-fg">{ev.attended}</span>
              {ev.slotted !== null && (
                <span className="type-body-s text-fg-secondary">{t("event.ofSlotted", { n: ev.slotted })}</span>
              )}
            </div>
            {ev.slotted !== null && <ProgressBar value={ev.attended} max={ev.slotted} tone="success" />}
          </HeroBox>
          <HeroBox>
            <Eyebrow>{t("event.duration")}</Eyebrow>
            <span className="type-heading-xl text-fg">{duration(minutesBetween(ev.startedAt, ev.endedAt), locale)}</span>
          </HeroBox>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={replayUrl(ev.replayCodes[0], ev)} external variant="primary" className="flex-1">
            <Icon name="play" />
            {t("event.watchReplay")}
          </ButtonLink>
          {/* A server restart splits an op into several replays. */}
          {ev.replayCodes.slice(1).map((c, i) => (
            <ButtonLink key={c} href={replayUrl(c, ev)} external>
              {t("past.part", { n: i + 2 })}
            </ButtonLink>
          ))}
          <ButtonLink href={workshopUrl(ev.mission)} external>
            {t("event.workshop")}
            <Icon name="external-trailing" />
          </ButtonLink>
        </div>
      </Hero>
      <OpTotals ev={ev} locale={locale} t={t} />
      <Columns
        content={
          <>
            <LeaderboardsPanel ev={ev} t={t} />
            {ev.mission.briefing && (
              <Collapsible title={t("briefing.title")} t={t}>
                <BriefingBody b={ev.mission.briefing} t={t} />
              </Collapsible>
            )}
            <Collapsible title={t("plan.title")} t={t}>
              {used ? (
                <PlanRow plan={used} missionId={ev.mission.id} t={t} showGame={false} />
              ) : (
                <p className="type-body-m text-fg-secondary">{t("plan.noneLinked")}</p>
              )}
            </Collapsible>
          </>
        }
        aside={
          <>
            {ev.awards.length > 0 && <AwardsPanel awards={ev.awards} t={t} />}
            <MissionPanel mission={ev.mission} history={history} locale={locale} t={t} played />
          </>
        }
      />
    </>
  );
}
