import { AppHeader } from "@/components/AppHeader";
import { MissionCatalog } from "@/components/mission/MissionCatalog";
import { parseCatalogQuery, toCatalog } from "@/lib/catalog";
import { getHubData } from "@/lib/data";
import { getT } from "@/lib/i18n-server";

/** Figma "Missions · List" (node 52:1362). Filters live in the URL so a filtered list can be shared. */
export default async function MissionsPage({ searchParams }: PageProps<"/missions">) {
  const now = new Date();
  const data = getHubData();
  const [missions, upcoming, past, { locale, t }, sp] = await Promise.all([
    data.listMissions(),
    data.listUpcoming(now),
    data.listPast(),
    getT(),
    searchParams,
  ]);

  return (
    <>
      <AppHeader active="missions" />
      <main className="flex flex-col items-center px-4 pb-16 pt-10 md:px-8">
        <div className="flex w-full max-w-[1216px] flex-col gap-8">
          <div className="flex flex-col gap-2">
            <h1 className="type-display-page text-fg">{t("nav.missions")}</h1>
            <p className="type-body-l text-fg-secondary">{t("catalog.subtitle")}</p>
          </div>
          <MissionCatalog missions={toCatalog(missions, upcoming, past)} initial={parseCatalogQuery(sp)} locale={locale} />
        </div>
      </main>
    </>
  );
}
