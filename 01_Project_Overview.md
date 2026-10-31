# DataForge - Project Overview (updated Oct 30, 2026)

DataForge turns supplier product datasheets (PDF) into standardized
company data. Extraction is the core; translation and image
manipulation are supporting features.

Former name: Visual Translator (renamed Oct 30 - the scope is bigger
than translation alone).

## The core idea

Data extraction -> standardized outputs.

1. Extract structured facts from a supplier PDF: product identity,
   materials, dimensions, sizes, standards, performance levels,
   warnings, industries/applications.
2. Validate them with deterministic checks (severity + evidence).
3. Emit standardized artifacts:
   - Company JSON (GET /api/jobs/:id/company-json): the canonical
     handoff envelope - document control, all 16 schema fields,
     translations, website descriptions, findings, flat ERP row,
     never-translate policy.
   - Company PDF sheet (GET /api/jobs/:id/company-sheet): the A4
     company data sheet - header/logo, identity + spec rows
     (source value | translated value), description, findings,
     evidence quotes.

## Supporting features (not the core)

- Translation (EN/PT/ES via Meta Model API): fills translation slots
  on translatable fields only. IDs, numbers, units and cert codes are
  never translated (see DO_NOT_TRANSLATE in backend/schema.js).
  Translation modifies the standard artifacts; it is not a separate
  product. The bilingual report endpoint is kept as a convenience
  output.
- Image manipulation: company watermark stamping on source PDFs
  (6 positions, default upper-right, opacity 0.15, transparent logo)
  plus opt-in watermark on the company sheet. Future items in this
  bucket: other stamps, redaction, flattening.

## Explicitly out of scope

- Faithful-layout PDF rebuild (old Goal 3a): CUT. The company
  template replaces it. Rated HIGH complexity; revisit last, if ever.
- ERP integration: OFF (no access). JSON/CSV file download is the
  handoff; per-system column mapping happens at import time.
- ERP live API sync: MEDIUM effort, outside demo scope.

## Pipeline

01 Frontend (vanilla JS, served static on :7500): upload PDF, review
   results, correct values, pick language, download artifacts.
   Open http://localhost:7500/ (never file://).
02 Backend API (Node, Production/backend): validates upload, creates
   a tracked analysis job, serves all endpoints.
03 PDF Processing: pdf-parse for text; pdf-lib for stamping and
   document generation.
04 AI Analysis: Meta Model API (default model muse-spark-1.3;
   override with MODEL_API_MODEL). Used for translation and
   description fluency.
05 Extraction and Normalization: deterministic regex extractor
   (deterministic-rules-v2.2) maps facts into the locked schema v2.2
   (16 fields). AI extraction is reserved for table layouts and
   missed manufacturers (future step, not more regex).
06 Data Quality Validation: deterministic checks; findings stored
   per job with severity + evidence quotes.
07 Storage: SQLite (Production/data/visual-translator.db - filename
   kept for continuity after the rename) + JSON exports.
08 Outputs: Company JSON, Company PDF sheet, bilingual report PDF,
   translated CSV, watermarked source PDF.

## Source layout

- Production/backend: server.js + feature modules (schema,
  extractor, validation, enrich, translate, watermark, report,
  company-template, company-json, job-store-sqlite).
- Production/index.html + script.js + styles.css: frontend entry.
- Production/sample-pdfs: 6 test PDFs (5 real + 1 synthetic).
- Production/data: uploads / watermarked / tmp (gitignored outputs).
- Companion docs: 02_System_Architecture.md (original proposal),
  03_Roadmap_v2.md (progress log + current roadmap),
  SESSION_HANDOFF.md (session resume notes),
  misc/WATERMARK_SCOPE.md (watermark decisions).

## Run

- $env:MODEL_API_KEY = "<key>" (never in repo)
- $env:MODEL_API_BASE = "https://api.meta.ai/v1"
- $env:MODEL_API_MODEL = "muse-spark-1.3" (optional, it is the default)
- cd Production; npm install; node backend/server.js
- Diagnose: npm run list-models / npm run verify:meta.
- Sandbox note: the assistant sandbox has no network and cannot run
  the server, npm, or pdf-lib - syntax + unit tests only here;
  the operator live-tests on his machine.