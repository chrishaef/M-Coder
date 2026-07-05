from dataclasses import dataclass
from pathlib import Path


@dataclass
class DecodeOptions:
    offset: float = 0.0
    length: float | None = None
    freq: int = 750
    wpm: float | None = None
    auto_wpm: bool = True
    python_only: bool = False
    timestamps: bool = False
    raw: bool = False


@dataclass
class DecodeResult:
    text: str
    wpm: float
    engine: str  # "gerke" | "python"
    duration_seconds: float | None = None

    def to_dict(self) -> dict:
        return {
            "text": self.text,
            "wpm": self.wpm,
            "engine": self.engine,
            "duration_seconds": self.duration_seconds,
        }


@dataclass
class WavInfo:
    path: Path
    sample_rate: int
    channels: int
    duration_seconds: float
