import Image from "next/image";
import type { ReactNode } from "react";
import { number, shortDate } from "@/lib/format";
import { plural, type Locale, type T } from "@/lib/i18n";
import { planOpenHref, replayUrl } from "@/lib/links";
import type { Award, Briefing, LeaderboardEntry, Mission, MissionHistory, PastEvent, PlanRef, Slot, UpcomingEvent } from "@/lib/types";
import { buttonClass, ButtonLink, Eyebrow, Icon, ProgressBar, Tag } from "../ui";
import { CopyButton } from "./CopyButton";
import { CopyValue } from "./CopyValue";
import { AwardCard } from "./AwardCard";
import { AttachCodeForm, DetachButton } from "./PlanForms";
import { SlotAdminMenu, SlotButton, type SlotErrors } from "./SlotForms";
import { slottingOpen, takeBlock } from "@/lib/slots";
import type { Viewer } from "@/lib/viewer";

/**
 * A write action the viewer can't take here. Signed-out users are sent to log in;
 * signed-in users see it disabled, `title` saying why (by default: not wired up yet).
 */
function WriteAction({ signedIn, className, children, t, title }: { signedIn: boolean; className: string; children: ReactNode; t: T; title?: string }) {
  if (!signedIn) {
    return (
      <a href="/api/auth/login" className={className}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" disabled title={title ?? t("slots.notWired")} className={className}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- briefing

function BriefingSection({ title, gap = "gap-2.5", children }: { title: string; gap?: string; children: ReactNode }) {
  return (
    <section className={`flex flex-col ${gap}`}>
      <Eyebrow>{title}</Eyebrow>
      {children}
    </section>
  );
}

type Block = { list: string[] } | { text: string };

/** A section body as the catalogue stores it: paragraphs split by blank lines, "- " lines as list items. */
function blocks(body: string): Block[] {
  const out: Block[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flushPara = () => {
    if (para.length) out.push({ text: para.join("\n") });
    para = [];
  };
  const flushList = () => {
    if (list.length) out.push({ list });
    list = [];
  };
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("- ")) {
      flushPara();
      list.push(line.slice(2));
    } else if (!line) {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return out;
}

/** Sides first, then the author's sections; «Задачи» list items get the numbered badges. */
export function BriefingBody({ b, t }: { b: Briefing; t: T }) {
  const objectives = t("briefing.objectives");
  return (
    <>
      {(b.sides?.for || b.sides?.against) && (
        <div className="flex flex-wrap gap-x-10 gap-y-5">
          {b.sides.for && (
            <BriefingSection title={t("briefing.for")}>
              <p className="type-body-l text-fg-body">{b.sides.for}</p>
            </BriefingSection>
          )}
          {b.sides.against && (
            <BriefingSection title={t("briefing.against")}>
              <p className="type-body-l text-fg-body">{b.sides.against}</p>
            </BriefingSection>
          )}
        </div>
      )}
      {b.sections.map((sec) => (
        <BriefingSection key={sec.title} title={sec.title} gap="gap-3">
          {blocks(sec.body).map((blk, i) =>
            "text" in blk ? (
              <p key={i} className="whitespace-pre-line type-body-l text-fg-body">
                {blk.text}
              </p>
            ) : sec.title === objectives ? (
              <ol key={i} className="flex flex-col gap-3">
                {blk.list.map((o, n) => (
                  <li key={n} className="flex items-start gap-3">
                    <span className="mt-1 rounded-sm bg-accent-subtle px-1.5 py-[5px] type-code-badge text-fg-accent">
                      {String(n + 1).padStart(2, "0")}
                    </span>
                    <span className="type-body-l text-fg-body">{o}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <ul key={i} className="flex list-disc flex-col gap-1 type-body-l text-fg-body">
                {blk.list.map((item, n) => (
                  <li key={n} className="ms-[22.5px]">
                    {item}
                  </li>
                ))}
              </ul>
            ),
          )}
        </BriefingSection>
      ))}
    </>
  );
}

/** Discord markdown, ready to paste: the sides in bold on their own lines, then a "# " heading per section. */
function briefingText(b: Briefing, t: T): string {
  const lines: string[] = [];
  if (b.sides?.for) lines.push(`**${t("briefing.for")}:** ${b.sides.for}`);
  if (b.sides?.against) lines.push(`**${t("briefing.against")}:** ${b.sides.against}`);
  for (const sec of b.sections) lines.push(`# ${sec.title}`, sec.body.trim());
  return lines.join("\n");
}

export function BriefingPanel({ b, t }: { b: Briefing; t: T }) {
  return (
    <section className="flex flex-col gap-7 rounded-xl bg-surface p-6 md:p-8">
      <div className="flex items-baseline justify-between">
        <h2 className="type-heading-l text-fg">{t("briefing.title")}</h2>
        <CopyButton text={briefingText(b, t)} label={t("briefing.copy")} copiedLabel={t("briefing.copied")} />
      </div>
      <BriefingBody b={b} t={t} />
    </section>
  );
}

/** Figma "Briefing (collapsed)": a 60px bar that expands in place. */
export function Collapsible({ title, t, children }: { title: string; t: T; children: ReactNode }) {
  return (
    <details className="group rounded-xl bg-surface">
      <summary className="flex h-15 cursor-pointer list-none items-center justify-between px-6 [&::-webkit-details-marker]:hidden">
        <h2 className="type-heading-m text-fg">{title}</h2>
        <span className="type-label-s text-fg-secondary">
          <span className="group-open:hidden">{t("collapse.show")}</span>
          <span className="hidden group-open:inline">{t("collapse.hide")}</span>
        </span>
      </summary>
      <div className="flex flex-col gap-7 px-6 pb-6">{children}</div>
    </details>
  );
}

// ---------------------------------------------------------------- plan

/** The viewer's own mission plans: their row is where they continue them. */
export const isOwnPlan = (plan: PlanRef, viewerId: string | undefined) => !!viewerId && !plan.event && plan.authorId === viewerId;

/**
 * `showGame` adds which game the plan is for — not needed on that game's own page.
 * `own` relabels the open button: it opens the viewer's own plan for editing.
 */
export function PlanRow({
  plan,
  missionId,
  t,
  showGame = true,
  own = false,
  children,
}: {
  plan: PlanRef;
  missionId: string;
  t: T;
  showGame?: boolean;
  own?: boolean;
  children?: ReactNode;
}) {
  const caption = [
    plan.author,
    shortDate(plan.createdAt),
    showGame && plan.event ? t("plan.forGame", { date: shortDate(plan.event.startsAt) }) : null,
  ].filter(Boolean);
  return (
    <div className="flex min-h-15 flex-wrap items-center gap-2.5 rounded-lg bg-inset px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate type-label-s text-fg">{plan.title ?? plan.code}</span>
        <span className="flex flex-wrap items-center gap-x-2 type-caption text-fg-secondary">
          {caption.map((c, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 && <span>·</span>}
              {c}
            </span>
          ))}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <ButtonLink href={planOpenHref(plan, missionId)} external size="s">
          {t(own ? "plan.editShort" : "plan.openInPlanner")}
          <Icon name="external" />
        </ButtonLink>
        {children}
      </div>
    </div>
  );
}

/**
 * A scheduled game's plan: the one someone attached (lib/plans). Anyone signed in draws a plan in
 * the planner from here and pastes the code it gives back. Whoever attached it can paste a newer
 * code; an admin can detach it. Other plans for the mission are on the mission page.
 */
export function PlanPanel({
  ev,
  embedUrl,
  signedIn,
  canAttach,
  canDetach,
  t,
}: {
  ev: UpcomingEvent;
  /** The attached plan in the planner's read-only map (planner app/embed). */
  embedUrl: string | null;
  signedIn: boolean;
  /** The game has no plan yet, or the viewer attached it. */
  canAttach: boolean;
  canDetach: boolean;
  t: T;
}) {
  const attached = ev.plan;
  const own = !!attached && canAttach;
  const errors = {
    invalid: t("plan.error.invalid"),
    notFound: t("plan.error.notFound"),
    wrongMap: t("plan.error.wrongMap"),
    forbidden: t("plan.error.forbidden"),
    taken: t("plan.error.taken"),
  };
  return (
    <section className="flex flex-col gap-4 rounded-xl bg-surface p-6">
      <div className="flex items-center justify-between">
        <h2 className="type-heading-m text-fg">{t("plan.title")}</h2>
        <Tag>{attached ? t("plan.attachedTag") : t("plan.noneTag")}</Tag>
      </div>
      {attached && (
        <PlanRow plan={{ ...attached, author: t("plan.attachedBy", { name: attached.author }) }} missionId={ev.mission.id} t={t} showGame={false}>
          {canDetach && <DetachButton eventId={ev.id} label={t("plan.detach")} confirmText={t("plan.detachConfirm")} />}
        </PlanRow>
      )}
      {attached && embedUrl && (
        <iframe
          // Keyed by code: a replaced plan reloads the map.
          key={attached.code}
          src={embedUrl}
          title={t("plan.mapTitle", { code: attached.code })}
          loading="lazy"
          className="aspect-[16/10] w-full rounded-lg bg-inset"
        />
      )}
      {(!attached || own || !signedIn) && (
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:gap-6">
          {signedIn ? (
            <ButtonLink href={`/plan/open?event=${encodeURIComponent(ev.id)}`} external className="md:flex-1">
              {t("plan.draw")}
              <Icon name="external-trailing" />
            </ButtonLink>
          ) : (
            <WriteAction signedIn={false} t={t} className={`${buttonClass("secondary", "m")} md:flex-1`}>
              {t("plan.draw")}
              <Icon name="external-trailing" />
            </WriteAction>
          )}
          <div className="hidden w-px self-stretch bg-raised md:block" />
          {signedIn ? (
            <AttachCodeForm
              eventId={ev.id}
              placeholder={t("plan.codePlaceholder")}
              label={t(own ? "plan.replace" : "plan.attach")}
              confirmText={own ? t("plan.replaceConfirm") : undefined}
              errors={errors}
            />
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <input
                name="code"
                maxLength={6}
                disabled
                placeholder={t("plan.codePlaceholder")}
                aria-label={t("plan.attach")}
                className="h-11 min-w-0 flex-1 rounded-lg border border-line bg-page px-3 type-code tracking-[0.2em] text-fg uppercase outline-none placeholder:text-fg-faint"
              />
              <WriteAction signedIn={false} t={t} className={buttonClass("primary", "m")}>
                {t("plan.attach")}
              </WriteAction>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- slots

/**
 * Roles on the left, names on the right — same order as the Discord slotting post (HQ first).
 * Signed-in players take a free slot whose role they have and leave their own (lib/slots);
 * an admin gets «…» on every slot. `players` (member names for that menu) is admins only.
 */
export function SlotsPanel({ ev, viewer, players, t }: { ev: UpcomingEvent; viewer: Viewer | null; players: string[] | null; t: T }) {
  const slots = ev.slots;
  const taken = slots.filter((s) => s.playerName).length;
  const groups = [...new Set(slots.map((s) => s.groupId))].sort((a, b) => (a === "1'6" ? -1 : b === "1'6" ? 1 : a.localeCompare(b)));
  const errors: SlotErrors = {
    taken: t("slots.error.taken"),
    role: t("slots.needRole", { role: "{name}" }),
    closed: t("slots.error.closed"),
    forbidden: t("slots.error.forbidden"),
    noPlayer: t("slots.error.noPlayer"),
    ambiguous: t("slots.error.ambiguous"),
  };
  const menu = {
    menu: t("slots.admin.menu"),
    assign: t("slots.admin.assign"),
    placeholder: t("slots.admin.placeholder"),
    clear: t("slots.admin.clear"),
    clearConfirm: t("slots.admin.clearConfirm"),
  };

  const action = (s: Slot): ReactNode => {
    const mine = !!viewer && s.playerId === viewer.discordId;
    if (s.playerName) {
      return (
        <>
          <span className={`min-w-0 truncate type-label-s ${mine ? "text-fg-accent" : "text-fg"}`}>{s.playerName}</span>
          {mine && (viewer!.isAdmin || slottingOpen(ev)) && (
            <SlotButton kind="leave" eventId={ev.id} position={s.id} label={t("slots.leave")} errors={errors} />
          )}
        </>
      );
    }
    if (!viewer) {
      return (
        <WriteAction signedIn={false} t={t} className={buttonClass("primary", "xs")}>
          {t("slots.take")}
        </WriteAction>
      );
    }
    const block = takeBlock(viewer, ev, s);
    if (block === "closed") return null;
    if (block === "role") return <span className="truncate type-caption text-fg-faint">{t("slots.needRole", { role: s.requiredRole ?? "" })}</span>;
    return <SlotButton kind="take" eventId={ev.id} position={s.id} label={t("slots.take")} errors={errors} />;
  };

  return (
    <section id="slots" className="flex scroll-mt-24 flex-col gap-6 rounded-xl bg-inset p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="type-heading-xs text-fg">{t("slots.title")}</h2>
        <span className="type-caption text-fg-secondary">{t("slots.taken", { taken, max: slots.length })}</span>
      </div>
      <ProgressBar value={taken} max={slots.length} />
      {players && (
        <datalist id="hub-players">
          {players.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      )}
      {groups.map((g) => {
        const rows = slots.filter((s) => s.groupId === g);
        return (
          <div key={g} className="flex flex-col">
            <div className="flex items-baseline justify-between pb-1.5 text-fg-tertiary">
              <span className="type-eyebrow">
                {g} {rows[0].groupName}
              </span>
              <span className="type-caption">
                {rows.filter((s) => s.playerName).length} / {rows.length}
              </span>
            </div>
            {rows.map((s) => (
              <div key={s.id} className="flex h-10 items-center gap-2.5 border-t border-line">
                <span className={`min-w-0 flex-1 truncate type-body-s ${s.playerName ? "text-fg-secondary" : "text-fg"}`}>{s.role}</span>
                <div className="flex max-w-[62%] min-w-0 items-center justify-end gap-1.5">
                  {action(s)}
                  {viewer?.isAdmin && (
                    <SlotAdminMenu eventId={ev.id} position={s.id} role={s.role} taken={!!s.playerName} labels={menu} errors={errors} />
                  )}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </section>
  );
}

// ---------------------------------------------------------------- mission

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-5 type-body-s">
      <span className="w-[72px] shrink-0 whitespace-nowrap text-fg-tertiary">{label}</span>
      {children}
    </div>
  );
}

/** A Workshop identifier: click to copy, or a dash when the catalogue doesn't have it yet. */
function CopyFact({ label, value, t }: { label: string; value?: string; t: T }) {
  return (
    <Fact label={label}>
      {value ? (
        <CopyValue value={value} hint={t("mission.copyHint")} copiedLabel={t("mission.copied")} />
      ) : (
        <span className="text-fg-tertiary">—</span>
      )}
    </Fact>
  );
}

/**
 * The mission's facts. On an event page it also says how often the mission was played and
 * links to the mission page; on the mission page itself it shows the Workshop ids instead.
 */
export function MissionPanel({
  mission,
  history,
  locale,
  t,
  onMissionPage = false,
  played = false,
}: {
  mission: Mission;
  history: MissionHistory;
  locale: Locale;
  t: T;
  onMissionPage?: boolean;
  /** A played game's page (Figma 24:3241): the mission's tags instead of its GUID and scenario. */
  played?: boolean;
}) {
  const planning = (
    <Fact label={t("mission.planning")}>
      {mission.planning === false ? (
        <span className="text-fg-secondary">{t("mission.noPlanning")}</span>
      ) : mission.hasMarkersLayer ? (
        <span className="flex items-center gap-1.5 text-fg-success">
          <Icon name="check-circle" />
          {t("mission.markersReady")}
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-fg-secondary">
          <Icon name="plan-pending" />
          {t("mission.markersMissing")}
        </span>
      )}
    </Fact>
  );
  const ids = (
    <>
      <CopyFact label={t("mission.guid")} value={mission.addonGuid} t={t} />
      <CopyFact label={t("mission.scenario")} value={mission.scenarioId} t={t} />
    </>
  );
  return (
    <section className="flex flex-col gap-4 rounded-xl bg-inset p-5">
      <h2 className="type-heading-xs text-fg">{t("mission.title")}</h2>
      <div className="flex flex-col gap-2.5">
        <Fact label={t("mission.author")}>
          <span className="text-fg">{mission.authors.join(", ") || "—"}</span>
        </Fact>
        <Fact label={t("mission.map")}>
          <span className="text-fg">{mission.mapLabel}</span>
        </Fact>
        {onMissionPage ? (
          <>
            {ids}
            {planning}
          </>
        ) : (
          <>
            <Fact label={t("mission.played")}>
              {history.timesPlayed > 0 ? (
                <span className="text-fg-accent">{plural(locale, "mission.times", history.timesPlayed)}</span>
              ) : (
                <span className="text-fg-secondary">{t("mission.played.never")}</span>
              )}
            </Fact>
            {planning}
            {!played && ids}
          </>
        )}
      </div>
      {played && mission.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {mission.tags.map((tag) => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </div>
      )}
      {!onMissionPage && (
        <ButtonLink href={`/missions/${mission.id}`} className="w-full">
          {t("mission.page")}
          <Icon name="arrow-right" />
        </ButtonLink>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- played op

/** Figma "Op totals" (24:3476): an 80px illustration over each number. */
export function OpTotals({ ev, locale, t }: { ev: PastEvent; locale: Locale; t: T }) {
  const s = ev.stats;
  const items: { label: string; value?: number; art: string; flip?: boolean; danger?: boolean }[] = [
    { label: t("totals.shots"), value: s.shots, art: "player-shots" },
    // The same drawing as the bots' shots, facing the other way.
    { label: t("totals.aiShots"), value: s.aiShots, art: "bot-shots", flip: true },
    { label: t("totals.deaths"), value: s.deaths, art: "players-died" },
    { label: t("totals.aiKilled"), value: s.aiKilled, art: "bots-killed" },
    { label: t("totals.knockdowns"), value: s.knockdowns, art: "knockdowns" },
    { label: t("totals.friendlyFire"), value: s.friendlyFire, art: "friendly-fire", danger: true },
  ];
  return (
    <div className="relative grid w-full max-w-[1216px] grid-cols-2 gap-6 rounded-xl px-6 py-5 sm:grid-cols-3 lg:flex">
      {items
        .filter((i) => i.value !== undefined)
        .map((i) => (
          <div key={i.art} className="flex min-w-0 flex-1 flex-col items-center gap-4 text-center">
            <div className={`relative size-20 shrink-0 ${i.flip ? "-scale-x-100" : ""}`}>
              <Image src={`/illustrations/stats/${i.art}.png`} alt="" fill sizes="80px" className="object-cover" />
            </div>
            <div className="flex flex-col items-center gap-1">
              <Eyebrow>{i.label}</Eyebrow>
              <span className={`type-heading-number ${i.danger ? "text-fg-danger" : "text-fg"}`}>{number(i.value!, locale)}</span>
            </div>
          </div>
        ))}
    </div>
  );
}

const MEDALS = ["medal-gold", "medal-silver", "medal-bronze"];

/** Competition ranking: ties share a rank (1, 2, 2, 4). With `medals`, ranks 1–3 get a medal instead of the number. */
function Board({ title, rows, medals = false }: { title: string; rows: LeaderboardEntry[]; medals?: boolean }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <Eyebrow>{title}</Eyebrow>
      <div className="flex flex-col">
        {rows.map((r) => {
          const rank = rows.findIndex((x) => x.value === r.value) + 1;
          return (
          <div key={r.playerName} className="flex h-10 items-center gap-3 border-t border-line">
            {medals && rank <= 3 ? (
              <Image src={`/icons/${MEDALS[rank - 1]}.svg`} alt={String(rank)} width={18} height={18} className="shrink-0" />
            ) : (
              <span className="w-[18px] shrink-0 type-code text-fg-tertiary">{rank}</span>
            )}
            <span className="min-w-0 flex-1 truncate type-label-m text-fg">{r.playerName}</span>
            <span className="type-heading-xxs text-fg">{r.value}</span>
          </div>
          );
        })}
      </div>
    </div>
  );
}

export function LeaderboardsPanel({ ev, t }: { ev: PastEvent; t: T }) {
  const players = ev.attendance
    .filter((a) => a.attended)
    .map((a) => a.playerName)
    // Code-point order, as in the design: plain names, then clan-tagged ([BS], [En-Y]…), then Cyrillic.
    .sort();
  const ff = ev.friendlyFireIncidents ?? [];
  return (
    <section className="flex flex-col gap-6 rounded-xl bg-surface p-6">
      <h2 className="type-heading-m text-fg">{t("boards.title")}</h2>
      <div className="flex flex-col gap-2">
        <Eyebrow>{t("boards.players")}</Eyebrow>
        <div className="flex flex-wrap gap-1.5">
          {players.map((p) => (
            <Tag key={p}>{p}</Tag>
          ))}
        </div>
      </div>
      {ev.leaderboards && (
        <div className="flex flex-col gap-8 md:flex-row">
          <Board title={t("boards.aiKills")} rows={ev.leaderboards.aiKills} medals />
          <Board title={t("boards.deaths")} rows={ev.leaderboards.deaths} />
        </div>
      )}
      {ff.length > 0 && (
        <div className="flex flex-col gap-1">
          <Eyebrow className="text-fg-danger">{t("boards.friendlyFire")}</Eyebrow>
          {ff.map((f, i) => (
            <a
              key={i}
              href={replayUrl(ev.replayCodes[0], ev)}
              target="_blank"
              rel="noreferrer"
              className="flex h-10 items-center gap-3 border-t border-line hover:bg-inset"
            >
              <span className="flex min-w-0 flex-1 items-center gap-3 type-label-m text-fg">
                <span className="truncate">{f.shooter}</span>
                <Icon name="arrow-right-ff" />
                <span className="truncate">{f.victim}</span>
              </span>
              <span className="flex items-center gap-1 type-caption text-fg-secondary">
                {f.at}
                <Icon name="external-ff" />
              </span>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

/** Figma "Ачивки" (26:3520). */
export function AwardsPanel({ awards, t }: { awards: Award[]; t: T }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl bg-inset p-6">
      <h2 className="type-heading-m text-fg">{t("awards.title")}</h2>
      <div className="flex flex-col gap-2">
        {awards.map((a) => (
          <AwardCard key={a.kind} award={a} t={t} />
        ))}
      </div>
    </section>
  );
}
