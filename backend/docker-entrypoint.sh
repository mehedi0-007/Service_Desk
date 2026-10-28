#!/bin/sh
set -e
# Apply pending migrations before the API starts; safe to run on every start.
npx prisma migrate deploy
exec node dist/main
