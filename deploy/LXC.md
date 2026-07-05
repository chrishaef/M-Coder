# Proxmox LXC Deployment

M-Coder läuft in einem Debian/Ubuntu LXC-Container auf zwei Arten:

| Methode | Wann | Vorteil |
|---------|------|---------|
| **Native (empfohlen)** | Standard-LXC | Kein Docker nötig, weniger RAM |
| **Docker** | LXC mit `nesting=1` | Isoliert, einfaches Update |

## 1. LXC anlegen (Proxmox)

1. **CT erstellen** – Template: Debian 12 oder Ubuntu 24.04
2. **Ressourcen:** mind. 512 MB RAM, 2 GB Disk
3. **Netzwerk:** DHCP oder feste IP
4. **Optional für Docker:** unter *Options → Features* → `nesting=1` aktivieren

```bash
# Beispiel: Features in /etc/pve/lxc/<CTID>.conf
features: nesting=1
```

## 2a. Native Installation (empfohlen)

Im LXC als root:

```bash
apt update && apt install -y git curl
git clone https://github.com/chrishaef/M-Coder.git /opt/m-coder
cd /opt/m-coder
chmod +x scripts/*.sh
./scripts/install.sh
```

Das Skript installiert Abhängigkeiten, richtet Python venv + systemd ein und startet den Dienst.

**Ergebnis:** Web-UI unter `http://<LXC-IP>:8080`

```bash
systemctl status m-coder
journalctl -u m-coder -f
curl http://127.0.0.1:8080/health
```

### Konfiguration anpassen

```bash
nano /opt/m-coder/.env
systemctl restart m-coder
```

### Update

```bash
cd /opt/m-coder && git pull
.venv/bin/pip install -e . -q
systemctl restart m-coder
```

## 2b. Docker Installation

Nur wenn `nesting=1` im LXC gesetzt ist:

```bash
apt update && apt install -y git curl
curl -fsSL https://get.docker.com | sh
git clone https://github.com/chrishaef/M-Coder.git /opt/m-coder
cd /opt/m-coder
cp deploy/env.example .env
chmod +x scripts/docker-up.sh
./scripts/docker-up.sh
```

```bash
docker compose ps
docker compose logs -f
```

## 3. Manuell starten (ohne systemd)

Für Tests oder wenn kein root-Zugriff:

```bash
git clone https://github.com/chrishaef/M-Coder.git
cd M-Coder
chmod +x scripts/start.sh
./scripts/start.sh
```

## 4. Firewall (optional)

```bash
# UFW im LXC
ufw allow 8080/tcp
ufw enable
```

In Proxmox ggf. auch die Host-Firewall anpassen.

## 5. Reverse Proxy (Produktion)

TLS und API-Schutz über nginx auf dem LXC oder Host – siehe `nginx.conf.example`.

Setze in `.env`:

```
SAQ_API_KEY=dein-langer-zufallsstring
```

## 6. CLI offline im LXC

```bash
/opt/m-coder/.venv/bin/saq-decode /pfad/zur/aufnahme.wav --offset 708 --length 275
```

## Troubleshooting

| Problem | Lösung |
|---------|--------|
| `gerke_available: false` | `apt install openjdk-21-jre-headless` |
| Port nicht erreichbar | `SAQ_HOST=0.0.0.0` in `.env`, Firewall prüfen |
| Docker startet nicht | `nesting=1` im LXC aktivieren |
| Upload zu groß | `SAQ_MAX_UPLOAD_MB=200` in `.env` |
