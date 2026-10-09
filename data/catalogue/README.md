# Mission catalogue export (2026-10-08)

The Discord forum #каталог-миссий, read once to seed the hub's real mission list.

- `discord-catalogue.json`: raw export, 48 posts. Each has its title, tags and every message: text with `## ` headings and `- ` list items, plus attachments.
- `missions.json`: one record per mission, normalised for the hub. It has 38 missions. Ten were dropped on the user's call: Copperhead, GR Iron Dragon, and eight old, probably broken missions (Anvil, Chokehold, Delayed Departure, Squabble, Frozen Assets, Cleaning Crew, Fury Road, Day Zero).
- `announcements-slotting.json`: every #анонсы announcement since February that matches a catalogue mission, with the slotting bot's messages from its thread (crawled 2026-10-09).
- `build_seed.py`: turns `missions.json` plus `missions-extra.json` into the hub's mission seed (`db/seed/missions.json`). Re-run it after changing the catalogue, then `npm run db:seed -- --update` in `web/` (see `db/README.md`).
- `missions-extra.json`: missions the Discord catalogue lacks, already in the seed's shape: Metal Gambit, plus JFKennedy's Wolfs nest and Endsieg (played 6 and 13 Sep 2026; briefing, Markers.layer and cover from their unpacked Workshop addons).
- `slot-roles.json`: slot name → Discord role, the user's rules plus case-by-case answers.
- `files/`: every mission's Markers.layer (`<id>.layer`) plus Field Maneuvers' slot file. `metal-gambit.layer`, `wolfs-nest.layer` and `endsieg.layer` belong to missions that aren't in the catalogue (see `missions-extra.json`). Bastion of death (Бастион Смерти) has no planning (`planning: false`), so it needs no layer.

missions.json fields:
  - title: the Workshop title with "Operation" dropped (user decision; the catalogue title is in `catalogue.title`)
  - Workshop GUID, scenario ID, scenario image and addon cover (`workshop.cover`); `coverSource` says which one the hub shows
  - terrain, as a planner map key
  - authors as Discord user IDs (from the catalogue author tags), and the other tags
  - За кого / Против кого
  - briefing sections, with headings unified to Ситуация / Задачи / Враждебные силы / Дружественные силы / Поддержка / Замечания
  - Markers.layer and slot `.txt` paths in `files/`, with the catalogue message each one came from
  - `slotting` (true / false / null = unknown), `squads` (the slot template) and `slotSource`: the newest bot slotting message for the mission, with every slot's Discord role assigned from `slot-roles.json`

Where the values come from:
- **Workshop:** a post's own link, or else an exact-name Workshop search checked against the author and the scenario file name (`workshop.matchedBy`).
- **Terrain:** the «Карта:» line in a post's «Для плана» reply, or else the one terrain addon among its Workshop dependencies (`terrainSource`).
- **Gaps:** `missing-data.md` lists what is still open: missions with unknown slotting, plus optional briefing, cover and tag gaps.
- **Attachments:** downloaded on 2026-10-08, while the signed Discord links still worked. Circuit Breaker's and Trench Crawlers' layers came from the user. The signed links in `discord-catalogue.json` stop working after about a day.

**Not in git:** `discord-catalogue.json` and `announcements-slotting.json` are raw Discord exports (posters' IDs, message
text, who took which slot), so `.gitignore` keeps them out of the public repo. Everything the hub uses is derived from
them into `missions.json`, `slot-roles.json` and `files/`, which are tracked.
