"""Decode presets for different CW applications."""

from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class DecodePreset:
    id: str
    name: str
    description: str
    freq: int
    wpm: float | None
    auto_wpm: bool
    live_interval: float
    sample_rate: int = 8000
    offset: float = 0.0
    length: float | None = None


PRESETS: tuple[DecodePreset, ...] = (
    DecodePreset(
        id="saq",
        name="SAQ VLF (Grimeton)",
        description="Schwedischer VLF-Sender (17.2 kHz), Audioton typisch 750 Hz",
        freq=750,
        wpm=None,
        auto_wpm=True,
        live_interval=6,
        sample_rate=8000,
    ),
    DecodePreset(
        id="ham",
        name="Amateurfunk CW",
        description="Typisches HF-CW auf Kurzwelle, 600 Hz Sideband-Ton",
        freq=600,
        wpm=None,
        auto_wpm=True,
        live_interval=4,
        sample_rate=11025,
    ),
    DecodePreset(
        id="maritime",
        name="Seefunk / Maritime",
        description="Langsamere maritime Sendegeschwindigkeit, 500 Hz",
        freq=500,
        wpm=12,
        auto_wpm=False,
        live_interval=5,
        sample_rate=8000,
    ),
    DecodePreset(
        id="beacon",
        name="Beacon / Funkpeiler",
        description="Kurze Beacon-Übertragungen, höhere Geschwindigkeit",
        freq=800,
        wpm=22,
        auto_wpm=False,
        live_interval=3,
        sample_rate=8000,
    ),
    DecodePreset(
        id="qrss",
        name="Langsam-CW / QRSS",
        description="Sehr langsame CW-Übertragungen zum Schwächeln",
        freq=750,
        wpm=8,
        auto_wpm=False,
        live_interval=10,
        sample_rate=8000,
    ),
    DecodePreset(
        id="custom",
        name="Manuell",
        description="Alle Parameter frei einstellbar",
        freq=750,
        wpm=None,
        auto_wpm=True,
        live_interval=4,
        sample_rate=8000,
    ),
)

PRESET_BY_ID = {p.id: p for p in PRESETS}


def list_presets() -> list[dict]:
    return [asdict(p) for p in PRESETS]
