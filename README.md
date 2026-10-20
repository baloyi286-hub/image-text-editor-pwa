# PixelType — Hybrid Image Text Editor PWA

PixelType combines **browser-based OCR and editable text layers** (React, TypeScript, Fabric.js, Tesseract.js) with an **optional Python image-restoration API** (FastAPI and OpenCV).

## Current capabilities

- Upload PNG, JPEG, WebP images; OCR detection runs locally in the browser.
- Click a detected text region to replace that region with an editable Fabric.js text object.
- Adjust text, colour, size, font, opacity and rotation; export PNG.
- With the optional backend configured, restore the clicked region through the remote inpainting endpoint; otherwise use a basic local flat-colour cover.
- Undo and redo text edits. PWA can be installed after loading.

**Current limitations:** OCR and font style matching are heuristic. The Python service uses OpenCV Telea inpainting, **not** a trained AI inpainting model. Complex graphics, outlined text, and imperfect OCR masks can still produce visible artifacts. A future model adapter, glyph-level masks, better font classification, and authenticated rate-limited hosting are needed for PhoText-quality editing.

## Local development

```bash
npm install
npm run dev
```

For the optional restoration service, follow [backend/README.md](backend/README.md) and run the API on port 8080. Copy `.env.example` to `.env.local` and set:

```dotenv
VITE_AI_API_URL=http://localhost:8080
```

Restart the Vite dev server after changing environment variables.

## Deployment

**Frontend:** Import the GitHub repository into Vercel. Build command: `npm run build`; output: `dist`.

**Backend:** Build and deploy `backend/Dockerfile` on a separate container host. Set `CORS_ORIGINS=https://your-frontend-domain` on the backend. Set `VITE_AI_API_URL=https://your-backend-domain` on Vercel, then redeploy the frontend. HTTPS is required for a public HTTPS frontend.

**Privacy:** OCR stays local, but enabling the remote restoration service **uploads the original image to that service** when you click a detected region. Leave the backend URL unset to avoid this transfer.

## Verification

Run `npm run build` and test browser editing. Check the backend with `GET /health` and its `POST /v1/inpaint` endpoint. Do not assume the cloud backend is running until it has been deployed and health-checked.
