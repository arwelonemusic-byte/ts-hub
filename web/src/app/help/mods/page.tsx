import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";
import { CopyButton } from "@/components/event/CopyButton";
import { getT } from "@/lib/i18n-server";
import { FLUSH_DNS, HOSTS_FILE, hostsCommand, hostsLine, MODS_HELP_IPS, modsHelpShown } from "@/lib/mods-help";

/**
 * «Не качаются моды?» (user requests 2026-11-23, 2026-11-24): a hosts line for ar-gcp-cdn.bistudio.com, by a command in
 * an admin PowerShell or by hand in Notepad, with any of the addresses in lib/mods-help.ts. For anyone, signed in or
 * not. A page rather than a dialog, so its link can be dropped in Discord.
 */
export default async function ModsHelpPage() {
  if (!modsHelpShown) notFound();
  const { t } = await getT();
  const many = MODS_HELP_IPS.length > 1;
  const copy = { label: t("modsHelp.copy"), copied: t("mission.copied") };
  // Each address as a box to copy, labelled «Вариант N» when there's a choice.
  const variants = (text: (ip: string) => string) =>
    MODS_HELP_IPS.map((ip, i) => (
      <div key={ip} className="flex flex-col gap-1.5">
        {many && <span className="type-caption text-fg-tertiary">{t("modsHelp.variant", { n: i + 1 })}</span>}
        <CodeBox text={text(ip)} {...copy} />
      </div>
    ));

  return (
    <>
      <AppHeader modsHelp={false} />
      <main className="flex flex-col items-center px-4 pb-16 pt-10 md:px-8">
        <div className="flex w-full max-w-[720px] flex-col gap-10">
          <div className="flex flex-col gap-2">
            <h1 className="type-display-page text-fg">{t("modsHelp.title")}</h1>
            <p className="type-body-l text-fg-secondary">{t("modsHelp.intro")}</p>
          </div>
          <ol className="flex flex-col gap-6">
            <Step n={1} title={t("modsHelp.step1")}>
              <Hint>{t("modsHelp.step1Hint")}</Hint>
            </Step>
            <Step n={2} title={t(many ? "modsHelp.step2Any" : "modsHelp.step2")}>
              {variants(hostsCommand)}
              <Hint>{t("modsHelp.step2Hint")}</Hint>
            </Step>
            <Step n={3} title={t("modsHelp.step3")} />
          </ol>
          <section className="flex flex-col gap-6 border-t border-line pt-8">
            <div className="flex flex-col gap-1">
              <h2 className="type-heading-s text-fg">{t("modsHelp.manual.title")}</h2>
              <p className="type-body-m text-fg-secondary">{t("modsHelp.manual.intro")}</p>
            </div>
            <ol className="flex flex-col gap-6">
              <Step n={1} title={t("modsHelp.manual.step1")}>
                <Hint>{t("modsHelp.manual.step1Hint")}</Hint>
                <CodeBox text={HOSTS_FILE} {...copy} />
              </Step>
              <Step n={2} title={t(many ? "modsHelp.manual.step2Any" : "modsHelp.manual.step2")}>
                {variants(hostsLine)}
              </Step>
              <Step n={3} title={t("modsHelp.manual.step3")}>
                <Hint>{t("modsHelp.manual.step3Hint")}</Hint>
                <CodeBox text={FLUSH_DNS} {...copy} />
              </Step>
            </ol>
          </section>
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

function Hint({ children }: { children: ReactNode }) {
  return <p className="type-body-m text-fg-secondary">{children}</p>;
}

/** A command, line or path to paste, with a copy button. */
function CodeBox({ text, label, copied }: { text: string; label: string; copied: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-line bg-inset p-2 pl-3">
      <code className="min-w-0 flex-1 py-1.5 font-mono type-body-s break-words text-fg select-all">{text}</code>
      <CopyButton text={text} label={label} copiedLabel={copied} />
    </div>
  );
}
