# Database

PostgreSQL. `migrations/` is what's built; `schema.sql` is the draft of the tables still on paper (events,
slots, attendance…) and goes away table by table as they get migrations.

- **Production:** the box's PostgreSQL, `DATABASE_URL` in `/etc/ts-hub.env`. `deploy-hub.sh` runs the migrations on
  every deploy; the first seed is a manual step (`deploy/README.md`).
- **Dev:** with no `DATABASE_URL`, the app uses [PGlite](https://pglite.dev) (Postgres compiled to WASM) in
  `web/.data/pglite`, gitignored. Nothing to install. The dev server migrates it on first use and seeds it when it has
  no missions. PGlite allows one process at a time, so stop the dev server before running the scripts below on it.
  Delete `web/.data/pglite` to start over.

Code: `web/scripts/db-core.mjs` (connection, migrations, seed — plain JS so the scripts and the app share it),
`web/src/lib/db` (the app's connection), `web/src/lib/data/missions.ts` and `web/src/lib/plans/store.ts` (queries).

## Scripts (from `web/`)

```sh
npm run db:migrate                       # apply pending migrations/*.sql, recorded in schema_migrations
npm run db:seed                          # migrate, then load the catalogue and (if present) the member list
npm run db:seed -- --update              # also overwrite missions already in the database
npm run db:seed -- --players <file>      # member list from elsewhere (default data/players/discord-members.json)
```

## Seed data

- `seed/missions.json` — the mission catalogue, built from `data/catalogue/` by `py data/catalogue/build_seed.py`
  (author names resolved through the member list). Markers.layer files are read from `data/catalogue/files/`.
- Players come from `data/players/discord-members.json`, which holds member data and so stays out of git; the seed
  skips players when it's missing.

New migrations: add `NNN_name.sql` with the next number. They run once, in a transaction, in name order.
