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

from parser import TextBox, parse_page, PAGE_COLUMNS, INTEGER_FIELDS, number

MAX_BODY = 13 * 1024 * 1024
MAX_BATCH_BODY = 73 * 1024 * 1024  # six 12 MiB images plus bounded multipart overhead
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


def infer(engine, data, structured, kind="DATA"):
    with decode_image(data) as img:
        width, height = img.size
        # RapidOCR call-time flags are mutable: reset them after recognition-only crops.
        result = engine(img, use_det=True, use_cls=True, use_rec=True)
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
        page = parse_page(boxes, width, height, kind)
        with decode_image(data) as img:
            recover_small_numbers(engine, img, page, boxes)
        return {"pages": [page], "experimental": True,
                "supportedTypes": list(PAGE_COLUMNS), "requiresConfirmation": True}
    return {"width": width, "height": height,
            "boxes": [{"text": b.text, "confidence": b.confidence, "box": b.box} for b in boxes]}


def recover_small_numbers(engine, image, page, boxes):
    """Re-read only missing short numeric cells, never bars, nicknames or conflicting boxes.

Single digits can be missed by full-image detection. Two recognition-only crops
must agree at >= .98 confidence. No inference from totals, percentages or other rows.
"""
    width, height = image.size
    attempts = 0
    for player in page["players"]:
        shift = .44 if player["side"] == "red" else 0
        top = .192 + (player["slot"]-1)*.1195
        for _label, field, x1, x2, percent in PAGE_COLUMNS[page["type"]]:
            metric = player["metrics"][field]
            if metric["value"] is not None or percent or field not in INTEGER_FIELDS | {"damageConversionRate", "controlScore"}:
                continue
            candidates = [b for b in boxes if x1+shift <= b.center[0]/width < x2+shift
                          and top+.049 <= b.center[1]/height < top+.078]
            if len(candidates) > 1 or attempts >= 10:
                continue
            attempts += 1
            rect = (int((x1+shift)*width), int((top+.043)*height),
                    int((x1+shift+.045)*width), int((top+.080)*height))
            readings = []
            with image.crop(rect) as crop:
                for scale in (1, 2):
                    with crop.resize((crop.width*scale, crop.height*scale)) as sample:
                        result = engine(sample, use_det=False, use_cls=False, use_rec=True)
                    texts = result.txts if result.txts is not None else []
                    scores = result.scores if result.scores is not None else []
                    if len(texts) != 1 or len(scores) != 1:
                        break
                    value, confidence = number(str(texts[0])), float(scores[0])
                    if (value is None or not math.isfinite(confidence) or not .98 <= confidence <= 1
                            or (field in INTEGER_FIELDS and not value.is_integer())):
                        break
                    readings.append((value, confidence))
            if len(readings) == 2 and readings[0][0] == readings[1][0]:
                left, top_px, right, bottom = rect
                metric.update(value=readings[0][0], confidence=min(r[1] for r in readings),
                              sourceRegion=",".join(map(str, (left, top_px, right, top_px, right, bottom, left, bottom))))


def infer_batch(engine, images, structured):
    if not structured:
        return infer(engine, images[0][1], False)
    pages = []
    for kind, data in images:
        pages.extend(infer(engine, data, True, kind)["pages"])
    return {"pages": pages, "experimental": True, "supportedTypes": list(PAGE_COLUMNS),
            "requiresConfirmation": True}


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
        return {"status": "ok", "service": "wzywt-ocr-preview", "supportedTypes": list(PAGE_COLUMNS),
                "fullMatchReady": True, "requiresConfirmation": True,
                "pid": os.getpid(), "instanceId": os.environ.get("OCR_INSTANCE_ID")}

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
            body_limit = MAX_BATCH_BODY if structured else MAX_BODY
            if length is not None and (not length.isdigit() or int(length) > body_limit):
                raise HTTPException(413, "Request too large or invalid Content-Length")
            # Count actual bytes as well: Content-Length is not trusted, including chunked uploads.
            chunks = []
            size = 0
            try:
                async with asyncio.timeout(20):
                    async for chunk in request.stream():
                        size += len(chunk)
                        if size > body_limit:
                            raise HTTPException(413, "OCR request exceeds upload limit")
                        chunks.append(chunk)
            except TimeoutError as exc:
                raise HTTPException(408, "Upload timed out") from exc

            # Replay bounded chunks instead of allocating a second joined batch body.
            chunks.reverse()

            async def receive_body():
                chunk = chunks.pop() if chunks else b""
                return {"type": "http.request", "body": chunk, "more_body": bool(chunks)}

            bounded = Request(request.scope, receive_body)
            max_files = 6 if structured else 1
            images = []
            async with bounded.form(max_files=max_files, max_fields=max_files, max_part_size=1024) as form:
                if set(form) != {"screenshots", "types"}:
                    raise HTTPException(422, "Expected screenshots and types fields")
                files, types = form.getlist("screenshots"), form.getlist("types")
                if (not 1 <= len(files) <= max_files or len(files) != len(types)
                        or not all(isinstance(f, UploadFile) for f in files)
                        or not all(isinstance(t, str) for t in types)):
                    raise HTTPException(422, "Each screenshot must have one paired type (maximum six)")
                if any(t not in PAGE_COLUMNS for t in types):
                    raise HTTPException(422, "Unknown screenshot type")
                if len(set(types)) != len(types):
                    raise HTTPException(422, "Duplicate screenshot types")
                for kind, file in zip(types, files):
                    data = await file.read(MAX_IMAGE + 1)
                    if not data or len(data) > MAX_IMAGE:
                        raise HTTPException(413, "Image must be nonempty and no larger than 12 MiB")
                    try:
                        with decode_image(data):
                            pass  # Validate every image before spending time on inference.
                    except ValueError as exc:
                        raise HTTPException(422, f"{kind}: {exc}") from exc
                    images.append((kind, data))
            try:
                # Shield + await on disconnect keeps the lock held until native inference ends.
                # In-process thread cancellation cannot safely terminate ONNX Runtime.
                task = asyncio.create_task(run_in_threadpool(infer_batch, app.state.engine, images, structured))
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
