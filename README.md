# PixelType — Image Text Editor PWA

A browser-based, installable image text editor built with React, TypeScript, Fabric.js and Tesseract.js.

## Features
- Upload PNG, JPG or WebP images
- Detect words with browser-based OCR and create editable text overlays
- Add, move, rotate and resize text
- Change font, colour, size, opacity and text content
- Undo/redo edits and export a PNG
- Offline-capable PWA after first load (OCR language files may require network)

## Run
```bash
npm install
npm run dev
```
Open the local URL shown by Vite.

## Build
```bash
npm run build
npm run preview
```

## Deploy
Import this repository into Vercel, choose Vite and use the default build command `npm run build` and output directory `dist`.

## Limitations
OCR creates editable text overlays and does not remove the source pixels. The white cover action is a basic rectangle, not intelligent inpainting. Exact original font identification, background reconstruction and colour sampling are planned, not implemented. Image editing runs locally; no user images are uploaded to a server.
