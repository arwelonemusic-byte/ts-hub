# Data model

Five core objects plus **Map** (terrain), which Mission, Plan and Replay all hang off.
Dashed (`..`) links are derived — don't store them, compute them.

```mermaid
erDiagram
  PLAYER ||--o{ EVENT : "organizes"
  PLAYER }o--o{ EVENT : "slots into"
  PLAYER }o--o{ REPLAY : "appears in"
  PLAYER }o--o{ MISSION : "authors"
  PLAYER |o--o{ PLAN : "authors"
  PLAYER }o..o{ MISSION : "played (derived)"
  EVENT }o--|| MISSION : "plays"
  EVENT }o--o{ PLAN : "uses"
  REPLAY }o--o| EVENT : "recording of"
  REPLAY }o--o| PLAN : "synced plan"
  REPLAY }o..o| MISSION : "via event (derived)"
  PLAN }o--o| MISSION : "made for"
  MISSION }o--|| MAP : "set on"
  PLAN }o--|| MAP : "drawn on"
  REPLAY }o--|| MAP : "recorded on"
```

## Fields (from the FigJam board)

**Event** — date & time · mission · status (upcoming / past)
- upcoming: players slotted / max slots · plan(s) submitted (by the Platoon Leader)
- past: players joined · replay(s) (several if the server restarted) · plan used · stats

**Mission** — Workshop URL · cover image · briefing · author(s) (multiple?) · tags ·
events it was part of · times played · `Markers.layer` (needed for planning)

## Facts that shaped the cardinalities

- A server restart splits one op into several replay codes → Event 0..* Replays.
- The recorder starts at server boot, so test / empty sessions produce replays with no event → Replay 0..1 Event.
- The mod stamps `planCode` into replay meta on `/syncplan`, last-wins → Replay 0..1 Plan today.
- Planner pushes now carry `mapKey`, and `mission` when opened from the hub; authors come from the hub plan (the planner has no login) → Plan 0..1 author, 0..1 mission.
- Every plan save mints a new code. Pushes made from a hub plan carry its key, so the planner groups them (`plans.lineage`) and the hub shows the newest; pushes made outside the hub stay ungrouped.
- Ops also run on Thursdays and Saturdays, not just the usual Tue 20:00 / Sun 19:00 → calendar must show extra ops.
- The slotting bot supports one active session per guild; a calendar with several open events implies multi-session slotting.

## Open decisions

1. Mission authors: co-authors and external Workshop authors → M:N (drawn that way above).
2. Can one event night run two missions? (It happened: 22 Sep 2026, Troubled Waters + Marching Fire.) If yes, Event → Mission becomes 1..*. For now each mission is its own event, so that evening is two games.
3. Keep every `/syncplan` in a session, or last-wins? Every sync → Replay ↔ Plan becomes M:N.
4. Identity: Discord account ↔ Reforger `playerGuid` mapping; `player_join` is sometimes dropped. **Decided 2026-10-11:** an admin matches in-game names to members by hand on «Игроки» (`player_names`); account IDs (`event_attendance.account_id`, recorded since 2026-10-09) suggest the member for a renamed player.

## Fix and Flank («Мини-игры»)

Drafted in `db/schema.sql` (`fnf_*`); the pages run on mock data until it's built (user decisions 2026-10-15).

```mermaid
erDiagram
  PLAYER ||--o{ FNF_MAP : "makes"
  PLAYER ||--o{ FNF_RUN : "plays"
  PLAYER ||--o{ FNF_COMMENT : "writes"
  FNF_MAP ||--o{ FNF_RUN : "played in"
  FNF_MAP ||--o{ FNF_COMMENT : "has"
```

- A map is a draft (its author's only, editable) until published; then it's locked for good, so its runs and record stay comparable.
- A run is a seed plus the orders given. The game is deterministic, so the server replays them to get the result and turns (records can't be faked) and «Повтор» plays them back. A run keeps the game version it was played on.
- The leaderboard is each player's best win on a map, fewest turns first, top 10. Losses don't count toward the ranking. «Популярные» sorts by finished runs.
- «Активность» is derived: runs (won, lost, a new record) and published maps.
- Playing and publishing are for members of the Discord (`viewer.inGuild`).
