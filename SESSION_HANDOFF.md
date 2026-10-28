# Session handoff - Visual Translator (Oct 28, end of day)

Read this first when resuming work. Companion docs: 01_Project_Overview.md,
02_System_Architecture.md, 03_Roadmap_v2.md (progress log), misc/WATERMARK_SCOPE.md.

## Project
Supplier PDF datasheets -> structured data -> watermarked docs -> translations.
Stack: Node backend (Production/backend, serves frontend static on :7500),
vanilla JS frontend (index.html is the entry point), SQLite
(Production/data/visual-translator.db) + JSON exports, pdf-parse for text,
pdf-lib for PDF stamping/generation, Meta Model API for AI steps.

## Goal status
1. Data enrichment - DONE (deterministic part). Schema v2.1.0-2026-10-28
   (11 fields, incl. optional translatable industriesOrApplications).
   Extractor deterministic-rules-v2.1, validation tolerant of v2.0 records,
   enrich.js (website description, 38-col ERP row/CSV, AI prompt builder),
   export endpoint GET /api/jobs/:id/export?format=json|csv[&lang=xx].
2. Watermark - DONE end to end. pdf-lib overlay, positions:
   upper-left, upper-right, lower-left, lower-right, footer, center.
   DEFAULT = upper-right. Corners: 18% width, 36pt margin. Footer: full-width
   band capped at 12% page height. Opacity 0.15. Logo: misc/Meta.png
   (transparent, approved). Old misc/watermark.png deprecated (opaque box).
   Endpoints: POST /api/jobs/:id/watermark {position, opacity},
   GET /api/jobs/:id/watermark. Frontend: corner radio grid + footer row,
   apply button, download link.
3. Translation - simple step DONE, files DONE. POST /api/jobs/:id/translate
   {targetLang: en|pt|es} fills translation slots (translatable fields only;
   IDs, numbers, units, cert codes never translated) + fluent description
   cached on record.translatedDescriptions. Outputs: bilingual PDF report
   GET /api/jobs/:id/report?lang=xx (backend/report.js) + translated CSV.
   Frontend: PT/ES/EN buttons, side-by-side original -> translated list,
   report + CSV download links. Saved translations re-render free.

## Locked decisions
- Default model: muse-spark-1.3 on https://api.meta.ai/v1 (MODEL_API_BASE).
  Translation quality mid/poor but accepted for now; don't churn prompts yet.
- Never-translate list is in schema.js DO_NOT_TRANSLATE.
- Source PDFs persist under data/uploads; watermarked under data/watermarked.
- Frontend API calls are relative paths; open http://localhost:7500/ (not file://).

## Restart commands (operator machine)
- $env:MODEL_API_KEY = "<key>"  (never in repo)
- $env:MODEL_API_BASE = "https://api.meta.ai/v1"
- $env:MODEL_API_MODEL = "muse-spark-1.3"  (optional now, it is the default)
- cd Production; npm install  (needs pdf-lib + pdf-parse)
- node backend/server.js  ->  http://localhost:7500/
- Diagnose models: npm run list-models. Diagnose API: npm run verify:meta.

## NEXT TASK (agreed): standardized company format
- Build the company-template document render from the locked schema
  (header/logo, original + translated fields, findings, evidence).
  Faithful-layout rebuild is explicitly a later stretch, not this task.
- Open questions for operator: company display name for header, required
  template fields/order, page size/orientation, watermark on template y/n.

## Known limits (do not re-investigate)
- Regex misses manufacturer on P01H/JEAN + table layouts (SOLO food table):
  reserved for the future AI-extraction step, not more regex.
- Sandbox used by the assistant has no network and cannot run the server,
  npm, or pdf-lib: syntax + unit tests only; operator live-tests.
- Keep non-ASCII out of PowerShell-written content (it corrupts to ?).
  Node-written files are UTF-8 safe.
- server.js was once found reverted on disk (Oct 27 version); if endpoints
  404 after a pull/checkout, re-check the file before debugging further.

## Tonight: commit everything
- cd Production; git add -A; git commit -m "Oct 28: enrichment, watermark,
  translation + bilingual report"; git push (if a remote exists).
