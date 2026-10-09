# Player seed (2026-10-09)

`discord-members.json`: the 226 members of the TS Discord with the Reforger role, plus Buzzil (see below). It was read from Server → Members, filtered to that role, by taking each row's user ID from Discord's own page data. No third-party export tool was involved.

Each entry has:
- `discordId`
- `displayName`: the server nickname, as shown in the list
- `username`
- `avatarUrl`: null when the member uses Discord's default avatar
- `memberSince`: when they joined the server
- `joinedDiscord`

Dates are in MSK, the browser's local time.

Not included:
- **Roles:** the list only shows a member's top role, so it doesn't reveal SL, FTL and so on. The hub checks roles live through Discord when a player takes a slot.
- **In-game names and GUIDs:** these come from replays (`player_join`) and get linked to these players later.

Buzzil (317330896778952709, author of HillSweepers) doesn't have the Reforger role, so he was added by hand and his entry has a `note` saying so. All mission authors are now in the list.

**Not in git.** The repo is public, and this file holds members' Discord IDs, names and avatars, so `.gitignore`
keeps it out (user decision, 2026-10-09). It exists only on the machines that build the seed
(`data/catalogue/build_seed.py` needs it) and goes to the server by hand when the players table is seeded.
