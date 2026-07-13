from __future__ import annotations

import hashlib
from functools import lru_cache
from pathlib import Path

STATIC_DIR = Path(__file__).parent / "static"


@lru_cache(maxsize=1)
def static_asset_version() -> str:
    """Short hash of static files – changes when frontend assets change."""
    if not STATIC_DIR.exists():
        return "dev"

    digest = hashlib.sha256()
    for path in sorted(STATIC_DIR.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(STATIC_DIR).as_posix().encode()
        digest.update(rel)
        digest.update(path.read_bytes())
    return digest.hexdigest()[:12]
