-- Players, the mission catalogue and hub plans. Applied by web/scripts/db-core.mjs
-- (`npm run db:migrate`; the dev server applies it to its PGlite database by itself).
-- Tables still on paper (events, slots, attendance, …) are in ../schema.sql.

-- Discord members (seeded from data/players, which stays out of git; later synced by the bot).
CREATE TABLE players (
  id             BIGSERIAL PRIMARY KEY,
  discord_id     TEXT UNIQUE,                 -- login identity
  steam_id       TEXT UNIQUE,                 -- second login provider (planned)
  display_name   TEXT NOT NULL,               -- server nickname, else global name, else username
  username       TEXT,
  avatar_url     TEXT,
  member_since   TIMESTAMPTZ,                 -- joined the TS Discord
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE missions (
  id             TEXT PRIMARY KEY,            -- slug
  name           TEXT NOT NULL,               -- Workshop title without "Operation"
  map_key        TEXT NOT NULL,               -- planner maps.ts key
  map_label      TEXT NOT NULL,
  cover_url      TEXT,                        -- the addon's main Workshop cover
  workshop_url   TEXT,
  addon_guid     TEXT,
  scenario_id    TEXT,
  briefing       JSONB,                       -- { sides?: {for?, against?}, sections: [{title, body}] }
  tags           TEXT[] NOT NULL DEFAULT '{}',
  markers_layer  TEXT,                        -- the Markers.layer file; NULL = none (yet)
  planning       BOOLEAN NOT NULL DEFAULT TRUE,   -- false = a simple op that needs no plan
  no_slotting    BOOLEAN NOT NULL DEFAULT FALSE,  -- played without slotting (RSVP only)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- An author is a Discord user; the name is kept for authors who aren't (or are no longer) members.
CREATE TABLE mission_authors (
  mission_id     TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  position       INT NOT NULL,
  discord_id     TEXT,
  name           TEXT NOT NULL,
  PRIMARY KEY (mission_id, position)
);

-- Slot template, HQ first; each game copies it. No rows and not no_slotting = not set up yet.
CREATE TABLE mission_slots (
  mission_id     TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  position       INT NOT NULL,
  group_id       TEXT NOT NULL,               -- "1'1"
  group_name     TEXT NOT NULL,
  role           TEXT NOT NULL,               -- fireteam prefix is part of the name: "BLUE - Grenadier"
  required_role  TEXT,                        -- Discord role name ([@SL] in the bot's slot file)
  PRIMARY KEY (mission_id, position)
);

-- Hub plans (web/src/lib/plans). Planner pushes made with plan_key are its versions:
-- ops_planner.plans.lineage = sha256(plan_key); the hub shows the newest.
CREATE TABLE plans (
  id                TEXT PRIMARY KEY,         -- public id, used in links
  mission_id        TEXT NOT NULL REFERENCES missions(id),
  event_id          TEXT,                     -- the game it's the plan for (events aren't in the DB yet); NULL = a mission plan
  event_starts_at   TIMESTAMPTZ,              -- versions pushed after it don't count
  author_discord_id TEXT NOT NULL,
  author_name       TEXT NOT NULL,
  plan_key          TEXT NOT NULL UNIQUE,     -- secret; only the planner tab drawing it sees it
  seed_code         TEXT,                     -- «Использовать»: the version it started from…
  seed_author       TEXT,
  seed_created_at   TIMESTAMPTZ,              -- …shown until the first push
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX plans_one_per_event ON plans (event_id) WHERE event_id IS NOT NULL;
CREATE INDEX plans_mission ON plans (mission_id);
