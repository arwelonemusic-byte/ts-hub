-- A game's announcement in Discord (web/src/lib/discord): an admin posts it with «Анонс в Дискорд», then the
-- hub edits it whenever the game changes (slots, time, plan, cancelled, played). discord_hash is the last
-- content sent, so an edit that changes nothing is skipped. A deleted post clears both ids.
ALTER TABLE events
  ADD COLUMN discord_channel_id TEXT,
  ADD COLUMN discord_message_id TEXT,
  ADD COLUMN discord_hash TEXT;
