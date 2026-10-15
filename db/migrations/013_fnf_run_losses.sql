-- How many of BLUFOR's men a finished run lost (user request 2026-10-15: «25 ходов / 4 потери» in a map's «Рейтинг»;
-- the ranking stays turns only). NULL for runs finished before, until the hub works them out again on start
-- (lib/fix-and-flank/runs.ts fillLosses; only runs played under the rules it has).
ALTER TABLE fnf_runs ADD COLUMN losses INT;
