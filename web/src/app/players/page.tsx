import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { AddMember } from "@/components/roster/AddMember";
import { PlayerLinks } from "@/components/roster/PlayerLinks";
import { getT } from "@/lib/i18n-server";
import { playerLinks } from "@/lib/roster/links";
import { getViewer } from "@/lib/viewer";

/**
 * «Игроки» (admins only, until player profiles exist): match in-game names from played games to Discord members.
 * Everyone else gets a 404, as if the page weren't there.
 */
export default async function PlayersPage() {
  const [{ locale, t }, viewer] = await Promise.all([getT(), getViewer()]);
  if (!viewer?.isAdmin) notFound();
  const { names, members } = await playerLinks();

  return (
    <>
      <AppHeader active="players" />
      <main className="flex flex-col items-center px-4 pb-16 pt-10 md:px-8">
        <div className="flex w-full max-w-[960px] flex-col gap-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <h1 className="type-display-page text-fg">{t("players.title")}</h1>
              <p className="type-body-l text-fg-secondary">{t("players.subtitle")}</p>
            </div>
            <AddMember locale={locale} />
          </div>
          <PlayerLinks names={names} members={members} locale={locale} />
        </div>
      </main>
    </>
  );
}
