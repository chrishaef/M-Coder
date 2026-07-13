from dataclasses import dataclass
from pathlib import Path


@dataclass
class DecodeOptions:
    offset: float = 0.0
    length: float | None = None
    freq: int | None = 750
    auto_freq: bool = False
    wpm: float | None = None
    auto_wpm: bool = True
    python_only: bool = False
    timestamps: bool = False
    raw: bool = False
    autocorrect: bool = True
    # Reject low-confidence decodes (useful for live mic noise).
    min_score: int | None = None


@dataclass
class DecodeResult:
    text: str
    wpm: float
    engine: str  # "gerke" | "python"
    duration_seconds: float | None = None
    detected_freq: int | None = None
    freq_used: int | None = None
    freq_auto: bool = False
    text_raw: str | None = None
    corrections: list[str] | None = None

    def to_dict(self) -> dict:
        payload = {
            "text": self.text,
            "wpm": self.wpm,
            "engine": self.engine,
            "duration_seconds": self.duration_seconds,
            "detected_freq": self.detected_freq,
            "freq_used": self.freq_used,
            "freq_auto": self.freq_auto,
        }
        if self.text_raw is not None and self.text_raw != self.text:
            payload["text_raw"] = self.text_raw
        if self.corrections:
            payload["corrections"] = self.corrections
        return payload


@dataclass
class WavInfo:
    path: Path
    sample_rate: int
    channels: int
    duration_seconds: float
