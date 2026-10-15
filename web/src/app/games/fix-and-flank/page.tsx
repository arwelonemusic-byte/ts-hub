import Image from "next/image";
import { AppHeader } from "@/components/AppHeader";
import { ActivityPanel } from "@/components/fix-and-flank/ActivityPanel";
import { PlayPicker } from "@/components/fix-and-flank/MapPicker";
import { MapsSection, type MapsTab } from "@/components/fix-and-flank/MapsSection";
import { buttonClass, ButtonLink, Icon, StatusChip } from "@/components/ui";
import { getFixAndFlankData } from "@/lib/data";
import { FNF_AUTHORS, FNF_COVER, gameUrl } from "@/lib/fix-and-flank/game";
import { getT } from "@/lib/i18n-server";
import { getViewer } from "@/lib/viewer";

const ACTIVITY = 12;

/**
 * «Мини-игры» → Fix & Flank (the user's sketch "Fix & Flank Details page", 2026-10-15): the game's hero
 * (cover, title, authors, Играть and Создать карту), then «Карты» with its tabs and «Активность» beside it.
 * Playing and making maps is for members of the Discord.
 */
export default async function FixAndFlankPage({ searchParams }: PageProps<"/games/fix-and-flank">) {
  const sp = await searchParams;
  const data = getFixAndFlankData();
  const [{ locale, t }, viewer] = await Promise.all([getT(), getViewer()]);
  const [fresh, popular, mine, activity] = await Promise.all([
    data.listMaps("fresh"),
    data.listMaps("popular"),
    viewer ? data.listMapsBy(viewer.name) : [],
    data.listActivity(ACTIVITY),
  ]);
  const canPlay = !!viewer?.inGuild;
  const tab: MapsTab = sp.tab === "popular" || sp.tab === "mine" ? sp.tab : "fresh";
  // Sent back from the game's pages (app/games/fix-and-flank/[...path]) without being a member.
  const turnedAway = sp.members === "1";

  return (
    <>
      <AppHeader active="games" />
      <main className="flex flex-col items-center gap-6 px-4 pb-16 pt-6 md:px-8">
        <div className="flex w-full max-w-[1216px] flex-col gap-10 lg:flex-row lg:items-center">
          <Image
            src={FNF_COVER}
            alt=""
            width={1280}
            height={800}
            sizes="(min-width: 1024px) 588px, 100vw"
            priority
            className="aspect-[16/10] w-full rounded-xl bg-inset object-cover lg:flex-1"
          />
          <div className="flex min-w-0 flex-col gap-4 lg:flex-1">
            <StatusChip tone="neutral">{t("fnf.chip")}</StatusChip>
            <h1 className="type-display-event text-fg">{t("fnf.title")}</h1>
            <span className="flex items-center gap-2 type-body-m text-fg-label">
              <Icon name="user" />
              <span className="text-fg-accent">{FNF_AUTHORS.join(", ")}</span>
            </span>
            <p className="max-w-[56ch] type-body-l text-fg-body">{t("fnf.description")}</p>
            {canPlay ? (
              <div className="flex flex-wrap gap-2">
                <PlayPicker maps={{ fresh, popular }} locale={locale} className={`${buttonClass("primary", "m")} flex-1`} />
                <a href={gameUrl("editor")} className={buttonClass("secondary", "m")}>
                  <Icon name="pencil" />
                  {t("fnf.createMap")}
                </a>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {!viewer && (
                  <ButtonLink href="/api/auth/login" variant="primary" className="self-start">
                    <Icon name="play" />
                    {t("fnf.login")}
                  </ButtonLink>
                )}
                <p className={`type-body-s ${turnedAway ? "text-fg-danger" : "text-fg-secondary"}`}>{t("fnf.membersOnly")}</p>
              </div>
            )}
          </div>
        </div>
        <div className="flex w-full max-w-[1216px] flex-col gap-4 lg:flex-row lg:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <MapsSection lists={{ fresh, popular, mine }} initial={tab} canPlay={canPlay} signedIn={!!viewer} locale={locale} />
          </div>
          <aside className="flex shrink-0 flex-col gap-4 lg:w-[360px]">
            <ActivityPanel items={activity} now={new Date()} locale={locale} t={t} />
          </aside>
        </div>
      </main>
    </>
  );
}
