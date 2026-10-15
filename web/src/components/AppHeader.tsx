import Image from "next/image";
import Link from "next/link";
import { ENABLED_LOCALES } from "@/lib/i18n";
import { getT } from "@/lib/i18n-server";
import { FNF_HOME } from "@/lib/fix-and-flank/game";
import { BUILDER_URL, PLANNER_URL, TRAINING_URL } from "@/lib/links";
import { SERVER_INFO } from "@/lib/server-status";
import { getViewer } from "@/lib/viewer";
import { LanguageToggle } from "./LanguageToggle";
import { NavDropdown } from "./NavDropdown";
import { NavMenu, type NavItem } from "./NavMenu";
import { ServerStatus } from "./ServerStatus";
import { buttonClass, Icon } from "./ui";

/** The Discord's @srv role: the only ones besides hub admins who see «Мини-игры» in the nav for now. */
const GAMES_PREVIEW_ROLE_ID = "633772282745061457";

/** Figma "App header" (8:180): brand · centred nav · account. */
export async function AppHeader({ active }: { active: "events" | "missions" | "games" | "players" }) {
  const [{ locale, t }, viewer] = await Promise.all([getT(), getViewer()]);
  // «Мини-игры» is a menu: one game for now (user request 2026-10-15). Shown only to admins and @srv until it opens
  // to everyone (user decision 2026-10-15); its pages themselves are open to members.
  const games: NavItem[] = [{ key: "fixAndFlank", href: FNF_HOME, label: t("nav.fixAndFlank"), active: active === "games" }];
  const seesGames = !!viewer && (viewer.isAdmin || viewer.roleIds.includes(GAMES_PREVIEW_ROLE_ID));
  const nav: NavItem[] = [
    { key: "events", href: "/events" },
    { key: "missions", href: "/missions" },
    ...(seesGames ? [{ key: "games", href: FNF_HOME, children: games }] : []),
    // «Игроки» is the admins' name matching for now (app/players); everyone gets it once player profiles exist.
    ...(viewer?.isAdmin ? [{ key: "players", href: "/players" }] : []),
    { key: "planner", href: PLANNER_URL, external: true },
    { key: "training", href: TRAINING_URL, external: true },
    { key: "builder", href: BUILDER_URL, external: true },
  ].map((n) => ({ ...n, label: t(`nav.${n.key}`), active: n.key === active }));
  return (
    <header className="sticky top-0 z-20 grid h-15 grid-cols-[1fr_auto] items-center border-b border-line bg-surface px-4 py-2 shadow-floating md:px-6 xl:grid-cols-[1fr_auto_1fr]">
      <Link href="/events" className="flex items-center gap-2.5 justify-self-start">
        <Image src="/icons/ts-mark.svg" alt="" width={31} height={24} priority />
        <span className="type-heading-xxs text-fg">Tactical Shift</span>
      </Link>
      <nav className="hidden items-center gap-1 xl:flex">
        {nav.map((n, i) => [
          // A hairline between the hub's own sections and the other TS apps.
          n.external && !nav[i - 1]?.external && <span key="divider" aria-hidden className="mx-2 h-5 w-px bg-line-strong" />,
          n.children ? (
            <NavDropdown key={n.key} item={n} />
          ) : (
            <Link
              key={n.key}
              href={n.href}
              {...(n.external ? { target: "_blank", rel: "noreferrer" } : {})}
              aria-current={n.active ? "page" : undefined}
              className={`flex h-11 items-center gap-1.5 rounded-lg px-3.5 type-label-s ${
                n.active ? "bg-raised text-fg" : "text-fg-secondary hover:text-fg"
              }`}
            >
              {n.label}
              {/* The other TS apps open in a new tab; the icon (62% white) matches the nav's text. */}
              {n.external && <Icon name="external-ff" />}
            </Link>
          ),
        ])}
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
        <NavMenu items={nav} labels={{ open: t("nav.menu"), close: t("nav.menuClose") }} />
      </div>
      {/* Members of the Discord: the game server's status, fixed to the bottom-right corner of every page. */}
      {viewer?.inGuild && (
        <ServerStatus
          info={SERVER_INFO}
          labels={{
            up: t("server.up"),
            down: t("server.down"),
            name: t("server.name"),
            password: t("server.password"),
            ip: t("server.ip"),
            port: t("server.port"),
            collapse: t("server.collapse"),
            copyHint: t("mission.copyHint"),
            copied: t("mission.copied"),
          }}
        />
      )}
    </header>
  );
}
