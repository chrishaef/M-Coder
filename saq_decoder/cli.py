from __future__ import annotations

import argparse
import sys
from pathlib import Path

from saq_decoder.core import decode
from saq_decoder.gerke import gerke_available
from saq_decoder.models import DecodeOptions


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

    parser = argparse.ArgumentParser(
        prog="saq-decode",
        description="Dekodiert SAQ-Morse-Aufnahmen (17.2 kHz CW).",
    )
    parser.add_argument("wav", type=Path, help="Pfad zur .wav-Aufnahme")
    parser.add_argument("--offset", "-o", type=float, default=0, help="Start in Sekunden")
    parser.add_argument("--length", "-l", type=float, default=None, help="Länge in Sekunden")
    parser.add_argument("--freq", "-f", type=int, default=750, help="Tonfrequenz in Hz")
    parser.add_argument("--wpm", "-w", type=float, default=None, help="WPM (sonst auto bei Segment)")
    parser.add_argument("--no-auto-wpm", action="store_true", help="Keine automatische WPM-Suche")
    parser.add_argument("--python-only", action="store_true", help="Nur Python-Fallback")
    parser.add_argument("--timestamps", "-t", action="store_true", help="Zeitstempel (gerke)")
    parser.add_argument("--raw", action="store_true", help="Keine Formatierung")
    parser.add_argument(
        "--min-score",
        type=int,
        default=None,
        help="Min. Score, sonst Text verwerfen (hilft gegen Noise im Live-Decode).",
    )
    parser.add_argument("--json", action="store_true", help="JSON-Ausgabe")
    args = parser.parse_args()

    if not args.wav.exists():
        print(f"Fehler: Datei nicht gefunden: {args.wav}", file=sys.stderr)
        return 1

    if not args.python_only and not gerke_available():
        print(
            "Hinweis: gerke-decoder nicht verfügbar – Python-Fallback.\n",
            file=sys.stderr,
        )

    try:
        result = decode(
            args.wav,
            DecodeOptions(
                offset=args.offset,
                length=args.length,
                freq=args.freq,
                wpm=args.wpm,
                auto_wpm=not args.no_auto_wpm,
                python_only=args.python_only,
                timestamps=args.timestamps,
                raw=args.raw,
                min_score=args.min_score,
            ),
        )
    except RuntimeError as exc:
        print(f"Fehler: {exc}", file=sys.stderr)
        return 1

    if args.json:
        import json
        print(json.dumps(result.to_dict(), ensure_ascii=False, indent=2))
    else:
        if result.engine == "gerke" and args.wpm is None and args.length:
            print(f"# Engine: {result.engine}, WPM: {result.wpm:.0f}\n", file=sys.stderr)
        print(result.text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
