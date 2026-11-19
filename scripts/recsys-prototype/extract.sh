#!/usr/bin/env bash
# Pull a read-only snapshot for the recommender prototype into output/recsys/data.
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a; source .env.local >/dev/null 2>&1; set +a
mkdir -p output/recsys/data
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/recsys-prototype/extract.sql
ls -lh output/recsys/data
