# TS Hub

Community portal for Tactical Shift that ties together the objects the other TS apps each own a piece of:

| Object | Lives today in |
|---|---|
| **Event** (an op night) | Discord slotting bot (`discord-slotting-bot`) — one active session at a time |
| **Mission** | Workbench addons + Workshop (`ts-mission-builder` generates them) |
| **Plan** | `ts-ops-planner` (`plans` table, 6-char codes) |
| **Replay** | `ts-ops-planner` (`replays` table, recorded by the TS Replay mod) |
| **Player** | Discord identity (`tactical-shift-training-portal` already does Discord OAuth + roles) |

Status: **concept / POC.** Nothing here is wired to real data yet; mock data is fine.

## Layout

- `web/` — the app (Next.js 16 / React 19 / Tailwind 4). `cd web && npm install && npm run dev` → http://localhost:3000.
  Runs with no env vars on mock data; see `web/.env.example` for Discord login. Pages: `/events` (one feed of
  played and upcoming ops with a synced calendar), `/events/[id]` (upcoming or played).
- `db/schema.sql` — draft PostgreSQL schema matching the data model (not applied anywhere).
- `docs/data-model.md` — entities, relationships, cardinality, open decisions.
- `design/events-page/` — Events page concept (Upcoming + Past). Source for the Claude Design canvas
  at https://claude.ai/artifact/71RyAtadBWGDVUGM5XBf9a. Artboards are `.dc.html` files; the
  `/_blob/<id>` image URLs in them are the uploaded copies of `assets/*` (mapping in that folder's README).

## Figma

https://www.figma.com/design/0RmVKOte1DraFYjN1vY0m9/TS-Hub — pages: **Events** (the 4 screens), **Components**
(icons, controls, blocks, cards), **Assets** (uploaded covers + map crops). Variables: `Primitives` → `Color`
(semantic, aliased) + `Dimension` (space / radius / size); 24 text styles; `Shadow/Floating` effect style.

## Visual language

Shared with the planner and mission builder: dark HUD surfaces (`#0d0f11` page, `#202427` panel,
`#14181a` inset, `#2e3439` raised/border), accent yellow `#f4db50`, brand red `#E13446` only in the logo,
Roboto Slab headings over Roboto body, mono for codes. Discord login like the Training Portal. Russian-only UI for now.
