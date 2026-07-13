from __future__ import annotations

import re
import shutil
import subprocess
import wave
from pathlib import Path

from saq_decoder.config import VENDOR_DIR, classpath_sep
from saq_decoder.morse import KEYWORDS


def find_java() -> str | None:
    return shutil.which("java")


def gerke_classpath() -> str | None:
    jars = [
        VENDOR_DIR / "gerke_decoder.jar",
        VENDOR_DIR / "iirj-1.1.jar",
        VENDOR_DIR / "commons-math3-3.6.1.jar",
    ]
    if not jars[0].exists():
        return None
    if any(not j.exists() for j in jars[1:]):
        return None
    return classpath_sep().join(str(j) for j in jars)


def gerke_available() -> bool:
    return bool(find_java() and gerke_classpath())


def clean_gerke_output(raw: str) -> str:
    text = re.sub(r"\s*/\d+/\s*", " ", raw)
    text = text.replace("<SN>", "").replace("<AS>", "")
    text = re.sub(r"\[[^\]]+\]", "", text)
    text = re.sub(r"[\ufffd\uFFFD]", "", text)
    text = re.sub(r" +", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def score_text(text: str) -> int:
    upper = text.upper()
    s = sum(c.isalpha() for c in text) - text.count("?") * 5
    for kw in KEYWORDS:
        if kw in upper:
            s += 50
    return s


def _wav_duration(wav: Path) -> float:
    with wave.open(str(wav), "rb") as w:
        return w.getnframes() / w.getframerate()


def _gerke_length_seconds(offset: float, length: float | None, file_duration: float) -> int | None:
    """Safe -l value for gerke-decoder, or None to decode through end of file."""
    available = max(0.0, file_duration - offset)
    if available < 0.05:
        return None
    if length is None or length >= available - 0.05:
        return None
    clamped = min(length, available)
    sec = int(clamped)
    if sec < 1 or sec > int(available):
        return None
    return sec


def decode_with_gerke(
    wav: Path,
    *,
    offset: float = 0,
    length: float | None = None,
    freq: int = 750,
    wpm: float = 20,
    timestamps: bool = False,
) -> str:
    java = find_java()
    cp = gerke_classpath()
    if not java or not cp:
        raise RuntimeError("gerke-decoder nicht verfügbar (Java oder JAR-Dateien fehlen)")

    cmd = [
        java, "-cp", cp,
        "st.foglo.gerke_decoder.GerkeDecoder",
        "-f", str(freq),
        "-w", str(wpm),
        "-o", str(int(offset)),
        "-T", "U",
    ]
    gerke_len = _gerke_length_seconds(offset, length, _wav_duration(wav))
    if gerke_len is not None:
        cmd.extend(["-l", str(gerke_len)])
    if timestamps:
        cmd.append("-t")
    cmd.append(str(wav))

    result = subprocess.run(
        cmd, capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "gerke-decoder fehlgeschlagen")
    return clean_gerke_output(result.stdout)


def auto_wpm_scan(
    wav: Path, offset: float, length: float, freq: int,
) -> tuple[float, str]:
    best_wpm, best_text, best_score = 20.0, "", -1
    for wpm in range(16, 24):
        try:
            text = decode_with_gerke(
                wav, offset=offset, length=length, freq=freq, wpm=float(wpm),
            )
        except RuntimeError:
            continue
        score = score_text(text)
        if score > best_score:
            best_wpm, best_text, best_score = float(wpm), text, score
    if best_score < 0:
        text = decode_with_gerke(wav, offset=offset, length=length, freq=freq, wpm=20)
        return 20.0, text
    return best_wpm, best_text
