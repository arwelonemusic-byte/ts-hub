-- Missions are edited in the hub now (lib/missions): admins add, edit, archive and delete any;
-- @mission officer members add missions and edit the ones they're an author of.

-- Archived: hidden from the catalogue and the schedule dialog; its games still show it.
ALTER TABLE missions ADD COLUMN archived_at TIMESTAMPTZ;
ALTER TABLE missions ADD COLUMN created_by BIGINT REFERENCES players(id) ON DELETE SET NULL;
ALTER TABLE missions ADD COLUMN updated_by BIGINT REFERENCES players(id) ON DELETE SET NULL;
-- Set by every save from the hub. `db:seed --update` leaves such missions alone, so a re-seed
-- doesn't undo edits made in the hub.
ALTER TABLE missions ADD COLUMN hub_edited_at TIMESTAMPTZ;
CREATE UNIQUE INDEX missions_scenario ON missions (scenario_id) WHERE scenario_id IS NOT NULL;
