-- A scheduled game's plan is a planner code someone pasted on its page («Прикрепить план»):
-- events.plan_code, plus who attached it and when. Only they can swap in a newer code, and an
-- admin can detach it. Once the game is played, plan_code is the plan it used.
ALTER TABLE events ADD COLUMN plan_attached_by BIGINT REFERENCES players(id) ON DELETE SET NULL;
ALTER TABLE events ADD COLUMN plan_attached_at TIMESTAMPTZ;
