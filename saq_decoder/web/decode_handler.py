from __future__ import annotations

import tempfile
from pathlib import Path

from fastapi import File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from saq_decoder.config import MAX_UPLOAD_BYTES
from saq_decoder.core import decode, wav_info
from saq_decoder.models import DecodeOptions


async def handle_decode_upload(
    file: UploadFile,
    *,
    offset: float = 0,
    length: float | None = None,
    freq: int = 750,
    wpm: float | None = None,
    auto_wpm: bool = True,
    python_only: bool = False,
    raw: bool = False,
    max_bytes: int | None = None,
) -> JSONResponse:
    limit = max_bytes if max_bytes is not None else MAX_UPLOAD_BYTES

    if not file.filename or not file.filename.lower().endswith(".wav"):
        raise HTTPException(status_code=400, detail="Nur .wav-Dateien werden unterstützt")

    data = await file.read()
    if len(data) > limit:
        raise HTTPException(
            status_code=413,
            detail=f"Datei zu groß (max. {limit // (1024 * 1024)} MB)",
        )
    if len(data) < 44:
        raise HTTPException(status_code=400, detail="Datei ist leer oder ungültig")

    suffix = Path(file.filename).suffix or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(data)
        tmp_path = Path(tmp.name)

    try:
        info = wav_info(tmp_path)
        result = decode(
            tmp_path,
            DecodeOptions(
                offset=offset,
                length=length,
                freq=freq,
                wpm=wpm,
                auto_wpm=auto_wpm and length is not None,
                python_only=python_only,
                raw=raw,
            ),
        )
        return JSONResponse({
            **result.to_dict(),
            "input": {
                "filename": file.filename,
                "sample_rate": info.sample_rate,
                "channels": info.channels,
                "duration_seconds": round(info.duration_seconds, 2),
            },
        })
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    finally:
        tmp_path.unlink(missing_ok=True)
