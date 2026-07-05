#!/usr/bin/env python3
"""Abwärtskompatibler Einstiegspunkt – nutzt saq-decode CLI."""
from saq_decoder.cli import main

if __name__ == "__main__":
    raise SystemExit(main())
