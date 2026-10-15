import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";
import { LeaderboardPanel, MapCommentsPanel } from "@/components/fix-and-flank/MapPanels";
import { buttonClass, ButtonLink, Eyebrow, Icon, StatusChip } from "@/components/ui";
import { getFixAndFlankData } from "@/lib/data";
import { shortDate } from "@/lib/format";
import { FNF_HOME, gameUrl, playUrl, previewUrl } from "@/lib/fix-and-flank/game";
import { format, plural } from "@/lib/i18n";
import { getT } from "@/lib/i18n-server";
import { playerIdOf } from "@/lib/players";
import { getViewer } from "@/lib/viewer";

/**
 * A map of Fix & Flank (the user's sketch "Map Details", 2026-10-15): the map turning in 3D, its name, author,
 * how often it was played and its record, Играть; then «Рейтинг» and «Комментарии» side by side.
 */
export default async function MapPage({ params }: PageProps<"/games/fix-and-flank/maps/[id]">) {
  const { id } = await params;
  const data = getFixAndFlankData();
  const [{ locale, t }, viewer] = await Promise.all([getT(), getViewer()]);
  const map = await data.getMap(id, viewer ? await playerIdOf(viewer) : null);
  if (!map) notFound();
  const [runs, comments] = await Promise.all([data.getLeaderboard(map.id), data.getComments(map.id)]);
  const now = new Date();
  const canPlay = !!viewer?.inGuild;
  const draft = map.status === "draft";

  return (
    <>
      <AppHeader active="games" />
      <main className="flex flex-col items-center gap-6 px-4 pb-16 pt-6 md:px-8">
        <div className="flex w-full max-w-[1216px] flex-col gap-3">
          <Link href={FNF_HOME} className="flex h-11 items-center gap-1.5 self-start type-label-s text-fg-secondary hover:text-fg">
            <Icon name="chevron-left" />
            {t("fnf.back")}
          </Link>
          <div className="flex flex-col gap-10 lg:flex-row lg:items-center">
            {/* The game's own preview page: the map turning slowly, BLUFOR's start and the objective, no OPFOR.
                In a box: an iframe on its own doesn't shrink in a flex row. */}
            <div className="min-w-0 lg:flex-[1.3]">
              <iframe
                src={previewUrl(map.id)}
                title={format(t("fnf.preview"), { name: map.name })}
                className="block aspect-[16/10] w-full rounded-xl bg-inset"
              />
            </div>
            <div className="flex min-w-0 flex-col gap-4 lg:flex-1">
              <span className="flex gap-2">
                <StatusChip tone="neutral">{t("fnf.map.chip")}</StatusChip>
                {draft && <StatusChip tone="neutral">{t("fnf.draft")}</StatusChip>}
              </span>
              <h1 className="type-display-event text-fg">{map.name}</h1>
              <div className="flex flex-col gap-2 type-body-m text-fg-label">
                <span className="flex items-center gap-2">
                  <Icon name="user" />
                  <span className="text-fg-accent">{map.author}</span>
                </span>
                <span className="flex items-center gap-2">
                  <Icon name="calendar" />
                  {shortDate(map.publishedAt ?? map.updatedAt)}
                </span>
              </div>
              {!draft && (
                <div className="grid grid-cols-2 gap-3">
                  <StatBox label={t("fnf.played")} value={map.plays ? plural(locale, "fnf.times", map.plays) : t("fnf.never")} />
                  <StatBox label={t("fnf.record")} value={map.record === null ? "—" : plural(locale, "fnf.turns", map.record)} />
                </div>
              )}
              {draft ? (
                <a href={gameUrl("editor", { draft: map.id })} className={buttonClass("secondary", "m")}>
                  <Icon name="pencil" />
                  {t("fnf.continue")}
                </a>
              ) : canPlay ? (
                <a href={playUrl(map.id)} className={buttonClass("primary", "m")}>
                  <Icon name="play" />
                  {t("fnf.play")}
                </a>
              ) : (
                <div className="flex flex-col gap-3">
                  {!viewer && (
                    <ButtonLink href="/api/auth/login" variant="primary">
                      <Icon name="play" />
                      {t("fnf.login")}
                    </ButtonLink>
                  )}
                  <p className="type-body-s text-fg-secondary">{t("fnf.membersOnly")}</p>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex w-full max-w-[1216px] flex-col gap-4 lg:flex-row lg:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <LeaderboardPanel runs={runs} canWatch={canPlay} now={now} locale={locale} t={t} />
          </div>
          <aside className="flex shrink-0 flex-col gap-4 lg:w-[400px]">
            <MapCommentsPanel comments={comments} viewer={viewer} now={now} locale={locale} t={t} />
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
