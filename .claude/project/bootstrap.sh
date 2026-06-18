#!/usr/bin/env bash
set -euo pipefail

# IAW VDF — dev environment bootstrap (Node/TypeScript stack)
# Regenerated 2026-06-18 when the backend was migrated from .NET to Node.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

echo "==> Starting PostgreSQL via Docker Compose"
if command -v docker >/dev/null 2>&1; then
  docker compose up -d db
  # The Node stack uses a dedicated database 'iawnode'
  docker exec iaw-postgres psql -U iaw -d iaw -tAc "SELECT 1 FROM pg_database WHERE datname='iawnode'" | grep -q 1 \
    || docker exec iaw-postgres createdb -U iaw iawnode
else
  echo "WARNING: docker not found — start PostgreSQL manually (db=iaw+iawnode, user=iaw, pass=iaw, port=5433)"
fi

echo "==> Backend (NestJS) — src/server"
if command -v npm >/dev/null 2>&1; then
  ( cd src/server && npm install )
  [ -f src/server/.env ] || { echo "  create src/server/.env from .env.example (DATABASE_URL, JWT_SECRET, OPENAI_*)"; cp src/server/.env.example src/server/.env 2>/dev/null || true; }
  ( cd src/server && npx prisma generate && npx prisma migrate deploy )
else
  echo "WARNING: npm not found — install Node 20+"
fi

echo "==> Frontend (React + Vite) — src/frontend"
( cd src/frontend && npm install )
[ -f src/frontend/.env ] || echo "VITE_API_BASE_URL=http://localhost:4000" > src/frontend/.env

echo "==> Security baseline"
( cd src/server && npm audit --audit-level=high ) || true
( cd src/frontend && npm audit --audit-level=high ) || true

echo "Bootstrap complete."
echo "Run backend:  cd src/server && npm run start:dev   (http://localhost:4000, swagger /swagger)"
echo "Run frontend: cd src/frontend && npm run dev        (http://localhost:5173)"
