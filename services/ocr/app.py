"""Local, authenticated OCR preview service; intentionally no database access."""
import asyncio
from contextlib import asynccontextmanager
from io import BytesIO
import logging
import math
import os
from pathlib import Path
import secrets
import warnings

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from PIL import Image, UnidentifiedImageError
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import UploadFile

from parser import TextBox, parse_data

MAX_BODY = 13 * 1024 * 1024
MAX_IMAGE = 12 * 1024 * 1024
MAX_PIXELS = 12_000_000
MAX_BOXES = 1500
logger = logging.getLogger("wzywt.ocr")


def load_token():
    path = os.environ.get("OCR_TOKEN_FILE")
    token = Path(path).read_text(encoding="utf-8").strip() if path else os.environ.get("OCR_TOKEN", "")
    if len(token) < 32 or not token.isascii() or any(c.isspace() for c in token):
        raise RuntimeError("Set OCR_TOKEN_FILE or OCR_TOKEN to an ASCII token of at least 32 characters without whitespace")
    return token


def load_engine():
    from rapidocr import RapidOCR
    return RapidOCR()


def decode_image(data):
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(data)) as source:
                width, height = source.size
                if source.format not in {"JPEG", "PNG", "WEBP"} or getattr(source, "is_animated", False):
                    raise ValueError("Only non-animated JPEG, PNG or WebP is supported")
                if width * height > MAX_PIXELS:
                    raise ValueError("Image exceeds 12 megapixels")
                # Keep pixel coordinate system unchanged; do not silently EXIF-rotate.
                source.load()
                return source.convert("RGB")
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise ValueError("Invalid image or excessive dimensions") from exc


def infer(engine, data, structured):
    with decode_image(data) as img:
        width, height = img.size
        result = engine(img)
    texts = result.txts if result.txts is not None else []
    polygons = result.boxes if result.boxes is not None else []
    scores = result.scores if result.scores is not None else []
    if not (len(texts) == len(polygons) == len(scores)) or len(texts) > MAX_BOXES:
        raise RuntimeError("Invalid OCR engine output")
    boxes = []
    for text, polygon, score in zip(texts, polygons, scores):
        points = [[float(x), float(y)] for x, y in polygon]
        confidence = float(score)
        if (len(points) != 4 or not math.isfinite(confidence) or not 0 <= confidence <= 1
                or any(not math.isfinite(v) for p in points for v in p) or len(str(text)) > 512):
            raise RuntimeError("Invalid OCR engine output")
        boxes.append(TextBox(str(text), confidence, points))
    if structured:
        return {"pages": [parse_data(boxes, width, height)], "experimental": True,
                "supportedTypes": ["DATA"], "requiresConfirmation": True}
    return {"width": width, "height": height,
            "boxes": [{"text": b.text, "confidence": b.confidence, "box": b.box} for b in boxes]}


def create_app(engine_factory=load_engine, token=None):
    service_token = load_token() if token is None else token
    busy = asyncio.Lock()

    @asynccontextmanager
    async def lifespan(app):
        app.state.engine = await run_in_threadpool(engine_factory)
        yield
        app.state.engine = None

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

    @app.get("/health")
    async def health():
        return {"status": "ok", "service": "wzywt-ocr-preview", "supportedTypes": ["DATA"],
                "fullMatchReady": False}

    async def process(request, structured):
        authorization = request.headers.get("authorization", "")
        if not secrets.compare_digest(authorization.encode(), f"Bearer {service_token}".encode()):
            raise HTTPException(401, "Invalid OCR token")
        # No queued images and only one call into the shared native inference engine.
        if busy.locked():
            raise HTTPException(429, "OCR busy; retry later", headers={"Retry-After": "5"})
        async with busy:
            content_type = request.headers.get("content-type", "")
            if not content_type.lower().startswith("multipart/form-data;"):
                raise HTTPException(415, "Expected multipart/form-data")
            length = request.headers.get("content-length")
            if length is not None and (not length.isdigit() or int(length) > MAX_BODY):
                raise HTTPException(413, "Request too large or invalid Content-Length")
            # Count actual bytes as well: Content-Length is not trusted, including chunked uploads.
            chunks = []
            size = 0
            try:
                async with asyncio.timeout(20):
                    async for chunk in request.stream():
                        size += len(chunk)
                        if size > MAX_BODY:
                            raise HTTPException(413, "Request exceeds 13 MiB")
                        chunks.append(chunk)
            except TimeoutError as exc:
                raise HTTPException(408, "Upload timed out") from exc

            async def receive_body():
                return {"type": "http.request", "body": b"".join(chunks), "more_body": False}

            bounded = Request(request.scope, receive_body)
            async with bounded.form(max_files=1, max_fields=1, max_part_size=1024) as form:
                if set(form) != {"screenshots", "types"}:
                    raise HTTPException(422, "Expected screenshots and types fields")
                files, types = form.getlist("screenshots"), form.getlist("types")
                if len(files) != 1 or len(types) != 1 or not isinstance(files[0], UploadFile) or not isinstance(types[0], str):
                    raise HTTPException(422, "Preview accepts exactly one screenshot and one type")
                if types[0] not in {"DATA", "OUTPUT", "SURVIVAL", "DEVELOPMENT", "KDA", "TEAM"}:
                    raise HTTPException(422, "Unknown screenshot type")
                if structured and types[0] != "DATA":
                    raise HTTPException(422, "Only DATA / 双方 is supported; use /ocr for other tabs' raw text")
                data = await files[0].read(MAX_IMAGE + 1)
                if not data or len(data) > MAX_IMAGE:
                    raise HTTPException(413, "Image must be nonempty and no larger than 12 MiB")
            try:
                # Shield + await on disconnect keeps the lock held until native inference ends.
                # In-process thread cancellation cannot safely terminate ONNX Runtime.
                task = asyncio.create_task(run_in_threadpool(infer, app.state.engine, data, structured))
                try:
                    return await asyncio.shield(task)
                except asyncio.CancelledError:
                    await task
                    raise
            except ValueError as exc:
                raise HTTPException(422, str(exc)) from exc
            except Exception:
                logger.error("OCR inference failed", exc_info=False)
                return JSONResponse({"detail": "OCR inference failed"}, status_code=503)

    @app.post("/ocr")
    async def raw(request: Request):
        return await process(request, False)

    @app.post("/recognize")
    async def recognize(request: Request):
        return await process(request, True)

    return app
