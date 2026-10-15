-- Fix and Flank in the hub («Мини-игры», user decisions 2026-10-15): maps made in the game's editor, runs, comments.

-- A map (always 14 x 16). A draft is its author's only and can still change. Publishing locks it for good: an edit would
-- void its runs, record and comments, so `json` never changes once published_at is set. Anyone in the Discord can
-- publish a map the editor calls ready (no clear check). A map that came with the game has no author_id but a label.
CREATE TABLE fnf_maps (
  id            TEXT PRIMARY KEY,                  -- from the name (Latin letters) + a short random suffix
  author_id     BIGINT REFERENCES players(id),
  author_label  TEXT,                              -- the credit for a map that came with the game
  name          TEXT NOT NULL,
  json          JSONB NOT NULL,                    -- the game's map format (games/fix-and-flank/data/maps), as the server cleaned it
  thumb_url     TEXT,                              -- a 16:10 still (uploads/fnf), taken in the editor
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at  TIMESTAMPTZ,                       -- NULL = draft
  hidden_at     TIMESTAMPTZ,                       -- taken down by an admin (the rows stay)
  CHECK (author_id IS NOT NULL OR author_label IS NOT NULL)
);
CREATE INDEX fnf_maps_published ON fnf_maps (published_at DESC) WHERE published_at IS NOT NULL;
CREATE INDEX fnf_maps_author ON fnf_maps (author_id);

-- A run: a member playing a published map. The game is deterministic, so a run is its seed and BLUFOR's orders (OPFOR's
-- come from the AI): the hub hands out the seed when the run starts (lib/fix-and-flank/runs.ts), and when it ends plays
-- the orders through the game's rules on the server to get the result and the turns (a record can't be typed in). The
-- same data plays it back («Повтор»). A run given up stays unfinished (result NULL) and counts for nothing.
CREATE TABLE fnf_runs (
  id            BIGSERIAL PRIMARY KEY,
  map_id        TEXT NOT NULL REFERENCES fnf_maps(id),
  player_id     BIGINT NOT NULL REFERENCES players(id),
  seed          BIGINT NOT NULL,
  orders        JSONB NOT NULL DEFAULT '[]',       -- BLUFOR's commits: each one an array of actions, in order
  result        TEXT CHECK (result IN ('won', 'lost')), -- NULL while playing (or given up)
  turns         INT,                               -- the leaderboard ranks wins by this alone (fewest first)
  game_version  TEXT NOT NULL,                     -- a hash of the game's rules: a replay needs the rules it was played with
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at   TIMESTAMPTZ,
  CHECK ((result IS NULL) = (finished_at IS NULL) AND (result IS NULL) = (turns IS NULL))
);
CREATE INDEX fnf_runs_board ON fnf_runs (map_id, turns, finished_at) WHERE result = 'won';
CREATE INDEX fnf_runs_recent ON fnf_runs (finished_at DESC) WHERE finished_at IS NOT NULL;

-- The hub's own comments on a map (not a Discord thread, unlike a game's). Not written yet.
CREATE TABLE fnf_comments (
  id            BIGSERIAL PRIMARY KEY,
  map_id        TEXT NOT NULL REFERENCES fnf_maps(id),
  player_id     BIGINT NOT NULL REFERENCES players(id),
  body          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX fnf_comments_map ON fnf_comments (map_id, created_at DESC);

-- Mission 1, Trench Line, as the game has it (data/maps/trenchline.json without the balance test's drills).
INSERT INTO fnf_maps (id, author_label, name, json, thumb_url, created_at, updated_at, published_at)
VALUES ('trench-line', 'Galaxy, VonScheer', 'Trench Line', $fnf${"name":"Trench Line","description":"A dug-in OPFOR fireteam holds a short trench line at the edge of the woods, parapets facing south over an open field. A stone wall crosses the field 350 m out. On the east side a sunken farm track runs north behind a hedgerow; the west is open ground and a pond.","mission":{"attacker":"BLUFOR","defender":"OPFOR","brief":"Take and hold the trench at 6,3. One OPFOR fireteam is dug in there, parapets facing south. Fix it from the wall, flank it up the sunken track on the east, assault from the side."},"width":14,"height":16,"legend":{".":"open","=":"road",":":"scrub","T":"woods","%":"rubble","B":"building","n":"trench","~":"water"},"rows":["TTTT=TTTTTTTTT","TTTT=TTTTTTTTT","TTT.=......TTT","T...=.nn:....T","....=....:=.~.","~~:.=.....=.~.","~~~.=.....=:~.","~~:.=.....=:~.","....=.....=.~.","....=.....=.~.",".:..=.....=:~.","TT..=.....=:~.","TT:.=.....=.~.","T...=.BB..=.~.","....=.B.%.=.~.","....=.....=.~."],"objective":[6,3],"hexsides":[{"hex":[6,3],"sides":["SW","SE"],"feature":"parapet"},{"hex":[7,3],"sides":["SW","SE"],"feature":"parapet"},{"hex":[2,10],"sides":["NW","NE"],"feature":"wall"},{"hex":[3,10],"sides":["NW","NE"],"feature":"wall"},{"hex":[4,10],"sides":["NW","NE"],"feature":"wall"},{"hex":[5,10],"sides":["NW","NE"],"feature":"wall"},{"hex":[6,10],"sides":["NW","NE"],"feature":"wall"},{"hex":[7,10],"sides":["NW","NE"],"feature":"wall"},{"hex":[8,10],"sides":["NW","NE"],"feature":"wall"},{"hex":[9,4],"sides":["W","NW"],"feature":"hedge"},{"hex":[9,5],"sides":["W","SW"],"feature":"hedge"},{"hex":[9,6],"sides":["W","NW"],"feature":"hedge"},{"hex":[9,7],"sides":["W","SW"],"feature":"hedge"},{"hex":[9,8],"sides":["W","NW"],"feature":"hedge"},{"hex":[9,9],"sides":["W","SW"],"feature":"hedge"},{"hex":[9,10],"sides":["W","NW"],"feature":"hedge"},{"hex":[9,11],"sides":["W","SW"],"feature":"hedge"},{"hex":[9,12],"sides":["W","NW"],"feature":"hedge"},{"hex":[9,13],"sides":["W","SW"],"feature":"hedge"},{"hex":[9,14],"sides":["W","NW"],"feature":"hedge"},{"hex":[6,13],"sides":["NW","NE"],"feature":"wall"}],"units":[{"side":"BLUFOR","team":"ALPHA","pos":[8,13]},{"side":"BLUFOR","team":"BRAVO","pos":[9,13]},{"side":"OPFOR","team":"ALPHA","pos":[6,3]},{"side":"BLUFOR","team":"SL","kind":"leader","pos":[9,14]}]}$fnf$::jsonb, '/fix-and-flank/maps/trench-line.jpg',
  '2026-10-15T12:00:00+03:00', '2026-10-15T12:00:00+03:00', '2026-10-15T12:00:00+03:00');
