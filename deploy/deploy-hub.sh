#!/bin/sh
# /opt/ts-web/deploy-hub.sh — deploy TS Hub: pull, install, migrate, build, restart.
# NEXT_PUBLIC_* values are inlined into the client bundle at build time, so the build
# must see them; DATABASE_URL is needed for the migrations. Both come from the root-only
# env file, which is why this runs as root and hands them to the tsweb user explicitly.
set -e
ENV_FILE=/etc/ts-hub.env
NP_VARS=$(grep "^NEXT_PUBLIC_" "$ENV_FILE" | tr "\n" " ")
DB_VAR=$(grep "^DATABASE_URL=" "$ENV_FILE")
cd /opt/ts-web/ts-hub/web
sudo -u tsweb git pull --ff-only
sudo -u tsweb npm ci
sudo -u tsweb env "$DB_VAR" npm run db:migrate
sudo -u tsweb env $NP_VARS NODE_ENV=production npm run build
systemctl restart ts-hub || true
