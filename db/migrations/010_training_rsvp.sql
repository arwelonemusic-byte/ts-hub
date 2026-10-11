-- Trainings and «Я приду!» (user decisions 2026-10-11).

-- A training mission (Wednesday drills on the training addon): its games say «Тренировка», take sign-ups with
-- «Я приду!» instead of slots, need no plan, stay out of the Миссии catalog, and «Игра окончена» keeps only who came.
ALTER TABLE missions ADD COLUMN training BOOLEAN NOT NULL DEFAULT FALSE;

-- «Я приду!»: members coming to a game without slots (a training, or any mission with no slot template).
CREATE TABLE event_rsvps (
  event_id          TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  player_id         BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, player_id)
);
