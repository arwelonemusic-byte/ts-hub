import Image from "next/image";
import Link from "next/link";
import { ENABLED_LOCALES } from "@/lib/i18n";
import { getT } from "@/lib/i18n-server";
import { BUILDER_URL, PLANNER_URL, TRAINING_URL } from "@/lib/links";
import { getViewer } from "@/lib/viewer";
import { LanguageToggle } from "./LanguageToggle";
import { buttonClass, Icon } from "./ui";

/** Figma "App header" (8:180): brand · centred nav · account. */
export async function AppHeader({ active }: { active: "events" | "missions" | "players" }) {
  const [{ locale, t }, viewer] = await Promise.all([getT(), getViewer()]);
  const nav = [
    { key: "events", href: "/events" },
    { key: "missions", href: "/missions" },
    // «Игроки» is hidden until the players page exists: { key: "players", href: "/players" },
    { key: "planner", href: PLANNER_URL, external: true },
    { key: "training", href: TRAINING_URL, external: true },
    { key: "builder", href: BUILDER_URL, external: true },
  ];
  return (
    <header className="sticky top-0 z-20 grid h-15 grid-cols-[1fr_auto] items-center border-b border-line bg-surface px-4 py-2 shadow-floating md:px-6 xl:grid-cols-[1fr_auto_1fr]">
      <Link href="/events" className="flex items-center gap-2.5 justify-self-start">
        <Image src="/icons/ts-mark.svg" alt="" width={31} height={24} priority />
        <span className="type-heading-xxs text-fg">Tactical Shift</span>
      </Link>
      <nav className="hidden items-center gap-1 xl:flex">
        {nav.map((n) => (
          <Link
            key={n.key}
            href={n.href}
            {...(n.external ? { target: "_blank", rel: "noreferrer" } : {})}
            aria-current={n.key === active ? "page" : undefined}
            className={`flex h-11 items-center rounded-lg px-3.5 type-label-s ${
              n.key === active ? "bg-raised text-fg" : "text-fg-secondary hover:text-fg"
            }`}
          >
            {t(`nav.${n.key}`)}
          </Link>
        ))}
      </nav>
      <div className="flex items-center gap-3 justify-self-end">
        {ENABLED_LOCALES.length > 1 && <LanguageToggle locale={locale} />}
        {viewer ? (
          <form action="/api/auth/logout" method="post" className="flex items-center gap-2">
            {viewer.avatar && <Image src={viewer.avatar} alt="" width={28} height={28} className="rounded-full" />}
            <span className="hidden type-label-s text-fg sm:inline">{viewer.name}</span>
            {viewer.dev ? (
              // Not a real login: lib/viewer.ts. Switch with /api/dev/viewer?name=…
              <span title={t("auth.devHint")} className="rounded-md px-2 py-1 type-caption text-fg-tertiary">
                dev
              </span>
            ) : (
              <button type="submit" className="rounded-md px-2 py-1 type-caption text-fg-tertiary hover:text-fg">
                {t("auth.logout")}
              </button>
            )}
          </form>
        ) : (
          <a href="/api/auth/login" className={buttonClass("secondary", "m")}>
            <Icon name="user-login" />
            {t("auth.login")}
          </a>
        )}
      </div>
    </header>
  );
}
