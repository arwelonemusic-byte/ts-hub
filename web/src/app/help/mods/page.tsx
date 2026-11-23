import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";
import { CopyButton } from "@/components/event/CopyButton";
import { getT } from "@/lib/i18n-server";
import { MODS_HELP_COMMAND } from "@/lib/mods-help";

/**
 * «Не качаются моды?» (user request 2026-11-23): the fix in three steps, for anyone, signed in or not. A page rather
 * than a dialog, so its link can be dropped in Discord. The command is in lib/mods-help.ts.
 */
export default async function ModsHelpPage() {
  if (!MODS_HELP_COMMAND) notFound();
  const { t } = await getT();

  return (
    <>
      <AppHeader modsHelp={false} />
      <main className="flex flex-col items-center px-4 pb-16 pt-10 md:px-8">
        <div className="flex w-full max-w-[720px] flex-col gap-8">
          <div className="flex flex-col gap-2">
            <h1 className="type-display-page text-fg">{t("modsHelp.title")}</h1>
            <p className="type-body-l text-fg-secondary">{t("modsHelp.intro")}</p>
          </div>
          <ol className="flex flex-col gap-6">
            <Step n={1} title={t("modsHelp.step1")}>
              <p className="type-body-m text-fg-secondary">{t("modsHelp.step1Hint")}</p>
            </Step>
            <Step n={2} title={t("modsHelp.step2")}>
              <div className="flex items-start gap-2 rounded-lg border border-line bg-inset p-2 pl-3">
                <code className="min-w-0 flex-1 py-1.5 font-mono type-body-s break-words text-fg select-all">
                  {MODS_HELP_COMMAND}
                </code>
                <CopyButton text={MODS_HELP_COMMAND} label={t("modsHelp.copy")} copiedLabel={t("mission.copied")} />
              </div>
              <p className="type-body-m text-fg-secondary">{t("modsHelp.step2Hint")}</p>
            </Step>
            <Step n={3} title={t("modsHelp.step3")} />
          </ol>
        </div>
      </main>
    </>
  );
}

/** A numbered step, with the briefing's «Задачи» badge (components/event/Panels.tsx). */
function Step({ n, title, children }: { n: number; title: string; children?: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 rounded-sm bg-accent-subtle px-1.5 py-[5px] type-code-badge text-fg-accent">
        {String(n).padStart(2, "0")}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="type-label-l text-fg">{title}</span>
        {children}
      </div>
    </li>
  );
}
