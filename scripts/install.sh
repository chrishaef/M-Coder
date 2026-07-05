#!/usr/bin/env bash
# Native installation for Debian/Ubuntu (incl. Proxmox LXC without Docker).
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/m-coder}"
SERVICE_USER="${SERVICE_USER:-m-coder}"
SERVICE_NAME="m-coder"
REPO_URL="${REPO_URL:-https://github.com/chrishaef/M-Coder.git}"
BRANCH="${BRANCH:-main}"
LISTEN_HOST="${LISTEN_HOST:-0.0.0.0}"
LISTEN_PORT="${LISTEN_PORT:-8080}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Bitte als root ausführen: sudo $0" >&2
  exit 1
fi

echo "==> Pakete installieren..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  python3 python3-venv python3-pip \
  openjdk-21-jre-headless \
  git curl ca-certificates

echo "==> Dienstbenutzer anlegen..."
if ! id "${SERVICE_USER}" &>/dev/null; then
  useradd --system --home "${INSTALL_DIR}" --shell /usr/sbin/nologin "${SERVICE_USER}"
fi

echo "==> Projekt nach ${INSTALL_DIR}..."
mkdir -p "$(dirname "${INSTALL_DIR}")"
if [[ -d "${INSTALL_DIR}/.git" ]]; then
  cd "${INSTALL_DIR}"
  git fetch origin
  git checkout "${BRANCH}"
  git pull origin "${BRANCH}"
else
  git clone --branch "${BRANCH}" --depth 1 "${REPO_URL}" "${INSTALL_DIR}"
  cd "${INSTALL_DIR}"
fi

echo "==> Python-Umgebung einrichten..."
python3 -m venv .venv
.venv/bin/pip install --upgrade pip -q
.venv/bin/pip install -e . -q

echo "==> Umgebungsdatei..."
cat > "${INSTALL_DIR}/.env" <<EOF
SAQ_VENDOR_DIR=${INSTALL_DIR}/vendor
SAQ_HOST=${LISTEN_HOST}
SAQ_PORT=${LISTEN_PORT}
# SAQ_API_KEY=
# SAQ_MAX_UPLOAD_MB=100
EOF
chown "${SERVICE_USER}:${SERVICE_USER}" "${INSTALL_DIR}/.env"
chmod 640 "${INSTALL_DIR}/.env"

echo "==> systemd-Dienst installieren..."
sed \
  -e "s|@INSTALL_DIR@|${INSTALL_DIR}|g" \
  -e "s|@SERVICE_USER@|${SERVICE_USER}|g" \
  deploy/m-coder.service.template > "/etc/systemd/system/${SERVICE_NAME}.service"

chown -R "${SERVICE_USER}:${SERVICE_USER}" "${INSTALL_DIR}"

systemctl daemon-reload
systemctl enable "${SERVICE_NAME}"
systemctl restart "${SERVICE_NAME}"

echo "==> Warte auf Dienst..."
for i in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:${LISTEN_PORT}/health" >/dev/null; then
    echo ""
    echo "✓ M-Coder läuft auf http://${LISTEN_HOST}:${LISTEN_PORT}"
    curl -s "http://127.0.0.1:${LISTEN_PORT}/health" | sed 's/^/  /'
    echo ""
    echo "Status:  systemctl status ${SERVICE_NAME}"
    echo "Logs:    journalctl -u ${SERVICE_NAME} -f"
    exit 0
  fi
  sleep 1
done

echo "Fehler: Dienst antwortet nicht auf Port ${LISTEN_PORT}" >&2
journalctl -u "${SERVICE_NAME}" -n 20 --no-pager >&2
exit 1
