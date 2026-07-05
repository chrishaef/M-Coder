import os
import sys
from pathlib import Path

# Paket-Verzeichnis → Projekt-Root (vendor/ liegt eine Ebene höher)
PACKAGE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = PACKAGE_DIR.parent
VENDOR_DIR = Path(os.environ.get("SAQ_VENDOR_DIR", PROJECT_ROOT / "vendor"))

MAX_UPLOAD_BYTES = int(os.environ.get("SAQ_MAX_UPLOAD_MB", "100")) * 1024 * 1024
API_KEY = os.environ.get("SAQ_API_KEY", "")
HOST = os.environ.get("SAQ_HOST", "0.0.0.0")
PORT = int(os.environ.get("SAQ_PORT", "8080"))


def classpath_sep() -> str:
    return ";" if sys.platform == "win32" else ":"
