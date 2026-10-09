-- TS Hub — DRAFT of the tables not built yet (PostgreSQL 14, box-local like the other TS apps).
-- Built tables (players, missions, mission_authors, mission_slots, plans) are in migrations/;
-- a table moves there when it's built. Games still run on mock data (web/src/lib/data/mock.ts).
-- Mirrors docs/data-model.md. Planner plans and replays stay in the planner's `ops_planner`
-- database and are referenced here by their 6-char code only (no cross-DB FKs).
-- Lines marked OPEN depend on the open decisions in docs/data-model.md.

-- In-game identities seen in replays. OPEN #4: one player ↔ many GUIDs (alts, reinstalls).
CREATE TABLE player_game_ids (
  player_guid   TEXT PRIMARY KEY,            -- replay `player_join.playerGuid`
  player_id     BIGINT REFERENCES players(id) ON DELETE SET NULL,
  last_name     TEXT NOT NULL                -- last in-game name seen
);

CREATE TABLE events (
  id            BIGSERIAL PRIMARY KEY,
  starts_at     TIMESTAMPTZ NOT NULL,        -- scheduled (MSK in the UI)
  mission_id    TEXT NOT NULL REFERENCES missions(id),  -- OPEN #2: two missions in one night → event_missions
  extra         BOOLEAN NOT NULL DEFAULT FALSE,          -- outside Tue 20:00 / Sun 19:00
  host_id       BIGINT REFERENCES players(id),
  platoon_leader_id BIGINT REFERENCES players(id),
  status        TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'played', 'cancelled')),
  started_at    TIMESTAMPTZ,                 -- actual, from the replay
  ended_at      TIMESTAMPTZ,
  stats         JSONB,                       -- totals, awards, leaderboards — computed from replays
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX events_starts_at ON events (starts_at);

-- Slotting, same shape as the Discord bot (sessions → slots → reservations).
CREATE TABLE event_slots (
  id            BIGSERIAL PRIMARY KEY,
  event_id      BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  group_id      TEXT NOT NULL,               -- "1'1"
  group_name    TEXT NOT NULL,
  role          TEXT NOT NULL,
  required_role TEXT,                        -- Discord role restriction ([@SL])
  slot_order    INT NOT NULL,
  player_id     BIGINT REFERENCES players(id) ON DELETE SET NULL,
  reserved_at   TIMESTAMPTZ,
  UNIQUE (event_id, group_id, role, slot_order)
);
CREATE UNIQUE INDEX event_slots_one_per_player ON event_slots (event_id, player_id) WHERE player_id IS NOT NULL;

-- Who actually showed up (from replay possess/join events), incl. people who never slotted.
CREATE TABLE event_attendance (
  event_id      BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  player_id     BIGINT NOT NULL REFERENCES players(id),
  attended      BOOLEAN NOT NULL,
  PRIMARY KEY (event_id, player_id)
);

-- Replays recorded during an event (several when a server restart split the op).
CREATE TABLE event_replays (
  event_id      BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  replay_code   TEXT NOT NULL UNIQUE,        -- ops_planner.replays.code; a replay belongs to ≤ 1 event
  part          INT NOT NULL DEFAULT 1,
  PRIMARY KEY (event_id, replay_code)
);
