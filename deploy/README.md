# Deploying TS Hub

Production is `https://hub.tacticalshift.ru` on the Selectel box (`91.206.15.125`, `ssh slotbot-msk`),
laid out like the other TS web apps: code in `/opt/ts-web/ts-hub` (user `tsweb`), unit `ts-hub` on
`127.0.0.1:3004` behind Caddy, env in `/etc/ts-hub.env`, database `ts_hub` in the box's PostgreSQL 14
(covered by the nightly `pg_dumpall`).

Routine deploy, after pushing `master`:

```sh
ssh slotbot-msk /opt/ts-web/deploy-hub.sh
```

**Status (2026-10-09):** live at https://hub.tacticalshift.ru: every step below is done (DNS resolved at 21:08 MSK,
Caddy got the certificate, the Discord redirect is in place).

**The box runs npm 10.8.2.** A lockfile written by a newer npm can be missing entries npm 10 insists on (it once lacked
`@emnapi/*`, optional WASM fallbacks), and `npm ci` then refuses to run. Regenerate it with the box's npm:
`npx npm@10.8.2 install --package-lock-only` in `web/`, and commit.

## One-time setup

0. **Prerequisites.**
   - DNS: an A record `hub` → `91.206.15.125` (the domain owner adds it; check `nslookup hub.tacticalshift.ru 8.8.8.8`).
   - The public GitHub repo, with the Discord exports kept out by the root `.gitignore`.
   - The planner deployed with the TS Hub hand-off (`?mission=` links, plan keys) and its `plans.lineage` column added
     (`ALTER TABLE plans ADD COLUMN IF NOT EXISTS lineage TEXT; CREATE INDEX IF NOT EXISTS plans_lineage_idx ON plans
     (lineage, created_at DESC);` in `ops_planner`; see the planner's CLAUDE.md).
   - The Discord app (shared with the Training Portal) lists `https://hub.tacticalshift.ru/api/auth/callback` as a redirect.
1. **Database.**
   ```sh
   sudo -u postgres psql -c "CREATE ROLE tsweb_hub LOGIN PASSWORD '<password>'"
   sudo -u postgres psql -c "CREATE DATABASE ts_hub OWNER tsweb_hub"
   ```
2. **Env file.** Fill `ts-hub.env.example` into `/etc/ts-hub.env`, then `chmod 600` it (root:root). The uploads
   folder (mission covers) lives outside the code: `mkdir -p /var/lib/ts-hub/uploads && chown -R tsweb: /var/lib/ts-hub`
   (the unit's `ReadWritePaths` lists it).
3. **Code.**
   ```sh
   sudo -u tsweb git clone https://github.com/<owner>/ts-hub.git /opt/ts-web/ts-hub
   cp deploy/deploy-hub.sh /opt/ts-web/deploy-hub.sh && chmod +x /opt/ts-web/deploy-hub.sh
   ```
4. **First data.** The member list isn't in git, so copy it over once (it stays on the box, gitignored):
   ```sh
   scp data/players/discord-members.json slotbot-msk:/opt/ts-web/ts-hub/data/players/
   ssh slotbot-msk 'chown tsweb: /opt/ts-web/ts-hub/data/players/discord-members.json'
   ```
   then, on the box, migrate and seed (catalogue + players):
   ```sh
   cd /opt/ts-web/ts-hub/web && sudo -u tsweb npm ci
   sudo -u tsweb env "$(grep ^DATABASE_URL= /etc/ts-hub.env)" npm run db:seed
   ```
5. **Service and proxy.**
   ```sh
   cp deploy/ts-hub.service /etc/systemd/system/ && systemctl daemon-reload && systemctl enable ts-hub
   cat deploy/Caddyfile.hub >> /etc/caddy/Caddyfile && caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy
   # `caddy validate` run as root creates a new site's log file owned by root, and the reload then fails
   # (Caddy runs as `caddy`): chown caddy:caddy /var/log/caddy/hub-access.log and reload again.
   /opt/ts-web/deploy-hub.sh
   ```

Re-running `npm run db:seed` later adds missions that aren't in the database yet and refreshes players; it leaves
existing missions alone unless given `-- --update`, and even then skips missions saved in the hub: the hub is
their source of truth.
