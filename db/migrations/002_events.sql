-- Games: scheduled and played ops, their slots, who showed up and their replays.
-- Seeded from db/seed/played-events.json (built from the replay-stats reports by
-- data/events/build_past_events.py) and db/seed/scheduled-events.json.

CREATE TABLE events (
  id                TEXT PRIMARY KEY,         -- "<date>-<mission>", e.g. 2026-10-04-counterpunch: URLs and plans.event_id
  mission_id        TEXT NOT NULL REFERENCES missions(id),
  starts_at         TIMESTAMPTZ NOT NULL,     -- scheduled (MSK in the UI)
  extra             BOOLEAN NOT NULL DEFAULT FALSE,  -- outside the usual Tue 20:00 / Sun 19:00
  status            TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'played', 'cancelled')),
  host_id           BIGINT REFERENCES players(id) ON DELETE SET NULL,
  platoon_leader_id BIGINT REFERENCES players(id) ON DELETE SET NULL,
  started_at        TIMESTAMPTZ,              -- played: first player in the replays…
  ended_at          TIMESTAMPTZ,              -- …to the last player activity
  plan_code         TEXT,                     -- played: the planner plan it used (ops_planner.plans.code)
  stats             JSONB,                    -- played: { totals, leaderboards, awards, friendlyFire } from replay-stats
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX events_starts_at ON events (starts_at);
CREATE INDEX events_mission ON events (mission_id);

-- The game's copy of its mission's slot template (mission_slots), and who took each slot.
CREATE TABLE event_slots (
  event_id          TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  position          INT NOT NULL,
  group_id          TEXT NOT NULL,            -- "1'1"
  group_name        TEXT NOT NULL,
  role              TEXT NOT NULL,            -- "BLUE - Grenadier"
  required_role     TEXT,                     -- Discord role needed to take it
  player_id         BIGINT REFERENCES players(id) ON DELETE SET NULL,
  player_name       TEXT,                     -- taken by someone with no player row (copied from the bot's post)
  taken_at          TIMESTAMPTZ,
  PRIMARY KEY (event_id, position)
);
CREATE UNIQUE INDEX event_slots_one_per_player ON event_slots (event_id, player_id) WHERE player_id IS NOT NULL;

-- Who played, by in-game name from the replays. player_id links the name to a member once
-- in-game names are matched to players (docs/data-model.md, open decision #4).
CREATE TABLE event_attendance (
  event_id          TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  player_name       TEXT NOT NULL,
  player_id         BIGINT REFERENCES players(id) ON DELETE SET NULL,
  attended          BOOLEAN NOT NULL DEFAULT TRUE,   -- false = slotted but didn't show
  PRIMARY KEY (event_id, player_name)
);

-- Replays recorded during a game: several when a server restart split the op.
CREATE TABLE event_replays (
  replay_code       TEXT PRIMARY KEY,         -- ops_planner.replays.code
  event_id          TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  part              INT NOT NULL DEFAULT 1,
  UNIQUE (event_id, part)
);
