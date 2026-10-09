-- «Игра окончена» (lib/events/finish.ts): an admin picks the game's replays and the hub computes its
-- stats itself (lib/replays/stats.ts). Set on every finish or recompute; `db:seed --update` leaves such
-- games alone, so the back-fill (data/events) doesn't overwrite them.
ALTER TABLE events ADD COLUMN finished_at TIMESTAMPTZ;
ALTER TABLE events ADD COLUMN finished_by BIGINT REFERENCES players(id) ON DELETE SET NULL;
