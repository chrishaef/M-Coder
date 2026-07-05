from __future__ import annotations

import tempfile
from pathlib import Path

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from saq_decoder import __version__
from saq_decoder.config import API_KEY, MAX_UPLOAD_BYTES
from saq_decoder.core import decode, wav_info
from saq_decoder.gerke import gerke_available
from saq_decoder.models import DecodeOptions

STATIC_DIR = Path(__file__).parent / "static"

app = FastAPI(
    title="SAQ Morse Decoder",
    description="Dekodiert Aufnahmen des schwedischen VLF-Senders SAQ (17.2 kHz CW).",
    version=__version__,
)

if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


def _check_api_key(authorization: str | None, x_api_key: str | None) -> None:
    if not API_KEY:
        return
    token = x_api_key
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
    if token != API_KEY:
        raise HTTPException(status_code=401, detail="Ungültiger API-Schlüssel")


@app.get("/health")
def health():
    return {
        "status": "ok",
        "version": __version__,
        "gerke_available": gerke_available(),
    }


@app.get("/", response_class=HTMLResponse)
def index():
    html_path = STATIC_DIR / "index.html"
    if not html_path.exists():
        return HTMLResponse("<h1>SAQ Decoder API</h1><p>POST /decode</p>")
    return HTMLResponse(html_path.read_text(encoding="utf-8"))


@app.post("/decode")
async def decode_upload(
    file: UploadFile = File(...),
    offset: float = Form(0),
    length: float | None = Form(None),
    freq: int = Form(750),
    wpm: float | None = Form(None),
    auto_wpm: bool = Form(True),
    python_only: bool = Form(False),
    raw: bool = Form(False),
    authorization: str | None = Header(None),
    x_api_key: str | None = Header(None, alias="X-API-Key"),
):
    _check_api_key(authorization, x_api_key)

    if not file.filename or not file.filename.lower().endswith(".wav"):
        raise HTTPException(status_code=400, detail="Nur .wav-Dateien werden unterstützt")

    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Datei zu groß (max. {MAX_UPLOAD_BYTES // (1024*1024)} MB)",
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


def main() -> None:
    import uvicorn

    from saq_decoder.config import HOST, PORT

    uvicorn.run("saq_decoder.web.app:app", host=HOST, port=PORT, reload=False)


if __name__ == "__main__":
    main()
