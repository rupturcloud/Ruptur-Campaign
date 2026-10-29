#!/bin/sh
set -eu
export DATABASE_URL="postgresql://campaign:$(cat /run/secrets/pg_password)@postgres:5432/campaign?schema=public"
export JWT_SECRET="$(cat /run/secrets/jwt_secret)"
export RUPTUR_SSO_SECRET="$(cat /run/secrets/ruptur_chatwoot_bridge_token)"
for attempt in $(seq 1 30); do
  pg_isready -h postgres -U campaign -d campaign && break
  sleep 2
done
./node_modules/.bin/prisma db push --accept-data-loss --skip-generate
node dist/scripts/seed.js
exec node dist/server.js
