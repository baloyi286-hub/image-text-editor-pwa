"""PixelType optional AI service. CPU OpenCV inpainting, with pluggable model adapter."""
import io
import os
from typing import Annotated

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from PIL import Image, UnidentifiedImageError

MAX_BYTES = int(os.getenv("MAX_IMAGE_BYTES", str(12 * 1024 * 1024)))
app = FastAPI(title="PixelType Image Restoration API", version="0.1.0")
origins = [s.strip() for s in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if s.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET", "POST"], allow_headers=["*"])

@app.get("/health")
def health():
    return {"status": "ok", "engine": "opencv-telea", "advanced_model": False}

@app.post("/v1/inpaint")
async def inpaint(
    image: Annotated[UploadFile, File()],
    x: Annotated[float, Form()],
    y: Annotated[float, Form()],
    width: Annotated[float, Form()],
    height: Annotated[float, Form()],
    padding: Annotated[int, Form()] = 3,
):
    """Returns full-resolution restored PNG. Coordinates are original image pixels."""
    raw = await image.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise HTTPException(413, "Image too large")
    try:
        pil = Image.open(io.BytesIO(raw)).convert("RGB")
        if pil.width * pil.height > 20_000_000:
            raise HTTPException(413, "Image exceeds 20 megapixels")
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise HTTPException(400, "Invalid image") from exc
    if width <= 0 or height <= 0:
        raise HTTPException(422, "Region must have positive width and height")
    rgb = np.asarray(pil)
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    h, w = bgr.shape[:2]
    pad = max(0, min(20, padding))
    x0, y0 = max(0, int(x) - pad), max(0, int(y) - pad)
    x1, y1 = min(w, int(np.ceil(x + width)) + pad), min(h, int(np.ceil(y + height)) + pad)
    if x0 >= x1 or y0 >= y1:
        raise HTTPException(422, "Region outside image")
    mask = np.zeros((h, w), dtype=np.uint8)
    mask[y0:y1, x0:x1] = 255
    result = cv2.inpaint(bgr, mask, 3, cv2.INPAINT_TELEA)
    ok, encoded = cv2.imencode(".png", result)
    if not ok:
        raise HTTPException(500, "Image encoding failed")
    return Response(content=encoded.tobytes(), media_type="image/png", headers={"Cache-Control": "no-store"})
