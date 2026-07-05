# M-Coder

SAQ Morse Decoder – dekodiert Aufnahmen des schwedischen VLF-Senders **SAQ** (Grimeton, 17.2 kHz CW).

Repository: [github.com/chrishaef/M-Coder](https://github.com/chrishaef/M-Coder)

- **Offline:** CLI-Tool `saq-decode`
- **Online:** Web-API + Upload-Oberfläche unter Debian (Docker oder systemd)

Der Dekoder nutzt [gerke-decoder](https://github.com/fowlay/gerke-decoder) (GPL-3.0) für beste Ergebnisse bei verrauschten VLF-Aufnahmen. Ohne Java fällt er auf einen einfacheren Python-Dekoder zurück.

## Schnellstart (lokal)

```bash
# Abhängigkeiten (Java 11+ empfohlen)
pip install -e .

# WAV dekodieren
saq-decode aufnahme.wav

# Nur Botschaft (z. B. ab 13:00 UTC bei Aufnahme ab 12:48)
saq-decode aufnahme.wav --offset 708 --length 275

# JSON-Ausgabe
saq-decode aufnahme.wav --offset 708 --length 275 --json
```

## Web-Dienst lokal starten

```bash
saq-serve
# → http://localhost:8080
```

## Debian-Server (Docker, empfohlen)

```bash
git clone https://github.com/chrishaef/M-Coder.git /opt/saq-morse-decoder
cd /opt/saq-morse-decoder
docker compose up -d --build
```

Der Dienst läuft auf Port **8080**. Für Produktion:

1. `SAQ_API_KEY` in `docker-compose.yml` setzen
2. nginx/Caddy als TLS-Reverse-Proxy davor (siehe `deploy/nginx.conf.example`)

## Debian-Server (ohne Docker)

```bash
apt install python3 python3-venv python3-pip openjdk-21-jre-headless
git clone https://github.com/chrishaef/M-Coder.git /opt/saq-morse-decoder
cd /opt/saq-morse-decoder
python3 -m venv .venv
source .venv/bin/activate
pip install -e .

# systemd
useradd --system --home /opt/saq-morse-decoder saq
cp deploy/saq-decoder.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now saq-decoder
```

## API

### `GET /health`

Status und Verfügbarkeit von gerke-decoder.

### `POST /decode`

Multipart-Upload mit Feldern:

| Feld | Typ | Standard | Beschreibung |
|------|-----|----------|--------------|
| `file` | WAV | – | Aufnahme |
| `offset` | float | 0 | Start in Sekunden |
| `length` | float | – | Segmentlänge (für Auto-WPM empfohlen) |
| `freq` | int | 750 | Tonfrequenz Hz |
| `wpm` | float | – | Sendegeschwindigkeit |
| `auto_wpm` | bool | true | WPM 16–23 automatisch testen |
| `python_only` | bool | false | Nur Python-Fallback |

Optional: Header `X-API-Key` wenn `SAQ_API_KEY` gesetzt ist.

```bash
curl -F "file=@aufnahme.wav" -F "offset=708" -F "length=275" \
  http://localhost:8080/decode
```

## Umgebungsvariablen

| Variable | Standard | Beschreibung |
|----------|----------|--------------|
| `SAQ_VENDOR_DIR` | `./vendor` | Pfad zu gerke-decoder JARs |
| `SAQ_API_KEY` | – | Optionaler API-Schlüssel |
| `SAQ_MAX_UPLOAD_MB` | 100 | Max. Upload-Größe |
| `SAQ_HOST` | 0.0.0.0 | Webserver-Host |
| `SAQ_PORT` | 8080 | Webserver-Port |

## Projektstruktur

```
saq-morse-decoder/
├── saq_decoder/          # Python-Paket
│   ├── cli.py            # Offline-CLI
│   ├── core.py           # Dekodier-Logik
│   ├── gerke.py          # Java-Wrapper
│   └── web/              # FastAPI-Dienst
├── vendor/               # gerke-decoder JARs
├── deploy/               # systemd + nginx
├── Dockerfile
└── docker-compose.yml
```

## Lizenz

MIT für dieses Projekt. **gerke-decoder** (in `vendor/`) steht unter GPL-3.0 – siehe [fowlay/gerke-decoder](https://github.com/fowlay/gerke-decoder).
