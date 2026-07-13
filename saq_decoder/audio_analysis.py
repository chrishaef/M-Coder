from __future__ import annotations

import wave
from pathlib import Path

import numpy as np


def load_wav_segment(path: Path, offset: float, length: float | None) -> tuple[int, np.ndarray]:
    with wave.open(str(path), "rb") as w:
        sr = w.getframerate()
        raw = w.readframes(w.getnframes())
    data = np.frombuffer(raw, dtype=np.int16).astype(np.float64)
    if data.size:
        data /= max(float(np.max(np.abs(data))), 1e-12)
    i0 = int(offset * sr)
    i1 = int((offset + length) * sr) if length else len(data)
    return sr, data[i0:i1]


def find_tone_freq(
    data: np.ndarray,
    sr: int,
    *,
    lo: int = 400,
    hi: int = 1200,
    step: int = 5,
) -> int:
    seg = data[: min(len(data), int(20 * sr))]
    if len(seg) < sr // 10:
        return 750
    best_f, best_p = 750, 0.0
    t = np.arange(len(seg)) / sr
    for f in range(lo, hi, step):
        p = abs(float(np.dot(seg, np.sin(2 * np.pi * f * t))))
        if p > best_p:
            best_f, best_p = f, p
    return best_f


def compute_spectrum(
    data: np.ndarray,
    sr: int,
    *,
    center_hz: int,
    span_hz: int = 400,
    points: int = 128,
) -> dict:
    n = min(len(data), int(15 * sr))
    if n < 256:
        n = min(len(data), max(len(data), 256))
    seg = data[:n]
    if len(seg) < 64:
        freqs = np.linspace(center_hz - span_hz / 2, center_hz + span_hz / 2, points)
        return {
            "center_hz": center_hz,
            "span_hz": span_hz,
            "frequencies": [round(float(f), 1) for f in freqs],
            "magnitudes": [0.0] * points,
        }

    window = np.hanning(len(seg))
    fft = np.fft.rfft(seg * window)
    fft_freqs = np.fft.rfftfreq(len(seg), 1 / sr)
    mag = np.abs(fft)
    if mag.max() > 0:
        mag = mag / mag.max()

    lo = max(0.0, center_hz - span_hz / 2)
    hi = center_hz + span_hz / 2
    out_freqs = np.linspace(lo, hi, points)
    out_mag = np.interp(out_freqs, fft_freqs, mag, left=0.0, right=0.0)

    return {
        "center_hz": center_hz,
        "span_hz": span_hz,
        "frequencies": [round(float(f), 1) for f in out_freqs],
        "magnitudes": [round(float(m), 4) for m in out_mag],
    }


def analyze_segment(
    path: Path,
    *,
    offset: float = 0,
    length: float | None = None,
    center_hz: int | None = None,
    span_hz: int = 400,
) -> dict:
    # Compute basic level stats on raw PCM to detect near-silence/noise.
    with wave.open(str(path), "rb") as w:
        sr = w.getframerate()
        raw = w.readframes(w.getnframes())
    pcm = np.frombuffer(raw, dtype=np.int16)
    i0 = int(offset * sr)
    i1 = int((offset + length) * sr) if length else len(pcm)
    seg_pcm = pcm[i0:i1]
    if seg_pcm.size:
        rms = float(np.sqrt(np.mean(seg_pcm.astype(np.float64) ** 2)) / 32768.0)
        peak = float(np.max(np.abs(seg_pcm)) / 32768.0)
    else:
        rms = 0.0
        peak = 0.0

    sr, data = load_wav_segment(path, offset, length)
    detected = find_tone_freq(data, sr)
    center = center_hz if center_hz is not None else detected
    spectrum = compute_spectrum(data, sr, center_hz=center, span_hz=span_hz)
    return {
        "detected_freq": detected,
        "sample_rate": sr,
        "segment_samples": len(data),
        "spectrum": spectrum,
        "rms": round(rms, 6),
        "peak": round(peak, 6),
    }
