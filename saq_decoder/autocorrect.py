"""Heuristic post-processing for decoded Morse text."""

from __future__ import annotations

import re
import string
from difflib import get_close_matches

from saq_decoder.morse import KEYWORDS

_EXTRA_WORDS = (
    "A", "AN", "AT", "BE", "DO", "FOR", "FROM", "GO", "HE", "HER", "HERE", "HIS",
    "IN", "IS", "IT", "ME", "MY", "NOT", "OF", "ON", "OR", "OUR", "OUT", "SO", "THE",
    "TO", "UP", "US", "WE", "WAS", "WHO", "WILL", "WITH", "YOUR", "ALL", "AND", "ARE",
    "BUT", "CAN", "DAY", "GOOD", "HAM", "NEW", "NOW", "ONE", "OVER", "QSL", "QTH",
    "RST", "THANKS", "THANK", "VERY", "WAY", "CALL", "TEST", "SIGN", "NAME",
    "OPERATOR", "FREQUENCY", "REPORT", "PLEASE", "COPY", "COPIED", "AGAIN",
    "K", "KN", "BK", "BT", "AS", "NR", "OM", "ES", "FB", "HI", "FER", "CUL",
    "DX", "UR", "WX", "HR", "AGN", "RPT", "ANT", "PWR", "WATTS", "BAND",
    "METER", "BEAM", "DIPOLE", "VERTICAL", "LOOP", "KEY", "PADDLE",
    "YOTA", "IARU", "ARRL", "RSGB", "TIME", "DATE", "POWER", "SIGNAL",
    "STRENGTH", "READABILITY", "INTERNATIONAL", "UNESCO", "SWEDEN", "SWEDISH",
)

DICTIONARY: frozenset[str] = frozenset(w.upper() for w in (*KEYWORDS, *_EXTRA_WORDS))

_CONFUSION_PAIRS = (
    ("E", "I"), ("T", "N"), ("A", "R"), ("U", "V"), ("M", "N"),
    ("O", "0"), ("S", "5"), ("B", "6"), ("L", "R"), ("H", "S"),
    ("D", "B"), ("G", "C"), ("F", "P"), ("W", "V"), ("Y", "I"),
)

_WORD_RE = re.compile(r"[A-Za-z?0-9']+")


def autocorrect(text: str) -> tuple[str, list[str]]:
    """Return corrected text and a list of human-readable changes."""
    if not text or not text.strip():
        return text, []

    corrections: list[str] = []

    def replace_word(match: re.Match[str]) -> str:
        token = match.group()
        upper = token.upper()
        fixed = _fix_word(upper)
        if fixed != upper:
            corrections.append(f"{upper} → {fixed}")
        return fixed

    result = _WORD_RE.sub(replace_word, text)
    return result, corrections


def _fix_word(word: str) -> str:
    if not word or word in DICTIONARY:
        return word

    if "?" in word:
        fixed = _fix_questions(word)
        if fixed:
            return fixed

    fuzzy = get_close_matches(word, DICTIONARY, n=1, cutoff=_cutoff(len(word)))
    if fuzzy:
        return fuzzy[0]

    for variant in _confusion_variants(word):
        if variant in DICTIONARY:
            return variant
        fuzzy = get_close_matches(variant, DICTIONARY, n=1, cutoff=_cutoff(len(variant)))
        if fuzzy:
            return fuzzy[0]

    return word


def _cutoff(length: int) -> float:
    if length <= 3:
        return 0.92
    if length <= 5:
        return 0.85
    return 0.78


def _fix_questions(word: str) -> str | None:
    indices = [i for i, ch in enumerate(word) if ch == "?"]
    if not indices or len(indices) > 2:
        return None

    alphabet = string.ascii_uppercase + "0123456789"
    candidates: list[str]

    if len(indices) == 1:
        i = indices[0]
        candidates = [word[:i] + ch + word[i + 1:] for ch in alphabet]
    else:
        i, j = indices
        candidates = [
            word[:i] + a + word[i + 1:j] + b + word[j + 1:]
            for a in alphabet
            for b in alphabet
        ]

    dict_hits = [c for c in candidates if c in DICTIONARY]
    if len(dict_hits) == 1:
        return dict_hits[0]
    if dict_hits:
        dict_hits.sort(key=lambda w: (-len(w), w))
        return dict_hits[0]

    for cand in candidates:
        fuzzy = get_close_matches(cand, DICTIONARY, n=1, cutoff=_cutoff(len(cand)))
        if fuzzy:
            return fuzzy[0]
    return None


def _confusion_variants(word: str) -> set[str]:
    variants: set[str] = set()
    for i, ch in enumerate(word):
        for a, b in _CONFUSION_PAIRS:
            if ch == a:
                variants.add(word[:i] + b + word[i + 1:])
            elif ch == b:
                variants.add(word[:i] + a + word[i + 1:])
    return variants
