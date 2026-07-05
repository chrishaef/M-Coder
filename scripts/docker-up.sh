#!/usr/bin/env bash
# Docker deployment (Proxmox LXC with nesting enabled).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

if ! command -v docker &>/dev/null; then
  echo "Docker nicht gefunden. Installiere mit:" >&2
  echo "  curl -fsSL https://get.docker.com | sh" >&2
  exit 1
fi

if ! docker compose version &>/dev/null; then
  echo "Docker Compose Plugin nicht gefunden." >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  cp deploy/env.example .env
  echo "==> .env aus deploy/env.example erstellt – bitte prüfen."
fi

echo "==> Baue und starte Container..."
docker compose up -d --build

echo "==> Warte auf Healthcheck..."
for i in $(seq 1 60); do
  if curl -sf http://127.0.0.1:8080/health >/dev/null 2>&1; then
    echo ""
    echo "✓ M-Coder läuft auf http://0.0.0.0:8080"
    docker compose ps
    exit 0
  fi
  sleep 2
done

echo "Fehler: Container antwortet nicht." >&2
docker compose logs --tail=30
exit 1
