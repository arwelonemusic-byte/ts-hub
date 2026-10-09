-- «Удалить план» (admin) on a mission page only hides a drawn plan (junk, vandalism): the row stays,
-- the mission page stops listing it (user decision 2026-10-09).
ALTER TABLE plans ADD COLUMN hidden_at TIMESTAMPTZ;
ALTER TABLE plans ADD COLUMN hidden_by BIGINT REFERENCES players(id) ON DELETE SET NULL;
