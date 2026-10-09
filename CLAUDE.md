# CLAUDE.md

TS Hub is the community portal for Tactical Shift that ties together Player / Mission / Plan / Event / Replay.
Status: **POC**, not deployed yet (`deploy/README.md`). Missions, players, games and plans are in PostgreSQL. Use real
data when it's at hand; otherwise fill gaps with plausible mock values instead of blocking.

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
npm run dev     # http://localhost:3000 — works with no .env at all (PGlite database, seeded games, dev viewer)
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

- **Data access goes through `getHubData()`** (`web/src/lib/data/`). Pages never query the database directly, so the
  sources can change without touching the UI. Missions come from `missions.ts`, games from `games.ts` (one load of every
  game per request; there are a few dozen).
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
  Filters live in the URL (`?q=&map=&author=&tag=`) via `history.replaceState`; logic is in `lib/catalog.ts`. No sort
  control (user decision): scheduled soonest first, then most recently played, then never played. The subtitle is the
  catalogue's size («41 миссия в каталоге»). Archived missions are left out; admins open them at `?archive=1`.
- **Mission CRUD** (`lib/missions/`, user decisions 2026-10-09): admins add, edit, archive and delete any mission;
  @mission officer members add missions and edit the ones they're a listed author of (a mission maker can't take
  themselves off the authors). One dialog (`components/mission/editor/`) in three steps:
  1. **Workshop** — the link fills in the GUID, scenario (a picker when the addon has several), title without
     "Operation" and the addon's main image. The map comes from the addon's terrain dependency (`lib/maps.ts`: known
     terrain GUIDs, then addon names). Takistan's addon also holds Zargabad, and Everon, Arland and Kolguyev come with
     the game, so an ambiguous or missing match asks. The Workshop has no API: `lib/missions/workshop.ts` reads the
     page's `__NEXT_DATA__`. A scenario already in the catalogue is refused (unique `scenario_id`).
  2. **Briefing and Markers.layer** — typed in and uploaded, or read from the addon folder the author picks
     (`lib/missions/addonFolder.ts`, in the browser, nothing uploaded): the journal config (`SCR_JournalSetupConfig`)
     gives the sections, and the scenario's world gives `<world>_Layers/Markers.layer`. «Миссия без плана» needs no layer.
  3. **Slots** — squads and slots with their Discord role. No squads = played without slotting (`no_slotting`).
     Editing the template doesn't touch games already scheduled (they keep their copy).

  A new mission goes step by step; an edit can jump between steps and save from any. Saving (`saveMission`) fetches the
  Workshop image again for a new mission or on «Обновить из Workshop», and stores it in the uploads folder
  (`lib/uploads.ts`: `HUB_UPLOADS_DIR`, served at `/uploads/…`). The page's «…» holds Изменить, В архив / Вернуть из
  архива and Удалить; delete is only for a mission with no scheduled or played games (else archive), and takes its
  cancelled games with it. Archived missions leave the
  catalogue and the schedule dialog, and their page shows «В архиве». Every hub save sets `missions.hub_edited_at`
  (migration 005), and `db:seed --update` leaves those missions alone.
- **Missions own their slot template.** Each game copies it, and the author or an admin can grow it later (adding
  squads to an old mission). Fireteams are plain text in the slot name ("BLUE - Grenadier"). `requiredRole` is a
  Discord role, and Discord stays the source of truth for roles. Which slot name needs which role is in
  `data/catalogue/slot-roles.json`: the user's fixed rules ("always") plus case-by-case answers ("decided"). Match
  the name without the fireteam prefix or trailing number, case-insensitive. Ask the user about any new slot name.
- **Real mission catalogue:** `data/catalogue/` holds the Discord #каталог-миссий export and the gaps still to fill.
  The hub's missions come from it: `py data/catalogue/build_seed.py` writes `db/seed/missions.json` (missions missing
  from the catalogue come from `data/catalogue/missions-extra.json`: Metal Gambit, and JFKennedy's Chernarus ops Wolfs nest
  and Endsieg, taken from their unpacked addons), and `npm run db:seed` loads it with the Markers.layer files into the
  database. Covers in `web/public/covers/<id>.jpg` are each addon's main Workshop cover (not the scenario image); see
  `coverSource` in missions.json for the exceptions. Wolfs nest and Endsieg use the scenario image from the addon.
- **Games** are the `events` tables (`db/migrations/002_events.sql`): `events` (one row per game, id `<date>-<mission>`,
  status scheduled / played / cancelled; a played game's replay-stats are its `stats` JSONB), `event_slots` (the game's
  copy of the mission's slot template, taken by a player or, for someone with no player row, a name), `event_attendance`
  (in-game names from the replays, not yet linked to players) and `event_replays`. Each mission is its own game, so the
  22 Sep evening is two. Host and PL are players.
- **Slotting** (`lib/slots/`, user decisions 2026-10-09): anyone signed in takes a free slot whose Discord role
  (`requiredRole`) they have, one slot per player per game (taking another moves them), and leaves their own, until the
  game starts. An admin's «…» on each slot puts any member in a free slot (by display name, no role check) or empties
  it, any time. Role names compare without case or spaces ("MachineGunner" = "Machine Gunner"). No progressive locks
  (the bot has none) and no reserving slots for friends (parked). Roles come from the session, so a new Discord role
  counts after the next login.
- **Scheduling** (`lib/events/actions.ts`, admins only — user decision 2026-10-09): one dialog
  (`components/schedule/Schedule.tsx`: date and time, then a searchable grid of mission covers) creates the game with a copy of the
  mission's slot template, then opens its page. It opens from «Создать игру» on an open usual slot in the feed (shown
  on hover, always on touch screens; time filled in), from
  «Запланировать игру» above the calendar (any time, so extra ops too) and from a mission page (mission filled in).
  `extra` is set when the time isn't a usual slot. The game page's «…» changes the time («Изменить время»: same id,
  mission and slots) or cancels it (`status = 'cancelled'`: off the feed, row kept; scheduling that mission on that day
  again replaces it). No other edits: a wrong mission means cancel and schedule anew. The id keeps the day it was first
  scheduled for.
  «Изменить слоты» (same «…», games with slots) edits that game's own slots, never the mission's template
  (`editGameSlots`, user decisions 2026-10-09): existing slots can be renamed (callsigns and squad names too) but
  not deleted, and keep their required role and whoever is in them; new slots and squads (added or duplicated) go
  at the end and take the next positions. A slot's position is its identity (slot actions post it), so it never
  changes. The page shows squads HQ (1'6) first, then in the game's own order (`lib/squads.ts`).
  An open usual slot also has «Отменить» (no game that day): `skipped_slots` (migration 004) holds called-off slot times
  and the feed and calendar leave them out for good (`listSkippedSlots`); scheduling a game then still shows it. No undo UI.
- **Scheduled game pages stay live** (`components/event/LiveRefresh.tsx`): while the tab is visible it polls
  `/api/events/<id>/version` every 5 s (an md5 of the slots, who's in them and the attached plan, `getEventVersion`) and calls
  `router.refresh()` when it changed (slot names count too, so an admin's rename shows up). Taking a slot someone just took is refused anyway («Слот уже заняли»).
- **Finishing a game** («Игра окончена», `lib/events/finish.ts`, admins): from a game's start its hero button becomes
  «Игра окончена». The dialog lists the planner's recordings around the game's time and ticks the game's own
  (`lib/replays/match.ts`): the world file is the scenario's (`Another_Castle.conf` → `Another_Castle`; a shared `TS_Mission`
  world also needs the map, from the terrain folder), and since every server boot starts a new recording, the op is
  the last one started within the hour before the game plus any started in the 3 hours after its start (a late start,
  crash restarts). The server runs the mission for 3–4 hours before an op so players can download mods, then is
  restarted ~15 minutes before the start for the official run: the warm-up runs are older recordings and aren't
  ticked. That picked the real recordings for all 12 ops of 15 Sep–6 Oct (official runs at −14 to −20 min, warm-ups
  at −56 min to −5 h). «Проверить» shows the numbers, «Сохранить игру» writes them: attendance, totals,
  rankings, awards (`lib/replays/stats.ts`, a port of the planner's tools/replay-stats; recordings nobody joined are
  ignored), the replay's /syncplan plan (else the attached one), the PL from the PL slot, `status = 'played'` and
  `finished_at` (migration 007). A played game's «Пересчитать» redoes it with other recordings. Recordings are read
  from the production planner even in dev (`PLANNER_REPLAYS_URL` overrides). Not handled: join-less players and GM
  exclusions (the Python tool's `--label` / `--exclude`).
- **Played games before the hub** (Sep 2026 on) come from `db/seed/played-events.json`: `py data/events/build_past_events.py <reports>`
  builds it from the replay-stats reports in ts-wrapped (numbers, roster, rankings, achievements) plus its `OPS` table
  (mission, scheduled time, plan, PL; one row per op), and `npm run db:seed -- --update` loads it (never over a game
  finished in the hub). An op's mission is named by its replay's world file (`ops_planner.replays.world`; a generic `TS_Mission` world
  needs the terrain and where the players were). Its plan is the last push before the op whose markers sit where it was
  played: no replay has a /syncplan stamp yet. `slotted` is null for games nobody slotted through the hub, and
  friendly-fire incidents have no op clock. The reports' older awards differ from today's rules: «Первая кровь» was the
  first shot (now the first AI kill), and split ops compared raw event times across recordings.
- **Scheduled games**, until the hub creates them, come from `db/seed/scheduled-events.json`, copied by hand from the slotting
  bot's #анонсы post: mission, time, and who took which slot (`"<groupId>/<role>"` → Discord display name as the bot shows
  it, or `{name, discordId}` for someone missing from the member list, who is then added as a player). The seed only adds
  scheduled games, never updates them. A game drops off the feed 4 hours after its start until it's finished
  («Игра окончена»; its page and mission page still reach it). Usual Tue/Sun slots with nothing scheduled are open slots in the feed.
- **Briefings are sections** (`Briefing.sections`, plus optional `sides` for За кого / Против кого), as authors write
  them in the catalogue. A section body is plain text: blank lines split paragraphs, "- " lines are list items, and
  list items under «Задачи» get the numbered badges.
- **Covers are never cropped.** The title is printed on the art, so `Cover` uses 16:10 `object-contain`.
- **Slots and attendance lists show roles on the left and names on the right.**
- **Plans and replays are referenced by code.** They live in the planner's DB. Replay links are in `lib/links.ts`:
  given the game, `replayUrl` adds `&mission=` and `&plan=` so the replay viewer's Plan overlay shows the game's plan
  (when the replay has no /syncplan stamp) and the mission's Markers.layer.
- **Plans** (`lib/plans/`, user decisions 2026-10-09). Two kinds:
  - **A game's plan** is one planner code, attached on the game's page. «Нарисовать план» opens the planner on the
    mission's map and Markers.layer (no hub plan, no key); the PL draws, pushes, and pastes the code back into
    «Прикрепить план». Anyone signed in can attach when the game has none; whoever attached it can paste a newer code
    («Заменить план»); an admin can «Открепить» it. It's stored on the event (`plan_code`, `plan_attached_by`,
    `plan_attached_at`; `lib/plans/actions.ts`). A pushed plan carries `mapKey`, and one drawn on another map is
    refused. The game page shows only that plan, with the planner's read-only map of it below the row (an iframe of
    `<planner>/embed`, `plannerEmbedUrl`); the mission's other plans are on the mission page. It's for people
    to look at: what the game really used comes from the replay's /syncplan stamp (`meta.planCode`), and a played
    game's `plan_code` is that.
  - **A mission plan** is started from a mission page («Нарисовать план», a form POST to `app/plan/open`): always a
    new plan of the author's (a PL often tries a different approach on a rerun, so a player can have several). Every
    push in the planner mints a new code, so the hub groups them: a hub plan has a secret key, the planner tags each
    push made with it (only the key's SHA-256 is stored there, `plans.lineage`), and the hub shows the newest version
    (`GET <planner>/api/plans?lineage=`). No version history (user decision): a push supersedes the previous one. The
    author continues it from its row («Редактировать»). An admin's «Удалить план» on a drawn plan only hides it
    from the mission page (`plans.hidden_at`, migration 006; the row stays). A played game's plan has no delete. Hub plans are the `plans` table (`lib/plans/store.ts`); its
    `event_id` columns are from the earlier design and no longer written.

  Every «open in the planner» goes through `app/plan/open`, which only puts a key in the link for the plan's author;
  everyone else gets a view-only link. The planner's side of the hand-off is `?mission=&plan=&key=&event=` (planner
  `lib/hubLink.ts`); it fetches the map key and Markers.layer from `/api/missions/<id>/planner`, which allows the
  planner origin (CORS). In dev the planner is the local one on :3000 (`PLANNER_PLANS_URL` overrides); replay links
  stay on production. Signing in creates the member's `players` row (`lib/players.ts`), which attaching points at.
- **Auth:** Discord OAuth ported from the Training Portal, plus an OAuth `state` cookie. The session is an HS256
  JWT in `ts_hub_session`. Without the env vars, login redirects back with a "not configured" notice. Steam is planned.
  Env template: `web/.env.example`. Pages ask `getViewer()` (`lib/viewer.ts`) who is looking. On a dev machine
  without OAuth configured it returns a stand-in from `data/players` (Galaxy, an admin, by default; switch with
  `/api/dev/viewer?name=<display name>[&roles=SL,Rifleman]`, roles default to Rifleman) so write flows can be tried;
  the header shows "dev" next to the name. Roles: `viewer.roles` (names via `DISCORD_ROLE_MAP`), `hasRole`,
  `isMissionMaker` (@mission officer), `isAdmin` (`HUB_ADMIN_IDS` / `HUB_ADMIN_ROLES`).
  Admins are the Discord user IDs in `HUB_ADMIN_IDS` (production: Galaxy) and/or the role names in `HUB_ADMIN_ROLES`.

## Decided (2026-10-09)

- **The hub drives slotting.** Games are created and slotted in the hub. Whether the Discord bot then mirrors the
  hub's slotting or retires is still open.
- **Public repo, Discord exports out of git.** The root `.gitignore` keeps the member list and the raw catalogue /
  #анонсы exports out (they hold members' IDs, names, avatars and who slotted where). Never commit them.
- **Deployment:** `hub.tacticalshift.ru` (A record → the Selectel box, requested from the domain owner), following
  the other apps: unit `ts-hub` on :3004 from `/opt/ts-web/ts-hub`, env `/etc/ts-hub.env`, database `ts_hub`.
  Running on the box and public at https://hub.tacticalshift.ru since 2026-10-09 (`deploy/README.md`).
  Repo: https://github.com/arwelonemusic-byte/ts-hub (public).
- **Discord login reuses the Training Portal's Discord app**; it needs the hub's callback URL added as a redirect.

## Not decided yet — don't build ahead

- Whether the slotting bot mirrors the hub or retires.
- Open cardinality decisions in `docs/data-model.md`.
