from __future__ import annotations

import io
import wave

import numpy as np

from saq_decoder.morse import MORSE

CHAR_TO_MORSE = {char: pattern for pattern, char in MORSE.items()}


def text_to_morse(text: str) -> str:
    parts: list[str] = []
    for ch in text.upper():
        if ch == " ":
            parts.append("/")
        elif ch in CHAR_TO_MORSE:
            parts.append(CHAR_TO_MORSE[ch])
    return " ".join(parts)


def _unit_seconds(wpm: float) -> float:
    return 1.2 / wpm


def _append_segment(
    samples: list[float],
    *,
    on: bool,
    duration: float,
    sample_rate: int,
    freq: int,
    phase: float,
) -> float:
    n = max(1, int(duration * sample_rate))
    t = np.arange(n) / sample_rate
    if on:
        chunk = np.sin(2 * np.pi * freq * t + phase)
        phase += 2 * np.pi * freq * duration
    else:
        chunk = np.zeros(n)
    samples.extend(chunk.tolist())
    return phase


def generate_cw_samples(
    text: str,
    *,
    freq: int = 750,
    wpm: float = 20,
    sample_rate: int = 8000,
) -> np.ndarray:
    unit = _unit_seconds(wpm)
    samples: list[float] = []
    phase = 0.0
    prev_was_char = False

    for ch in text.upper():
        if ch in (" ", "\n", "\t"):
            if prev_was_char:
                phase = _append_segment(
                    samples, on=False, duration=7 * unit,
                    sample_rate=sample_rate, freq=freq, phase=phase,
                )
                prev_was_char = False
            continue

        pattern = CHAR_TO_MORSE.get(ch)
        if not pattern:
            continue

        if prev_was_char:
            phase = _append_segment(
                samples, on=False, duration=3 * unit,
                sample_rate=sample_rate, freq=freq, phase=phase,
            )

        for elem_idx, symbol in enumerate(pattern):
            if elem_idx > 0:
                phase = _append_segment(
                    samples, on=False, duration=unit,
                    sample_rate=sample_rate, freq=freq, phase=phase,
                )
            duration = unit if symbol == "." else 3 * unit
            phase = _append_segment(
                samples, on=True, duration=duration,
                sample_rate=sample_rate, freq=freq, phase=phase,
            )
        prev_was_char = True

    if not samples:
        raise ValueError("Kein sendbarer Morse-Inhalt")

    data = np.array(samples, dtype=np.float64)
    peak = max(float(np.max(np.abs(data))), 1e-12)
    return (data / peak * 0.92).astype(np.float64)


def generate_cw_wav(
    text: str,
    *,
    freq: int = 750,
    wpm: float = 20,
    sample_rate: int = 8000,
) -> bytes:
    data = generate_cw_samples(text, freq=freq, wpm=wpm, sample_rate=sample_rate)
    pcm = (data * 32767).astype(np.int16)

    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(pcm.tobytes())
    return buf.getvalue()
