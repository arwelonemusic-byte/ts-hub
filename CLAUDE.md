# CLAUDE.md

TS Hub is the community portal for Tactical Shift that ties together Player / Mission / Plan / Event / Replay.
Status: **POC**, not deployed yet (`deploy/README.md`). Missions, players and plans are in PostgreSQL; games are
still mock data. Use real data when it's at hand; otherwise fill gaps with plausible mock values instead of blocking.

## Layout

- `web/` — Next.js 16 + React 19 + TypeScript + Tailwind 4, same stack as `ts-ops-planner/web` and the Training Portal.
  Next 16 differs from older docs; check `web/node_modules/next/dist/docs/` (see `web/AGENTS.md`).
- `docs/data-model.md` — entities, cardinality, open decisions.
- `db/` — PostgreSQL: `migrations/` (built tables), `seed/` (catalogue), `schema.sql` (draft of the tables not built yet).
  See `db/README.md`; in dev the app uses PGlite in `web/.data/` with nothing to install.
- `deploy/` — the box's unit, Caddy block, deploy script and one-time setup (`deploy/README.md`).
- `design/events-page/` — Claude Design canvas sources. Figma: https://www.figma.com/design/0RmVKOte1DraFYjN1vY0m9/TS-Hub

```bash
cd web
npm run dev     # http://localhost:3000 — works with no .env at all (PGlite database, mock games, dev viewer)
npm run build   # type check + production build; run before calling a change done
npm run lint
```

## Design tokens — Figma is the source

`web/src/app/globals.css` mirrors the Figma variables 1:1. The `--ts-*` custom properties use the variables'
WEB code syntax, so Dev Mode values paste straight in. Tailwind's default palette is wiped (`--color-*: initial`),
so only token colours exist:

| Figma | Tailwind |
|---|---|
| `color/bg/*` | `bg-page` `bg-surface` `bg-inset` `bg-raised` `bg-accent` … |
| `color/text/*` | `text-fg` `text-fg-body` `text-fg-secondary` `text-fg-tertiary` `text-fg-accent` … |
| `color/border/*` | `border-line` `border-line-strong` `border-line-accent` … |
| `radius/3 4 6 8 12` | `rounded-xs` `-sm` `-md` `-lg` `-xl` |
| `space/N` | Tailwind default scale, N/4 (`space/24` → `p-6`) |
| text style `Heading/L` | `type-heading-l` (one `@utility` per style) |
| `Shadow/Floating` | `shadow-floating` |

Change a token in Figma first, then mirror it here. Don't hardcode hex values or font sizes in components.

## Conventions

- **Data access goes through `getHubData()`** (`web/src/lib/data/`). Pages never query or import mock data directly,
  so real sources replace `mock.ts` without touching the UI. Missions already come from the database (`missions.ts`).
- **Times are MSK** (fixed UTC+3). The usual ops are Tue 20:00 and Sun 19:00 (`lib/schedule.ts`), with muster 15 minutes before.
  Format with `lib/format.ts` (it pins `Europe/Moscow`).
- **Russian only (since 2026-10-08).** All UI work is done in RU: copy, designs and new strings. New keys go
  into the RU dictionary in `lib/i18n.ts` only, and EN stays frozen as it is. Keep using `t()` keys rather than
  inline text, so English can come back by adding `"en"` to `ENABLED_LOCALES`; that also restores the header
  language toggle, which is hidden while only one locale is enabled.
- **i18n mechanics:** the locale is a cookie that server components read via `getT()` (`lib/i18n-server.ts`);
  the toggle is a Server Action. This differs from the planner's client-only provider because the hub renders
  on the server. Mission briefings stay in their authored language.
- **Icons** are the Figma exports in `web/public/icons/`, rendered with `<Icon name>`. Each SVG has its colour baked in,
  so a slot that needs a different colour gets its own export (e.g. `external` vs `external-ff`). Don't recolour them in CSS.
- **Events feed** (`app/events`, Figma 13:2) is one chronological stream of played ops, scheduled ops and
  open usual slots, with no past/upcoming split. The server renders only the month of the anchor (the next op,
  or `?date=YYYY-MM-DD`). `components/feed/EventFeed.tsx` loads neighbouring months from `/api/feed?from=&to=`
  as the edges come within 800px of the viewport, and keeps the view still when it prepends a month (scroll
  anchoring is switched off and the offset is corrected by hand). The calendar follows the row at the top of
  the feed and jumps by day or month. The URL's `?date=` tracks that row, so reload and Back return to it.
  Months are sections and weeks are clipped to their month, so a jump always has a clean start. Open slots
  are shown up to the end of next month (`lib/feed.ts`).
- **Event details** (`app/events/[id]`) follows Figma frames 20:1337 (upcoming) and 20:1990 (played). The sections live in
  `components/event/`. Write actions send signed-out users to log in; taking a slot stays disabled for signed-in users
  until there's a data source to write to. The plan panel works (see Plans). The played page's stat row and «Ачивки»
  use the Figma illustrations in `web/public/illustrations/` (stats 24:3476, achievements 26:3622): an award has a
  `kind` that picks its title (`award.<kind>`), illustration, crop and glow (`components/event/AwardCard.tsx`), and a
  list of players. The bot-kill board gives ranks 1–3 medals.
- **Mission page** (`app/missions/[id]`) follows variant B of the "TS Mission Details" canvas
  (https://claude.ai/artifact/7Xju6DYbRh5139tncVaqaP). It has no blurred backdrop (only event pages have one),
  and the games are rows without covers. The mock missions' GUIDs and scenario IDs are real. The aside shows the
  mission's slot template (`Mission.squads`). A mission without one is played without slotting, and its games use
  «Я приду!» instead. The hub doesn't show Workshop dependencies or update dates (user decision).
- **Missions list** (`app/missions`) follows Figma frame 52:1362: a filter rail (search, map and author dropdowns, tag
  chips; a mission must carry every selected tag) and mission-only cards (cover, title, map, author; no game details).
  Filters and sort live in the URL (`?q=&map=&author=&tag=&sort=`) via `history.replaceState`; logic is in `lib/catalog.ts`.
- **Missions own their slot template.** Each game copies it, and the author or an admin can grow it later (adding
  squads to an old mission). Fireteams are plain text in the slot name ("BLUE - Grenadier"). `requiredRole` is a
  Discord role, and Discord stays the source of truth for roles. Which slot name needs which role is in
  `data/catalogue/slot-roles.json`: the user's fixed rules ("always") plus case-by-case answers ("decided"). Match
  the name without the fireteam prefix or trailing number, case-insensitive. Ask the user about any new slot name.
- **Real mission catalogue:** `data/catalogue/` holds the Discord #каталог-миссий export and the gaps still to fill.
  The hub's missions come from it: `py data/catalogue/build_seed.py` writes `db/seed/missions.json` (Metal Gambit, missing
  from the catalogue, comes from `data/catalogue/missions-extra.json`), and `npm run db:seed` loads it with the Markers.layer
  files into the database. Covers in `web/public/covers/<id>.jpg` are each
  addon's main Workshop cover (not the scenario image); see `coverSource` in missions.json for the exceptions. Games are still mock.
- **Briefings are sections** (`Briefing.sections`, plus optional `sides` for За кого / Против кого), as authors write
  them in the catalogue. A section body is plain text: blank lines split paragraphs, "- " lines are list items, and
  list items under «Задачи» get the numbered badges.
- **Covers are never cropped.** The title is printed on the art, so `Cover` uses 16:10 `object-contain`.
- **Slots and attendance lists show roles on the left and names on the right.**
- **Plans and replays are referenced by code.** They live in the planner's DB. Replay links are in `lib/links.ts`:
  given the game, `replayUrl` adds `&mission=` and `&plan=` so the replay viewer's Plan overlay shows the game's plan
  (when the replay has no /syncplan stamp) and the mission's Markers.layer.
- **Plans** (`lib/plans/`, user decision 2026-10-09). Every push in the planner mints a new code, so the hub groups
  them: a hub plan has a secret key, the planner tags each push made with it (only the key's SHA-256 is stored there,
  `plans.lineage`), and the hub shows the newest version (`GET <planner>/api/plans?lineage=`). Where the plan is
  started decides what it is:
  - from a game's page (its PL, host or an admin): the game's plan. Every push becomes «План» for the game; pushes
    after the game starts don't count;
  - from a mission page: always a new plan of the author's (a PL often tries a different approach on a rerun, so a
    player can have several per mission). They continue one from its row, which says «Редактировать» for them.
    It's listed on the mission and on its upcoming games, where the PL can «Использовать» it, or attach any code.
    Using a plan copies its current version: later pushes on either side don't affect the other.

  No version history (user decision): a push supersedes the plan's previous version, and rows show only the newest.
  Starting a mission plan is a form POST to `app/plan/open`; opening an existing one is a GET link.

  Every «open in the planner» goes through `app/plan/open`, which only puts the key in the link for someone who may
  push to that plan; everyone else gets a view-only link. The planner's side of the hand-off is `?mission=&plan=&key=&event=`
  (planner `lib/hubLink.ts`); it fetches the map key and Markers.layer from `/api/missions/<id>/planner`, which allows
  the planner origin (CORS). Plans are the `plans` table (`lib/plans/store.ts`).
  In dev the planner is the local one on :3000 (`PLANNER_PLANS_URL` overrides); replay links stay on production.
  Mock upcoming games start with no plan.
- **Auth:** Discord OAuth ported from the Training Portal, plus an OAuth `state` cookie. The session is an HS256
  JWT in `ts_hub_session`. Without the env vars, login redirects back with a "not configured" notice. Steam is planned.
  Env template: `web/.env.example`. Pages ask `getViewer()` (`lib/viewer.ts`) who is looking. On a dev machine
  without OAuth configured it returns a stand-in from `data/players` (Galaxy, an admin, by default; switch with
  `/api/dev/viewer?name=<display name>`) so write flows can be tried; the header shows "dev" next to the name.
  Admins are the Discord user IDs in `HUB_ADMIN_IDS` (production: Galaxy) and/or the role names in `HUB_ADMIN_ROLES`.

## Decided (2026-10-09)

- **The hub drives slotting.** Games are created and slotted in the hub. Whether the Discord bot then mirrors the
  hub's slotting or retires is still open.
- **Public repo, Discord exports out of git.** The root `.gitignore` keeps the member list and the raw catalogue /
  #анонсы exports out (they hold members' IDs, names, avatars and who slotted where). Never commit them.
- **Deployment:** `hub.tacticalshift.ru` (A record → the Selectel box, requested from the domain owner), following
  the other apps: unit `ts-hub` on :3004 from `/opt/ts-web/ts-hub`, env `/etc/ts-hub.env`, database `ts_hub`.
  Running on the box since 2026-10-09; public once DNS resolves and the Caddy block is added (`deploy/README.md`).
  Repo: https://github.com/arwelonemusic-byte/ts-hub (public).
- **Discord login reuses the Training Portal's Discord app**; it needs the hub's callback URL added as a redirect.

## Not decided yet — don't build ahead

- Whether the slotting bot mirrors the hub or retires.
- Open cardinality decisions in `docs/data-model.md`.
