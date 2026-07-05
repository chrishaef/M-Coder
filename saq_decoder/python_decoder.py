from __future__ import annotations

from pathlib import Path

import numpy as np
from scipy import signal
from scipy.ndimage import gaussian_filter1d, maximum_filter1d, minimum_filter1d

from saq_decoder.audio_analysis import find_tone_freq, load_wav_segment
from saq_decoder.morse import MORSE


def decode_with_python(
    wav: Path,
    *,
    offset: float = 0,
    length: float | None = None,
    freq: int | None = None,
    wpm: float = 18,
) -> str:
    sr, data = load_wav_segment(wav, offset, length)
    if len(data) < sr:
        raise RuntimeError("Audiosegment zu kurz")

    if freq is None:
        freq = find_tone_freq(data, sr)

    tu = 1.2 / wpm
    t = np.arange(len(data)) / sr
    i_mix = data * np.cos(2 * np.pi * freq * t)
    q_mix = data * np.sin(2 * np.pi * freq * t)
    nyq = sr / 2
    lp = min(3.0 / (tu * nyq), 0.99)
    b, a = signal.butter(2, lp, btype="low")
    env = np.sqrt(signal.filtfilt(b, a, i_mix) ** 2 + signal.filtfilt(b, a, q_mix) ** 2)
    env = gaussian_filter1d(env, max(0.18 * tu * sr, 3))

    win = max(int(20 * tu * sr), 50)
    keyed = env - (
        minimum_filter1d(env, win)
        + 0.5 * (maximum_filter1d(env, win) - minimum_filter1d(env, win))
    )

    ts = max(int(0.06 * tu * sr), 1)
    slices = keyed[: len(keyed) // ts * ts].reshape(-1, ts).mean(axis=1)
    thr = np.percentile(slices, 5) + 0.52 * (
        np.percentile(slices, 95) - np.percentile(slices, 5)
    )
    on = slices > thr

    runs: list[tuple[int, int]] = []
    i = 0
    while i < len(on):
        if on[i]:
            j = i + 1
            while j < len(on) and on[j]:
                j += 1
            runs.append((i * ts, min(j * ts, len(env))))
            i = j
        else:
            i += 1

    merged: list[tuple[int, int]] = []
    for s, e in runs:
        if merged and (s - merged[-1][1]) / sr < tu * 0.5:
            merged[-1] = (merged[-1][0], e)
        else:
            merged.append((s, e))

    if not merged:
        return ""

    durs = np.array([(e - s) / sr for s, e in merged])
    dot = np.percentile(durs, 30)
    bnd = dot * 2

    parts: list[str] = []
    for idx, (s, e) in enumerate(merged):
        parts.append("." if (e - s) / sr < bnd else "-")
        if idx + 1 < len(merged):
            gap = (merged[idx + 1][0] - e) / sr
            if gap >= tu * 7:
                parts.append(" / ")
            elif gap >= tu * 3:
                parts.append(" ")
    morse = "".join(parts)

    words = []
    for word in morse.split(" / "):
        word = word.strip()
        if word:
            words.append("".join(MORSE.get(tok, "?") for tok in word.split()))
    return " ".join(words)
