from __future__ import annotations

import re
import wave
from pathlib import Path

from saq_decoder.gerke import auto_wpm_scan, decode_with_gerke, gerke_available
from saq_decoder.models import DecodeOptions, DecodeResult, WavInfo
from saq_decoder.python_decoder import decode_with_python


def format_message(text: str) -> str:
    text = re.sub(r"\s*=\s*", "\n\n= ", text)
    if text.startswith("= "):
        text = "\n" + text
    return text.strip()


def wav_info(path: Path) -> WavInfo:
    with wave.open(str(path), "rb") as w:
        sr = w.getframerate()
        frames = w.getnframes()
        channels = w.getnchannels()
    return WavInfo(
        path=path,
        sample_rate=sr,
        channels=channels,
        duration_seconds=frames / sr,
    )


def decode(path: Path, options: DecodeOptions | None = None) -> DecodeResult:
    options = options or DecodeOptions()
    info = wav_info(path)

    use_gerke = not options.python_only and gerke_available()
    wpm = options.wpm or (20 if use_gerke else 18)

    if use_gerke:
        if options.wpm is None and options.auto_wpm and options.length:
            wpm, text = auto_wpm_scan(path, options.offset, options.length, options.freq)
        else:
            text = decode_with_gerke(
                path,
                offset=options.offset,
                length=options.length,
                freq=options.freq,
                wpm=wpm,
                timestamps=options.timestamps,
            )
        engine = "gerke"
    else:
        text = decode_with_python(
            path,
            offset=options.offset,
            length=options.length,
            freq=options.freq,
            wpm=wpm,
        )
        engine = "python"

    if not options.raw:
        text = format_message(text)

    seg_len = options.length
    if seg_len is None:
        seg_len = max(0.0, info.duration_seconds - options.offset)

    return DecodeResult(text=text, wpm=wpm, engine=engine, duration_seconds=seg_len)
