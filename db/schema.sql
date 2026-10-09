-- TS Hub — DRAFT of the tables not built yet (PostgreSQL 14, box-local like the other TS apps).
-- Built tables are in migrations/ (001_core: players, missions, plans; 002_events: games); a table
-- moves there when it's built. Mirrors docs/data-model.md. Planner plans and replays stay in the
-- planner's `ops_planner` database and are referenced here by their 6-char code only (no cross-DB FKs).
-- Lines marked OPEN depend on the open decisions in docs/data-model.md.

-- In-game identities seen in replays, to link event_attendance names to players.
-- OPEN #4: one player ↔ many GUIDs (alts, reinstalls).
CREATE TABLE player_game_ids (
  player_guid   TEXT PRIMARY KEY,            -- replay `player_join.playerGuid`
  player_id     BIGINT REFERENCES players(id) ON DELETE SET NULL,
  last_name     TEXT NOT NULL                -- last in-game name seen
);
