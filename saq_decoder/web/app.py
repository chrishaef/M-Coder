from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from saq_decoder import __version__
from saq_decoder.config import API_KEY
from saq_decoder.gerke import gerke_available
from saq_decoder.transmit import generate_cw_wav, text_to_morse
from saq_decoder.web.decode_handler import handle_decode_upload

STATIC_DIR = Path(__file__).parent / "static"
LIVE_MAX_BYTES = 10 * 1024 * 1024

app = FastAPI(
    title="M-Coder",
    description="SAQ Morse Decoder – Live Decode, File Decode, Transmit",
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


class TransmitRequest(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    freq: int = Field(default=750, ge=100, le=5000)
    wpm: float = Field(default=20, ge=5, le=40)
    sample_rate: int = Field(default=8000, ge=4000, le=48000)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "version": __version__,
        "gerke_available": gerke_available(),
        "features": ["live_decode", "file_decode", "transmit"],
    }


@app.get("/", response_class=HTMLResponse)
def index():
    html_path = STATIC_DIR / "index.html"
    if not html_path.exists():
        return HTMLResponse("<h1>M-Coder API</h1><p>POST /decode/file · /decode/live · /transmit</p>")
    return HTMLResponse(html_path.read_text(encoding="utf-8"))


@app.post("/decode")
@app.post("/decode/file")
async def decode_file(
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
    return await handle_decode_upload(
        file,
        offset=offset,
        length=length,
        freq=freq,
        wpm=wpm,
        auto_wpm=auto_wpm,
        python_only=python_only,
        raw=raw,
    )


@app.post("/decode/live")
async def decode_live(
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
    return await handle_decode_upload(
        file,
        offset=offset,
        length=length,
        freq=freq,
        wpm=wpm,
        auto_wpm=auto_wpm,
        python_only=python_only,
        raw=raw,
        max_bytes=LIVE_MAX_BYTES,
    )


@app.post("/transmit")
async def transmit(
    body: TransmitRequest,
    authorization: str | None = Header(None),
    x_api_key: str | None = Header(None, alias="X-API-Key"),
):
    _check_api_key(authorization, x_api_key)
    try:
        wav_bytes = generate_cw_wav(
            body.text,
            freq=body.freq,
            wpm=body.wpm,
            sample_rate=body.sample_rate,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return Response(
        content=wav_bytes,
        media_type="audio/wav",
        headers={
            "X-Morse-Preview": text_to_morse(body.text)[:200],
            "Content-Disposition": 'inline; filename="morse.wav"',
        },
    )


def main() -> None:
    import uvicorn

    from saq_decoder.config import HOST, PORT

    uvicorn.run("saq_decoder.web.app:app", host=HOST, port=PORT, reload=False)


if __name__ == "__main__":
    main()
