-- Who's who in game (web/src/lib/roster/, the admin page «Игроки», user decision 2026-10-11): an admin matches
-- in-game names to members by hand.

-- The player's Bohemia account ID in that game, from the recording (TS Replay sends it since 2026-10-09; empty
-- before). It lets a renamed player's new name be matched to the member their old name belongs to.
ALTER TABLE event_attendance ADD COLUMN account_id TEXT;
CREATE INDEX event_attendance_account ON event_attendance (account_id) WHERE account_id IS NOT NULL;

-- An in-game name matched to a member. A member can have several names (renames, clan tags); a name one member.
CREATE TABLE player_names (
  name              TEXT PRIMARY KEY,
  player_id         BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  linked_by         BIGINT REFERENCES players(id) ON DELETE SET NULL,
  linked_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX player_names_player ON player_names (player_id);
