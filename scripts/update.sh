#!/usr/bin/env bash
# Stoppt den Dienst, holt die neueste Version von GitHub und startet neu.
# Erkennt automatisch systemd (native) oder Docker – oder per --mode erzwingen.
#
# Native (systemd):
#   sudo ./scripts/update.sh
#
# Docker:
#   sudo ./scripts/update.sh --docker
#   ./scripts/update.sh --docker          # wenn User in der docker-Gruppe ist
#
# Nur Repository aktualisieren (ohne Dienst):
#   ./scripts/update.sh --mode repo
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

SERVICE_NAME="${SERVICE_NAME:-m-coder}"
BRANCH="${BRANCH:-main}"
REMOTE="${REMOTE:-origin}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:${SAQ_PORT:-8080}/health}"
MODE="${MODE:-auto}"

usage() {
  cat <<EOF
Verwendung: $0 [OPTIONEN]

Aktualisiert M-Coder: stoppen → git pull → Abhängigkeiten → neu starten.

Optionen:
  --mode MODE    auto | systemd | docker | repo   (Standard: auto)
  --systemd      Kurzform für --mode systemd
  --docker       Kurzform für --mode docker
  --branch NAME  Git-Branch (Standard: ${BRANCH})
  --help         Diese Hilfe

Umgebungsvariablen:
  BRANCH, REMOTE, SERVICE_NAME, HEALTH_URL, SAQ_PORT

Beispiele:
  sudo $0
  sudo $0 --docker
  sudo $0 --branch main
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      MODE="$2"
      shift 2
      ;;
    --systemd)
      MODE="systemd"
      shift
      ;;
    --docker)
      MODE="docker"
      shift
      ;;
    --branch)
      BRANCH="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unbekannte Option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "Bitte als root ausführen: sudo $0 $*" >&2
    exit 1
  fi
}

detect_mode() {
  if [[ "${MODE}" != "auto" ]]; then
    echo "${MODE}"
    return
  fi

  if [[ -f "${ROOT}/docker-compose.yml" ]] && command -v docker &>/dev/null \
      && docker compose -f "${ROOT}/docker-compose.yml" ps -q m-coder 2>/dev/null | grep -q .; then
    echo "docker"
    return
  fi

  if systemctl list-unit-files "${SERVICE_NAME}.service" &>/dev/null \
      && systemctl cat "${SERVICE_NAME}" &>/dev/null 2>&1; then
    echo "systemd"
    return
  fi

  if [[ -f "${ROOT}/docker-compose.yml" ]] && command -v docker &>/dev/null \
      && docker compose version &>/dev/null; then
    echo "docker"
    return
  fi

  echo "repo"
}

wait_for_health() {
  local attempts="${1:-30}"
  local delay="${2:-1}"

  echo "==> Warte auf ${HEALTH_URL} ..."
  for _ in $(seq 1 "${attempts}"); do
    if curl -sf "${HEALTH_URL}" >/dev/null 2>&1; then
      echo ""
      echo "✓ M-Coder antwortet wieder."
      curl -s "${HEALTH_URL}" | sed 's/^/  /'
      echo ""
      return 0
    fi
    sleep "${delay}"
  done

  echo "Fehler: Dienst antwortet nicht auf ${HEALTH_URL}" >&2
  return 1
}

stop_service() {
  case "${MODE}" in
    systemd)
      echo "==> Stoppe systemd-Dienst ${SERVICE_NAME} ..."
      systemctl stop "${SERVICE_NAME}" || true
      ;;
    docker)
      echo "==> Stoppe Docker-Container ..."
      docker compose down
      ;;
    repo)
      echo "==> Kein Dienst aktiv (Modus repo)."
      ;;
  esac
}

pull_latest() {
  if [[ ! -d "${ROOT}/.git" ]]; then
    echo "Fehler: ${ROOT} ist kein Git-Repository." >&2
    exit 1
  fi

  echo "==> Hole neueste Version (${REMOTE}/${BRANCH}) ..."
  git fetch "${REMOTE}"
  git checkout "${BRANCH}"
  git pull "${REMOTE}" "${BRANCH}"
  echo "    Commit: $(git rev-parse --short HEAD) – $(git log -1 --pretty=format:'%s')"
}

update_dependencies() {
  case "${MODE}" in
    systemd|repo)
      echo "==> Python-Abhängigkeiten aktualisieren ..."
      if [[ ! -d "${ROOT}/.venv" ]]; then
        python3 -m venv "${ROOT}/.venv"
      fi
      "${ROOT}/.venv/bin/pip" install --upgrade pip -q
      "${ROOT}/.venv/bin/pip" install -e . -q
      ;;
    docker)
      echo "==> Docker-Image neu bauen ..."
      docker compose build --pull
      ;;
  esac
}

start_service() {
  case "${MODE}" in
    systemd)
      echo "==> Starte systemd-Dienst ${SERVICE_NAME} ..."
      systemctl daemon-reload
      systemctl start "${SERVICE_NAME}"
      ;;
    docker)
      echo "==> Starte Docker-Container ..."
      docker compose up -d
      ;;
    repo)
      echo "==> Fertig. Dienst manuell starten, z. B.:"
      echo "    ${ROOT}/scripts/start.sh"
      return 0
      ;;
  esac
}

show_status() {
  case "${MODE}" in
    systemd)
      echo ""
      echo "Status:  systemctl status ${SERVICE_NAME}"
      echo "Logs:    journalctl -u ${SERVICE_NAME} -f"
      ;;
    docker)
      echo ""
      docker compose ps
      echo "Logs:    docker compose logs -f"
      ;;
  esac
}

show_failure_logs() {
  case "${MODE}" in
    systemd)
      journalctl -u "${SERVICE_NAME}" -n 30 --no-pager >&2 || true
      ;;
    docker)
      docker compose logs --tail=30 >&2 || true
      ;;
  esac
}

MODE="$(detect_mode)"
echo "==> M-Coder Update (Modus: ${MODE})"
echo "    Verzeichnis: ${ROOT}"
echo ""

case "${MODE}" in
  systemd)
    require_root
    ;;
  docker)
    if ! command -v docker &>/dev/null; then
      echo "Fehler: Docker nicht installiert." >&2
      exit 1
    fi
    if ! docker compose version &>/dev/null; then
      echo "Fehler: Docker Compose Plugin nicht gefunden." >&2
      exit 1
    fi
    ;;
  repo)
    ;;
  *)
    echo "Fehler: Unbekannter Modus '${MODE}'." >&2
    exit 1
    ;;
esac

stop_service
pull_latest
update_dependencies
start_service

if [[ "${MODE}" == "repo" ]]; then
  exit 0
fi

if [[ "${MODE}" == "docker" ]]; then
  wait_for_health 60 2 || { show_failure_logs; exit 1; }
else
  wait_for_health 30 1 || { show_failure_logs; exit 1; }
fi

show_status
echo "✓ Update abgeschlossen."
