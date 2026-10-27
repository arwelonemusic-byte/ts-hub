-- «Комментарии» on a mission's page (user request 2026-10-27): players' feedback on the mission itself (bugs, balance,
-- what to fix), not on one of its games. The hub's own, like a map's (fnf_comments): nothing goes to Discord. A comment
-- taken down keeps its row (deleted_at); all of them go with the mission when an admin deletes it.
CREATE TABLE mission_comments (
  id            BIGSERIAL PRIMARY KEY,
  mission_id    TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  player_id     BIGINT NOT NULL REFERENCES players(id),
  body          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX mission_comments_mission ON mission_comments (mission_id, created_at DESC);
