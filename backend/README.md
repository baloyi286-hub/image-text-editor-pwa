# Optional PixelType image-restoration backend

FastAPI service for selective background restoration. This **initial** backend uses OpenCV Telea inpainting on CPU, **not** LaMa or a generative AI model. It provides a clean boundary for later LaMa/other model adapters. It is more useful for small text on simple backgrounds than for complex images.

## Local setup

```bash
cd backend
python -m venv .venv
pip install -r requirements.txt
CORS_ORIGINS=http://localhost:5173 uvicorn app:app --reload --port 8080
```

On Windows PowerShell: `$env:CORS_ORIGINS="http://localhost:5173"; uvicorn app:app --reload --port 8080`.

## Docker

```bash
docker build -t pixeltype-ai ./backend
docker run -p 8080:8080 -e CORS_ORIGINS=https://YOUR-FRONTEND.vercel.app pixeltype-ai
```

Deploy this container to an always-running container platform, not Vercel's static frontend. Configure `VITE_AI_API_URL` on the frontend Vercel project to point at its HTTPS origin, then rebuild.

## API

- `GET /health`: engine and status
- `POST /v1/inpaint`: multipart image file and original-image pixel coordinates `x,y,width,height`, optional `padding`. Returns restored full-image PNG.

CORS allowlist is set via `CORS_ORIGINS` (comma separated). Do not send confidential images to a backend you do not trust. Add authentication, rate limits, abuse protection, and a true segmentation/model-based mask before public production rollout.
