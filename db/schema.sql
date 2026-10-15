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

-- ---- Fix and Flank («Мини-игры», user decisions 2026-10-15) ----
-- The hub pages read lib/data/fixAndFlank.ts, MOCK data until these are built.

-- Maps made in the game's editor (always 14 x 16). A draft is its author's only and can still change.
-- Publishing locks it for good: an edit would void its runs, record and comments, so `json` never
-- changes once published_at is set. Anyone can publish a map the editor calls ready (no clear check).
CREATE TABLE fnf_maps (
  id            TEXT PRIMARY KEY,                  -- slug of the name + a short suffix
  author_id     BIGINT NOT NULL REFERENCES players(id),
  name          TEXT NOT NULL,
  json          JSONB NOT NULL,                    -- the game's map format (games/fix-and-flank/data/maps)
  thumb_url     TEXT,                              -- a 16:10 still (uploads), taken in the editor on publish
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at  TIMESTAMPTZ,                       -- NULL = draft
  hidden_at     TIMESTAMPTZ                        -- taken down by an admin (the rows stay)
);
CREATE INDEX fnf_maps_published ON fnf_maps (published_at DESC) WHERE published_at IS NOT NULL;
CREATE INDEX fnf_maps_author ON fnf_maps (author_id);

-- A run: a member playing a published map to its end (members only; a run given up is not kept).
-- The game is deterministic, so a run is its seed and the orders given: the hub plays them through the
-- game's own rules on the server (games/fix-and-flank/src/sim) to get the result and the turns, so a
-- record can't be typed in, and the same data plays it back («Повтор»).
CREATE TABLE fnf_runs (
  id            BIGSERIAL PRIMARY KEY,
  map_id        TEXT NOT NULL REFERENCES fnf_maps(id),
  player_id     BIGINT NOT NULL REFERENCES players(id),
  seed          BIGINT NOT NULL,
  orders        JSONB NOT NULL,                    -- every committed phase's actions, in order
  result        TEXT NOT NULL CHECK (result IN ('won', 'lost')),
  turns         INT NOT NULL,                      -- the leaderboard ranks wins by this alone (fewest first)
  game_version  TEXT NOT NULL,                     -- the game's commit: a replay needs the rules it was played with
  started_at    TIMESTAMPTZ NOT NULL,
  finished_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX fnf_runs_board ON fnf_runs (map_id, turns, finished_at) WHERE result = 'won';
CREATE INDEX fnf_runs_recent ON fnf_runs (finished_at DESC);

-- The hub's own comments on a map (not a Discord thread, unlike a game's).
CREATE TABLE fnf_comments (
  id            BIGSERIAL PRIMARY KEY,
  map_id        TEXT NOT NULL REFERENCES fnf_maps(id),
  player_id     BIGINT NOT NULL REFERENCES players(id),
  body          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX fnf_comments_map ON fnf_comments (map_id, created_at DESC);
-- «Активность» needs no table of its own: runs (won, lost, a new record) and maps (published).
