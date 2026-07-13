from __future__ import annotations

import re
import wave
from pathlib import Path

from saq_decoder.audio_analysis import analyze_segment
from saq_decoder.autocorrect import autocorrect
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


def effective_decode_length(
    info: WavInfo, offset: float, length: float | None,
) -> float:
    available = max(0.0, info.duration_seconds - offset)
    if length is None:
        return available
    return min(length, available)


def decode(path: Path, options: DecodeOptions | None = None) -> DecodeResult:
    options = options or DecodeOptions()
    info = wav_info(path)
    seg_len = effective_decode_length(info, options.offset, options.length)

    analysis = analyze_segment(
        path,
        offset=options.offset,
        length=seg_len if seg_len > 0 else None,
        center_hz=options.freq,
    )
    detected_freq = analysis["detected_freq"]
    freq_used = detected_freq if options.auto_freq else (options.freq or detected_freq)

    use_gerke = not options.python_only and gerke_available()
    wpm = options.wpm or (20 if use_gerke else 18)

    if use_gerke:
        if options.wpm is None and options.auto_wpm and seg_len >= 0.5:
            wpm, text = auto_wpm_scan(path, options.offset, seg_len, freq_used)
        else:
            text = decode_with_gerke(
                path,
                offset=options.offset,
                length=options.length,
                freq=freq_used,
                wpm=wpm,
                timestamps=options.timestamps,
            )
        engine = "gerke"
    else:
        decode_freq = None if options.auto_freq else freq_used
        py_length = seg_len if options.length is not None else None
        text = decode_with_python(
            path,
            offset=options.offset,
            length=py_length,
            freq=decode_freq,
            wpm=wpm,
        )
        engine = "python"

    text_raw = text
    corrections: list[str] = []
    if options.autocorrect:
        text, corrections = autocorrect(text)

    if not options.raw:
        text = format_message(text)
        if corrections:
            text_raw = format_message(text_raw)

    return DecodeResult(
        text=text,
        wpm=wpm,
        engine=engine,
        duration_seconds=seg_len,
        detected_freq=detected_freq,
        freq_used=freq_used,
        freq_auto=options.auto_freq,
        text_raw=text_raw if corrections else None,
        corrections=corrections or None,
    )


def analyze(path: Path, *, offset: float = 0, length: float | None = None, center_hz: int | None = None) -> dict:
    return analyze_segment(path, offset=offset, length=length, center_hz=center_hz)
