-- Usual Tue/Sun slots an admin called off («Отменить» on an open slot): no game that day, so the
-- feed and calendar don't offer the slot. A game scheduled for that time still shows.
CREATE TABLE skipped_slots (
  starts_at   TIMESTAMPTZ PRIMARY KEY,
  skipped_by  BIGINT REFERENCES players(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
