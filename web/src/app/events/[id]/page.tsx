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
import { buttonClass, ButtonLink, Eyebrow, Icon, ProgressBar } from "@/components/ui";
import { getHubData } from "@/lib/data";
import { duration, minutesBetween } from "@/lib/format";
import type { Locale, T } from "@/lib/i18n";
import { getT } from "@/lib/i18n-server";
import { replayUrl, workshopUrl } from "@/lib/links";
import { canAttachPlan, canDetachPlan } from "@/lib/plans";
import { plannerEmbedUrl } from "@/lib/plans/planner";
import { playerNames, slottingOpen, viewerSlot } from "@/lib/slots";
import { LeaveSlotButton } from "@/components/event/SlotForms";
import { LiveRefresh } from "@/components/event/LiveRefresh";
import { JumpLink } from "@/components/event/Jump";
import { EventAdminMenu } from "@/components/schedule/Schedule";
import { FinishGameButton } from "@/components/event/FinishGameDialog";
import { AnnounceButton } from "@/components/event/AnnounceButton";
import { announcement } from "@/lib/discord/post";
import { slotRoles } from "@/lib/missions";
import type { MissionHistory, PastEvent, UpcomingEvent } from "@/lib/types";
import { getViewer, type Viewer } from "@/lib/viewer";

/** Figma: "Event details · Upcoming" (20:1337) and "Event details · Past" (20:1990). */
export default async function EventPage({ params }: PageProps<"/events/[id]">) {
  const { id } = await params;
  const data = getHubData();
  const [ev, { locale, t }, viewer] = await Promise.all([data.getEvent(id, new Date()), getT(), getViewer()]);
  if (!ev) notFound();
  const [history, players, version, roles, announced] = await Promise.all([
    data.getMissionHistory(ev.mission.id),
    // Names for an admin's «Посадить» picker.
    ev.status === "upcoming" && viewer?.isAdmin ? playerNames() : null,
    ev.status === "upcoming" ? data.getEventVersion(ev.id) : null,
    // Required roles for slots an admin adds («Изменить слоты»).
    ev.status === "upcoming" && viewer?.isAdmin ? slotRoles() : null,
    // Its Discord announcement («Анонс в Дискорд»), for an admin's link to it.
    ev.status === "upcoming" && viewer?.isAdmin ? announcement(ev.id) : null,
  ]);

  return (
    <>
      <AppHeader active="events" />
      <main className="relative flex flex-col items-center gap-6 overflow-clip px-4 pb-16 pt-6 md:px-8">
        <Backdrop coverUrl={ev.mission.coverUrl} />
        {ev.status === "upcoming" && version && <LiveRefresh eventId={ev.id} version={version} />}
        {ev.status === "upcoming" ? (
          <Upcoming ev={ev} history={history} viewer={viewer} players={players} roles={roles ?? []} announced={announced} locale={locale} t={t} />
        ) : (
          <Played ev={ev} history={history} isAdmin={!!viewer?.isAdmin} locale={locale} t={t} />
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
  roles,
  announced,
  locale,
  t,
}: {
  ev: UpcomingEvent;
  history: MissionHistory;
  viewer: Viewer | null;
  players: string[] | null;
  /** The game's Discord post (admins), null when not announced. */
  announced: { url: string } | null;
  /** Required roles for slots an admin adds. */
  roles: string[];
  locale: Locale;
  t: T;
}) {
  const taken = ev.slots.filter((s) => s.playerName).length;
  const mySlot = viewerSlot(viewer, ev);
  // Slotting closes when the game starts; from then on the admin finishes it («Игра окончена»).
  const started = !slottingOpen(ev);
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
          {/* Same look as a HeroBox, but it takes you to the Plan section. */}
          <JumpLink target="plan" className="flex min-w-0 flex-1 flex-col gap-2 rounded-lg bg-inset px-4 py-3 hover:bg-raised">
            <Eyebrow>{t("event.plan")}</Eyebrow>
            <span className="flex items-center gap-1.5 type-label-l text-fg">
              <Icon name={attached ? "check-circle" : "plan-pending"} />
              {attached ? `${t("event.plan.ready")} · ${attached.code}` : t("event.plan.none")}
            </span>
          </JumpLink>
        </div>
        <div className="flex flex-wrap gap-2">
          {viewer?.isAdmin && started ? (
            <FinishGameButton eventId={ev.id} locale={locale} label={t("finish.button")} className={`${buttonClass("primary", "m")} flex-1`} />
          ) : mySlot && (viewer!.isAdmin || slottingOpen(ev)) ? (
            <LeaveSlotButton eventId={ev.id} label={t("event.leaveSlot")} className={buttonClass("danger", "m")} />
          ) : (
            <JumpLink target="slots" className={`${buttonClass("primary", "m")} flex-1`}>
              {t("event.slotIn")}
            </JumpLink>
          )}
          <ButtonLink href={workshopUrl(ev.mission)} external>
            {t("event.workshop")}
            <Icon name="external-trailing" />
          </ButtonLink>
          {viewer?.isAdmin &&
            (announced ? (
              <ButtonLink href={announced.url} external>
                {t("announce.open")}
                <Icon name="external-trailing" />
              </ButtonLink>
            ) : (
              !started && (
                <AnnounceButton
                  eventId={ev.id}
                  labels={{
                    button: t("announce.button"),
                    pending: t("announce.pending"),
                    confirm: t("announce.confirm"),
                    errors: {
                      forbidden: t("announce.error.forbidden"),
                      notConfigured: t("announce.error.notConfigured"),
                      notFound: t("announce.error.notFound"),
                      discord: t("announce.error.discord"),
                    },
                  }}
                />
              )
            ))}
          {viewer?.isAdmin && (
            <EventAdminMenu eventId={ev.id} startsAt={ev.startsAt} missionName={ev.mission.name} slots={ev.slots} roles={roles} locale={locale} />
          )}
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

function Played({ ev, history, isAdmin, locale, t }: { ev: PastEvent; history: MissionHistory; isAdmin: boolean; locale: Locale; t: T }) {
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
          {isAdmin && <FinishGameButton eventId={ev.id} recompute locale={locale} label={t("finish.recompute")} className={buttonClass("secondary", "m")} />}
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
