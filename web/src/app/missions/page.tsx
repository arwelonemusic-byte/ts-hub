import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { AddMissionButton } from "@/components/mission/MissionActions";
import { MissionCatalog } from "@/components/mission/MissionCatalog";
import { Icon } from "@/components/ui";
import { toCatalog } from "@/lib/catalog";
import { getHubData } from "@/lib/data";
import { plural } from "@/lib/i18n";
import { getT } from "@/lib/i18n-server";
import { canAddMission, editorOptions } from "@/lib/missions";
import { getViewer } from "@/lib/viewer";

/**
 * Figma "Missions · List" (node 52:1362). Filters and the sort live in the URL so a filtered list can be shared.
 * Archived missions stay out of it; admins see them on their own at ?archive=1.
 */
export default async function MissionsPage({ searchParams }: PageProps<"/missions">) {
  const data = getHubData();
  const [all, past, { locale, t }, sp, viewer] = await Promise.all([
    data.listMissions(),
    data.listPast(),
    getT(),
    searchParams,
    getViewer(),
  ]);
  const archiveView = !!viewer?.isAdmin && sp.archive === "1";
  // Training missions stay out of the catalog; admins reach them through ?training=1, like the archive.
  const trainingView = !!viewer?.isAdmin && !archiveView && sp.training === "1";
  const missions = all.filter((m) => !!m.archived === archiveView && (archiveView || !!m.training === trainingView));
  const archived = viewer?.isAdmin ? all.filter((m) => m.archived).length : 0;
  const trainings = viewer?.isAdmin ? all.filter((m) => m.training && !m.archived).length : 0;
  const options = canAddMission(viewer) && !archiveView ? await editorOptions() : null;

  return (
    <>
      <AppHeader active="missions" />
      <main className="flex flex-col items-center px-4 pb-16 pt-10 md:px-8">
        <div className="flex w-full max-w-[1216px] flex-col gap-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-2">
              {(archiveView || trainingView) && (
                <Link href="/missions" className="flex h-8 items-center gap-1.5 self-start type-label-s text-fg-secondary hover:text-fg">
                  <Icon name="chevron-left" />
                  {t("missionPage.back")}
                </Link>
              )}
              <h1 className="type-display-page text-fg">
                {archiveView ? t("catalog.archive.title") : trainingView ? t("catalog.training.title") : t("nav.missions")}
              </h1>
              <p className="type-body-l text-fg-secondary">
                {plural(locale, archiveView ? "catalog.archive.total" : "catalog.total", missions.length)}
                {!archiveView && !trainingView && trainings > 0 && (
                  <>
                    {" · "}
                    <Link href="/missions?training=1" className="underline-offset-2 hover:text-fg hover:underline">
                      {plural(locale, "catalog.training.link", trainings)}
                    </Link>
                  </>
                )}
                {!archiveView && !trainingView && archived > 0 && (
                  <>
                    {" · "}
                    <Link href="/missions?archive=1" className="underline-offset-2 hover:text-fg hover:underline">
                      {plural(locale, "catalog.archive.link", archived)}
                    </Link>
                  </>
                )}
              </p>
            </div>
            {options && viewer && (
              <AddMissionButton
                options={options}
                viewer={{ discordId: viewer.discordId, name: viewer.name, isAdmin: viewer.isAdmin }}
                locale={locale}
                label={t("editor.add.button")}
              />
            )}
          </div>
          <MissionCatalog missions={toCatalog(missions, past)} locale={locale} />
        </div>
      </main>
    </>
  );
}
