#!/usr/bin/env bash
# Quick start without systemd (development or manual run in LXC).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

if [[ ! -d .venv ]]; then
  echo "==> Erstelle venv..."
  python3 -m venv .venv
  .venv/bin/pip install --upgrade pip -q
  .venv/bin/pip install -e . -q
fi

# .env laden falls vorhanden
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

export SAQ_VENDOR_DIR="${SAQ_VENDOR_DIR:-${ROOT}/vendor}"
export SAQ_HOST="${SAQ_HOST:-0.0.0.0}"
export SAQ_PORT="${SAQ_PORT:-8080}"

# Java prüfen
if ! command -v java &>/dev/null; then
  echo "Warnung: Java nicht gefunden – nur Python-Fallback verfügbar." >&2
  echo "Debian/Ubuntu: apt install openjdk-21-jre-headless" >&2
fi

echo "==> Starte M-Coder auf http://${SAQ_HOST}:${SAQ_PORT}"
exec .venv/bin/saq-serve
