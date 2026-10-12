-- «Изменить слоты» reorders a game's slots inside a squad (user request 2026-10-12). `position` stays each slot's
-- identity (the take/leave forms on open pages name it), so the order shown is a column of its own. NULL = position
-- order (every game until its slots are reordered).
ALTER TABLE event_slots ADD COLUMN sort_order INT;
