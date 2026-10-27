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
- `games/fix-and-flank/` — the Fix and Flank mini-game (plain JS, no build step; its own `CLAUDE.md`, tests and docs),
  moved in with its history on 2026-10-15. The hub serves it; see «Мини-игры» below.
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

- **Redirects and links built in a route use `siteUrl(path, request)`** (`web/src/lib/site.ts`), never
  `new URL(path, request.url)`: behind Caddy, request.url is the app's own `localhost:3004`, so «Выйти» once sent
  people to https://localhost:3004/events. `siteUrl` uses `NEXT_PUBLIC_BASE_URL` (dev falls back to the request).
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
     Editing the template doesn't touch games already scheduled (they keep their copy). A mission made with TS Mission
     Builder's advanced squad mode (2026-10-26) carries its seats: the addon folder, picked on step 2 or on this step
     (which takes only the slots), fills the squads (`parseSquads`; user request 2026-10-26). They're on the faction
     manager in the scenario's world, usually `default.layer`: each `SCR_GroupPreset` with `m_aTS_Slots` is a squad,
     each `TS_SlotDef`'s `m_sName` a slot (fireteam prefix included), and preset N's callsign is the faction's Nth
     `m_aSquadNames` entry (1'1, or names like Krahujec-1). Presets without seats are skipped. The addon has no Discord
     roles: the "always" rules of `slot-roles.json` fill the ones they cover (`lib/missions/slotRoles.ts`, user decision
     2026-10-26: not the "decided" answers; spaces don't count for a whole name, so "Machinegunner" matches), the rest
     stay «Любой» for the author, and the import's line says how many. Roles already picked in the dialog stay on
     slots with the same squad and name. The server reads the file on each dialog open (`editorOptions`).

  A new mission goes step by step; an edit can jump between steps and save from any. Saving (`saveMission`) fetches the
  Workshop image again for a new mission or on «Обновить из Workshop», and stores it in the uploads folder
  (`lib/uploads.ts`: `HUB_UPLOADS_DIR`, served at `/uploads/…`). The page's «…» holds Изменить, В архив / Вернуть из
  архива and Удалить; delete is only for a mission with no scheduled or played games (else archive), and takes its
  cancelled games with it. Archived missions leave the
  catalogue and the schedule dialog, and their page shows «В архиве». Every hub save sets `missions.hub_edited_at`
  (migration 005), and `db:seed --update` leaves those missions alone.
- **Mission «Комментарии»** (`components/mission/MissionComments.tsx`, `lib/missions/comments.ts`; user request
  2026-10-27): players' feedback on the mission itself (bugs, balance, what to fix), last in the page's main column.
  The hub's own `mission_comments` (migration 014), never posted to Discord, unlike a game's «Комментарии» (its
  thread). Everyone reads them; members of the Discord write (2000 characters at most), the box on top and the
  comments newest first; a mission author's comment says «автор миссии» (`authorIds`). «Удалить» for its writer or an
  admin sets `deleted_at`; deleting the mission takes its comments with it (ON DELETE CASCADE). Same box and rows as a
  Fix & Flank map's comments (`components/event/CommentForm.tsx`, `CommentList.tsx`, `DeleteCommentButton.tsx`).
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
  changes. The page shows squads HQ (1'6) first, then in the game's own order (`lib/squads.ts`). Slots, existing
  and new, are dragged into order inside their squad by a handle (or ↑/↓ on it; user request 2026-10-12, not
  between squads); whoever is in a slot moves with it. The order is `event_slots.sort_order` (migration 011,
  NULL = position order), never the position, so a page left open still takes the slot it shows.
  An open usual slot also has «Отменить» (no game that day): `skipped_slots` (migration 004) holds called-off slot times
  and the feed and calendar leave them out for good (`listSkippedSlots`); scheduling a game then still shows it. No undo UI.
- **Scheduled game pages stay live** (`components/event/LiveRefresh.tsx`): while the tab is visible it polls
  `/api/events/<id>/version` every 5 s (an md5 of the slots, who's in them and the attached plan, `getEventVersion`) and calls
  `router.refresh()` when it changed (slot names count too, so an admin's rename shows up). Taking a slot someone just took is refused anyway («Слот уже заняли»).
- **Discord announcement** («Анонс в Дискорд», `lib/discord/`, admins; user decisions 2026-10-09): the hub drives slotting
  and the Discord post only mirrors it. An admin's button on an upcoming game posts it to `DISCORD_ANNOUNCE_CHANNEL_ID`
  as the Tactical Shift bot (`DISCORD_BOT_TOKEN`, plain REST, no gateway), after a confirm; the page then links to the
  post. From then on every change to the game (slots taken/left/assigned/cleared, «Изменить слоты», time, plan attached
  or detached, cancelled, «Игра окончена») calls `refreshAnnouncement`, which edits the post 2 s later (a burst becomes
  one edit; one post or edit at a time per game; an edit whose content didn't change is skipped via `events.discord_hash`,
  migration 008). The post's button links to the game's page: signing up happens on the site. A post deleted in Discord
  is forgotten on the next edit and the button comes back. The look is ONE pure function, `renderGamePost(PostGame)` in
  `lib/discord/template.ts`, in the layout of Galaxy's hand-written announcements: the message text (# Что | Operation …,
  # Когда | <date>, За кого / Против кого, then the roles in `DISCORD_ANNOUNCE_PING_ROLES`, @Анонсы,@Reforger in
  production, pinged on the first post only; empty for a test channel), the cover attached to the
  first post as a file so it renders large (edits keep it), then the slot card and «Записаться». `fitLimits` trims any
  template to Discord's limits and nobody else is pinged (`allowed_mentions`). Dev: no channel = off;
  `/api/dev/discord-post/<id>` returns the message JSON; `DISCORD_API_URL` points the sender at a stand-in for testing.
  **Plan thread** (user decision 2026-10-12): every new plan attached to an announced game (not the same code pasted
  again) is a message in a thread under its post, «<who> прикрепил новый план — `CODE`» with an «Открыть в
  Планировщике» link button (the hub's `/plan/open?mission=…&code=…`, view-only, no plan key). The first one starts the
  thread («Обсуждение | Operation …», archives after a quiet week; a new plan reopens it); a plan attached before the post
  goes up starts it when the post does. `announcePlan` in post.ts, look in template.ts (`renderPlanNotice`,
  `planThreadName`). Thread id = the post's id, so nothing is stored. The bot needs Create Public Threads and Send
  Messages in Threads in the channel; without them the attach still works and the error is only logged.
  **Rate limits** (2026-10-12): #анонсы is an Announcement channel and the posts are published (crossposted), so
  Discord sometimes holds an edit off for minutes. `discordRequest` sits out a wait up to 5 s and throws
  `DiscordRateLimited` for a longer one; `refreshAnnouncement` then edits after the wait, rendering the game as it is
  by then (every change meanwhile in one edit). It used to sleep holding the edit it had already rendered, so the post
  lagged ~10 minutes and then showed old slots. Each 429 is logged (`[discord] … rate limited for N s`). On server
  start `src/instrumentation.ts` runs `resyncAnnouncements` (announced upcoming games and every announced game of the
  past week), so an edit pending at a deploy isn't lost and a game changed in the database by hand gets its post
  updated on the next start (an up-to-date post costs no Discord call).
- **«Комментарии»** (`components/event/Comments.tsx`, `lib/discord/comments.ts`; user request 2026-10-14) is the plan
  thread under the game's announcement, read and written in the hub: a section after Plan on upcoming and played game
  pages. Members only (signed in and on the server); others get a login prompt. A game that isn't announced has no
  thread, so the section says the discussion opens with the announcement. The bot reads the thread's last 100 messages
  at most every 10 s per game (shared by all viewers); the section polls `/api/events/<id>/comments` and re-renders
  when they change. A member's comment goes out through the channel's «TS Hub» webhook under their name and avatar
  (Discord tags it APP; nobody pinged), so the bot needs **Manage Webhooks** in #анонсы (granted 2026-10-14); the
  first comment starts the thread (`inThread` in post.ts, shared with the plan notices). Members' text written in
  Discord reaches the hub only with the app's **Message Content intent** (Developer Portal → Bot), REST reads included:
  without it those messages arrive empty and show «Это сообщение можно посмотреть только в Discord». Discord markdown
  is drawn by `lib/discord/markdown.ts` + `DiscordText.tsx`. Bot messages (plan notices) are drawn as a line.
  **Dev:** `npm run dev:discord` runs `next dev` against a local stand-in for Discord's REST API
  (`scripts/discord-stand-in.mjs`, state in `.data/discord-stand-in.json`): announce, plan notices and comments work
  end to end; `POST :3099/dev/say` writes as a Discord member.
- **Trainings and «Я приду!»** (user decisions 2026-10-11; migration 010). A mission's «Тренировка» checkbox
  (`missions.training`, editor step 1) makes it a training: its games say «Тренировка» instead of «Operation» (hero,
  mission page, Discord «Что | Тренировка …»), get no slots and no plan (scheduleGame copies no slot template; no
  «Нарисовать план», `/plan/open` refuses), wear a blue chip and calendar dot (`--color-training` = the friendly blue,
  `dot-training.svg`), stay out of the Миссии catalog (admins: `?training=1`, like the archive), and «Игра окончена»
  stores `stats = NULL`: the played page shows only «Кто был», duration and the replay (no totals, rankings, awards or
  plan, even for games finished before the flag). A game finished without a recording (the 14 Oct training ran
  without the TS Replay mod and was set to played by hand, 2026-10-14) shows no replay button, duration or «Кто был». The flag only hides the mission's Markers.layer, planning and slot
  template, never deletes them: unticking it gives them back. **Any game without slots** (a training or a mission with
  no template) takes «Я приду!» / «Не приду» (`event_rsvps`, `comeToGame`/`skipGame` in `lib/slots/actions.ts`, until
  the start; admins any time): the hero shows «N придут», the aside «Кто придёт», the feed «Придут N», the Discord card
  «Придут: N — names» with an «Я приду» button and a «👉 Записаться» link (to the page top). RSVPs count in `getEventVersion` (live
  refresh) and call `refreshAnnouncement`; a played game's «из N записались» uses them. `RsvpButton` is keyed by kind:
  useActionState keeps the action it started with.
- **«Игроки»: in-game names → members** (`app/players`, `lib/roster/`, admins only — others get a 404 and no nav item;
  user decision 2026-10-11: matched by hand, not by players typing a code in game). Lists every name from played
  games' rosters, most recently played first, with the member it's matched to (`player_names`, migration 009: one
  member per name, several names per member) or a suggestion from `lib/roster/match.ts`: the same Bohemia account as an
  already matched name (a rename), else a nickname/username equal or close once clan tags in [], case, punctuation
  and Cyrillic vs Latin are ignored (a nickname's part in round brackets counts on its own: "Smoker (OnlineKiller)";
  names are also compared with the tags kept: "BS_ANR" = "[BS] ANR"). Members who lacked @Reforger when the member
  list was read aren't in `players` until they log in, so they can't be seated in a slot; «Добавить участника» on
  this page (`components/roster/AddMember.tsx`, `addMember` in `lib/roster/actions.ts`; user request 2026-10-22)
  adds one by Discord ID and display name, so slotting works before their first login. The bot fetches the
  nickname, username and avatar as a login would (the typed name is the fallback when Discord can't be asked);
  someone not on the server is refused, and a member already in the hub is left as they are. Before it, 2026-10-11,
  [RTT] J.A.N. was added by hand in the database.
  «Привязать точные совпадения» takes the sure ones (same account, or exactly one equal nickname) in one go;
  «Другой…» picks any member. Account IDs come from the recordings' `player_join.playerGuid` and are stored per game
  in `event_attendance.account_id` at «Игра окончена» (games finished before 2026-10-11 get them on «Пересчитать»);
  they never reach the browser. Player profiles will read attendance through `player_names`.
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
- **«Бинго»** (user decisions 2026-10-20): who completed a line on their TS Bingo card (the Workbench addon «TS Bingo»:
  a 5×5 card of 24 clichés and a free centre, crossed by the players themselves). The mod writes into the TS Replay
  recording (it depends on TS Replay): `bingo_card {playerId, playerGuid}` once per player per loaded world, and
  `bingo {playerId, playerGuid, line, marked, cells}` once per completed line (0-4 rows, 5-9 columns, 10/11 diagonals;
  a line counts once, uncrossing doesn't take it back; `cells` is the whole card, "" in the centre). No names: they
  come from the recording's `player_join`, by account, else by playerId. «Игра окончена» stores the result in
  `events.stats.bingo` (`lib/replays/bingo.ts`; null = no bingo events, the box is hidden; trainings have no stats).
  The box (`components/event/BingoPanel.tsx`, design A) sits above «Ачивки»: the title «Бинго 3» (the number of
  winners in the secondary colour, no subtitle; user request 2026-10-21), then a row per winner, earliest first
  (no time or «Первым» on it, user request 2026-10-21), with a thumbnail of their card; a row opens the whole card (`BingoCard.tsx`: the mod's card art,
  cells placed from ts-bingo/tools/make_layout.mjs, a marker through each line). Nobody got a line: «Бинго 0».
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
- **Game server pill** (`components/ServerStatus.tsx`, user request 2026-10-12): members of the Discord (signed in,
  `viewer.inGuild`) see a pill in the bottom-right corner of every page (AppHeader renders it): a green dot and «Сервер
  запущен», or a grey one and «Сервер отдыхает». It opens into a card with the server's name, password, IP and port,
  each click-to-copy. `/api/server-status` (members only) sends the Steam query A2S_INFO to the game server's public
  address 91.206.15.125:17777, like the Discord bot does (the game binds A2S to the public IP, so 127.0.0.1 doesn't
  answer even on the box). The hub asks at most every 20 s, and the pill polls every 30 s while the tab is visible. The
  password comes from `GAME_SERVER_PASSWORD` (not in this public repo; unset = no «Пароль» row). `GAME_SERVER_A2S=host:port`
  points the check at a stand-in.
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
- **Auth:** Discord OAuth ported from the Training Portal, plus an OAuth `state` cookie. The login is shared with the
  Training Portal (`docs/shared-login.md`): one HS256 JWT cookie, `ts_auth`, on the parent domain in production
  (`AUTH_COOKIE_DOMAIN`) and signed with `TS_AUTH_SECRET`, the same value in both apps; `lib/auth/session.ts` must stay in
  step with the portal's. Roles are refreshed with the bot token every 10 minutes per member (`lib/viewer.ts`). Without the env vars, login redirects back with a "not configured" notice. Steam is planned.
  Env template: `web/.env.example`. Pages ask `getViewer()` (`lib/viewer.ts`) who is looking. On a dev machine
  without OAuth configured it returns a stand-in from `data/players` (Galaxy, an admin, by default; switch with
  `/api/dev/viewer?name=<display name or Discord username>[&roles=SL,Rifleman]`, roles default to Rifleman; display names
  carry clan tags, so `?name=vonscheer` is easier than `[лампас]VonScheer`; a name that isn't a member's can browse but
  not write) so write flows can be tried;
  the header shows "dev" next to the name. Roles: `viewer.roles` (names via `DISCORD_ROLE_MAP`), `hasRole`,
  `isMissionMaker` (@mission officer), `isAdmin` (`HUB_ADMIN_IDS` / `HUB_ADMIN_ROLES`).
  Admins are the Discord user IDs in `HUB_ADMIN_IDS` (production: Galaxy) and/or the role names in `HUB_ADMIN_ROLES`.
- **«Мини-игры» → Fix & Flank** (user decisions 2026-10-15, sketches in the conversation). The
  header's «Мини-игры» is a menu (`NavDropdown`; a labelled group in `NavMenu`) with one game. For now only admins and the Discord's @srv role
  (`GAMES_PREVIEW_ROLE_ID` in `AppHeader`, checked against `viewer.roleIds`, the member's raw role ids, since @srv isn't
  in `DISCORD_ROLE_MAP`) see it in the nav (user decision 2026-10-15); the pages are open to members by link. `app/games/fix-and-flank`:
  the game's page (cover with the title on it, Играть → a map picker with search, author and sort; Создать карту → the
  editor; «Карты» with Свежие / Популярные / Мои карты tabs and the maps' cards on the page itself, not in a panel, each
  with «Вы играли» once the viewer has finished a run on it (`MapCard`, the user's design); «Активность»), and `maps/[id]`: the map turning in 3D (the game's `preview` page in an
  iframe), plays and record, «Рейтинг» (each player's best win, top 10, **turns only**; the run's losses shown beside, «25 ходов / 4 потери»), «Комментарии» (the hub's own,
  composer on top). The game is served as it is from `games/fix-and-flank` by `app/games/fix-and-flank/[...path]`
  (`/play`, `/editor`, `/preview` and the files they load; nothing else of the folder) and loads a hub map with
  `?src=/api/games/fix-and-flank/maps/<id>`. **Members only** (`viewer.inGuild`): signed out goes to the login.
  Published maps are locked (no edits: they'd void runs and records) and never copied (the game's pencil shows only while
  an author tries their own draft, the editor opens only the viewer's own drafts, and publishing refuses a map whose
  `layoutKey` is already published, a safety net for a map sent to the API by hand; exact copies only); drafts are their author's; publishing needs only
  a valid map (no clear check). Runs are seed + orders, replayed on the server through the game's sim to get the
  result (so records can't be faked) and played back for «Повтор». Data: `getFixAndFlankData()` (`lib/data/fixAndFlank.ts`)
  over `fnf_maps`, `fnf_runs`, `fnf_comments` (migration 012, which also puts in Trench Line, credited to the game's
  authors via `author_label`; such maps stay out of «Активность»).
  **Maps from the editor:** served by the hub, the game's editor keeps a member's drafts in the hub (`src/editor/hub.js`;
  it knows it's in the hub when `GET /api/games/fix-and-flank/maps?mine=1` answers). Save draft (Ctrl+S) and an open
  draft saving itself 1.5 s after each change; Playtest (saves, then plays the draft, not recorded); Publish (confirm,
  then the map's page); the Maps menu lists your drafts (delete) and published maps, and has no map files (user decision 2026-10-15: a map gets
  into the hub only by being made in the editor). A map never saved as a draft is kept only in that browser, so «Новая
  карта», opening a draft or a «Продолжить» link asks before replacing it (unless it's still blank). API, members only, JSON bodies
  (`lib/fix-and-flank/api.ts`): `POST /maps` (new draft), `PUT|DELETE /maps/<id>` (drafts only; a published map is 409),
  `POST /maps/<id>/publish`. The server reads, cleans and checks every map with the game's own code loaded at run time
  (`lib/fix-and-flank/rules.ts`: `import()` of `games/fix-and-flank/src/*.js` with `turbopackIgnore`, so the build
  never reaches outside `web/`): 14 x 16, a name, and for publishing what the editor's «Ready to play» checks. Map ids
  come from the name (Cyrillic spelled out) plus 4 hex digits. The editor sends a 16:10 JPEG still (`render/still.js`:
  BLUFOR and the objective, no OPFOR) on Save draft, Playtest and Publish → `uploads/fnf/`. Run on its own (`npm start`)
  the editor keeps maps in the browser as before. Served by the hub it never turns into that standalone editor: when the
  hub keeps no maps for the viewer (a dev stand-in with no `players` row gets 403) or doesn't answer, it shows «Черновики
  недоступны» and why. **Dev:** `/api/dev/viewer` with no name goes back to Galaxy. The hub loads the game's rules
  (`src/sim`, `src/ai`, `src/editor/model.js`, `balance.json`) once per server process: restart `npm run dev` after
  changing them, or the API checks maps and replays runs with the old code. Images in `public/` go through the image
  optimizer, which keeps a file for 4 hours under the same name: delete `web/.next/dev/cache/images` (dev) or give a
  replaced image a new name.
  **Runs** (`lib/fix-and-flank/runs.ts`): a game on a published map (`play?src=`, not `&playtest=1`) is recorded.
  `POST /runs {mapId}` starts it and hands out the seed (the player doesn't pick the dice; «Same dice» is gone for
  recorded runs); the game keeps BLUFOR's commits; `POST /runs/<id>/finish {commits}` plays them through the game's own
  `playRun` (`src/ai/run.js`; the AI plays OPFOR again) and stores the result and turns the server got (never the
  browser's), and answers record / personal best for the debrief. A run left unfinished counts for nothing.
  `GET /runs/<id>` serves a finished run; `play?replay=<id>` («Повтор» on the leaderboard, members) plays it back with
  the game's own playback. `game_version` is a hash of `src/sim`, `src/ai` and `balance.json`: a replay of a run made
  under other rules says it may not play out the same. Known limit: the seed is known when the run starts, so a
  patient cheat could search orders offline; server-side dice per commit would close that.
  **Comments** on a map (`lib/fix-and-flank/actions.ts`, user request 2026-10-15): the hub's own `fnf_comments`, written
  with the event page's `CommentForm` (it takes its server action and hidden fields as props), members only, on a
  published map, 2000 characters at most, newest first. «Удалить» for the author or an admin sets `deleted_at`. The game's debrief after a real game can leave one too
  («Оставить комментарий (необязательно)»): `POST /api/games/fix-and-flank/maps/<id>/comments {body}`, the same rules
  (`addMapComment` in `lib/fix-and-flank/comments.ts`, shared with the page's server action).
  The game and its editor are in Russian (`games/fix-and-flank/src/text.js`); the API's messages to them are `fnf.err.*`
  keys in `lib/i18n.ts`, fixed to RU.
  **Taking a map down** (user request 2026-10-15): an admin's «…» on a published map's page has «Удалить карту»
  (`takeDownMap` in `lib/fix-and-flank/actions.ts`, after a confirm): it sets `hidden_at`, so the map leaves the lists,
  its page, the game and «Повтор», and deletes its picture file; runs and comments stay in the database, and putting
  it back is by hand (`hidden_at = NULL`). A taken-down map still counts for the duplicate check on publishing.

## Decided (2026-10-09)

- **The hub drives slotting.** Games are created and slotted in the hub. The slotting bot retires; the hub posts and
  keeps up to date the game's Discord announcement itself («Анонс в Дискорд», an admin's button, not automatic).
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
