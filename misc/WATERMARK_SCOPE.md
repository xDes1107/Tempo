# Goal 2 - Watermark scope (Oct 28)

## Asset check (updated Oct 28 evening)
- File: Production/misc/watermark.png, 2400x2400 RGBA, ~100 KB.
- Content: red W / arrow mark on an OPAQUE black square (viewed Oct 28).
- Problem: not transparent, so a naive overlay stamps a black box, not a logo.
- Ask: export a logo-only PNG with transparent background (~1500 px longest side),
  plus optionally a white version for dark pages. Keep this file as fallback.


- New file misc/Meta.png (1567x1041 RGBA, ~62 KB): VERIFIED transparent (corners alpha 0, ~55 pct pixels transparent). The black seen in viewers is transparency rendered as black. APPROVED as primary logo.
- Previews: misc/preview-wm-10/15/25.png (white page, centered, 40 pct width). 15 pct = subtle professional default, 25 pct = clearly visible. No black box. Text stays readable.
- Old misc/watermark.png (opaque black box) deprecated; keep as fallback only.
- Stamper: backend/watermark.js (pdf-lib). Run where network exists: npm install pdf-lib --prefix Production, then node backend/watermark.js sample-pdfs/synthetic-glove-sample.pdf misc/Meta.png data/watermarked/sample-wm.pdf 0.15

## Engine decision (recommended)
- Use pdf-lib (pure JS, zero native deps, single-deploy friendly for Render / Fly.io).
- Install: npm i pdf-lib. No Dockerfile / toolchain change.
- MuPDF stays as the later option for scanned-PDF rendering and page images (Goal 3a).
- All 6 sample PDFs have extractable text, so pdf-lib covers the demo.

## Missing prerequisite
- The server does not persist source PDF bytes today (only JSON export).
- Add: save uploads to Production/data/uploads/<jobId>.pdf, store filePath on the job.
- Keep the source PDF separate from generated outputs (Architecture 3.8 / 7.5).

## Proposed API (lightweight)
- POST /api/jobs/:id/watermark { opacity (default 0.15), scale (default 0.4 page width), position (default center) }
- Renders the logo on every page, centered, low opacity, aspect preserved.
- GET /api/jobs/:id/watermark -> downloads data/watermarked/<jobId>.pdf.
- Job gains watermarkFile + watermarkOptions; original PDF untouched.

## Interim handling of the current PNG
- Option A (clean): wait for the transparent export. Recommended.
- Option B (demo now): overlay at low opacity as a centered tile; black box will show, acceptable for a tech spike only.
- Option C (processing): strip near-black pixels to alpha at stamp time. Cheap luminance mask, edges can look rough on dark pages.

## Effort
- About half a day: dep install, upload persistence, stamp module backend/watermark.js, two endpoints, manual check on 2-3 samples.
- Say go and it gets built in that order.

## Link to Goal 3
- Watermarked source feeds the standardized company-format report (Goal 3b template render).
- Faithful layout rebuild (Goal 3a stretch) reuses the same overlay path.
