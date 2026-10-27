# Visual Translator — Roadmap v2
Oct 27 - Nov 3 | Lightweight demo with translation

## New Constraints
- Lightweight: single deploy, no workers/queues
- Translation is MVP, not future

## Architecture Changes From Skeleton

Keep:
- SQLite file DB, JSON schema, MuPDF, Meta Model API

Change for lightweight:
- Single service: backend Node+TS serves frontend built React static
- Sync processing, 10MB / 20 page cap for demo
- One Dockerfile, one deploy: Render / Fly.io / HuggingFace
- Sample PDFs bundled in sample-pdfs/

Add for translation:
- Translate normalized fields + findings after validation
- Preserve original_value, translated_value, lang, evidence points to source
- Do NOT translate IDs, units, numbers, cert codes
- Same Meta Model API for translation
- UI language selector EN + PT + ES, side-by-side view

## Schedule

- Oct 27 (Tue) - Rescope: lock 10-field schema, init repo, verify Meta API
- Oct 28 (Wed) - Upload + PDF: validation, job status, MuPDF text + render
- Oct 29 (Thu) - Extract: AI to JSON, normalize, keep evidence
- Oct 30 (Fri) - Validate + Translate: checks, then translate
- Oct 31 (Sat) - Frontend: upload, results side-by-side, corrections
- Nov 1 (Sun) - Report: bilingual PDF, error handling, test 3-5 PDFs
- Nov 2 (Mon) - Deploy + Demo: Docker, live URL, README, video
- Nov 3 (Tue) - Submit: buffer, submit early

## Cuts To Stay Light
- No auth, no queue, no ERP export, no multi-doc compare
- 1 scanned PDF best-effort only
## Progress Log (updated Oct 27, evening)

### Done - Oct 27 rescope
- 10-field schema locked: `backend/schema.js` (`2.0.0-locked-2026-10-27`). Fields: productName*, manufacturer*, modelOrReference*, categoryOrIntendedUse, materials, dimensions, sizesAvailable, standardsAndCertifications, protectionLevelsOrPerformance, usageRestrictionsOrWarnings (* = required). Every field keeps value / originalValue / unit / evidence / translatable / translation slot.
- SQLite job store live: `backend/job-store-sqlite.js` on built-in `node:sqlite`, zero new deps. DB: `data/visual-translator.db`, table `jobs`, same all/get/create/update interface as root `JobStore`.
- Deterministic extractor mapped to the locked schema: `backend/extractor.js` (`deterministic-rules-v2-schema-locked`).
- Deterministic validation wired: `backend/validation.js` (required fields, unit allowlist, evidence/originalValue presence). Runs on every upload; findings stored per job.
- Server rewired: `POST /api/documents` persists to SQLite + JSON export, returns `jobId` + `record` + `findings` (legacy `candidateData` kept so current `script.js` still works). New `GET /api/jobs` and `GET /api/jobs/:id`.
- Verified end-to-end (201, 10 fields, job round-trip) with `sample-pdfs/synthetic-glove-sample.pdf`. Added `npm start`.
### Still open from Oct 27
- `git init` + first commit (repo init is yours to run).
- Verify Meta Model API key/access from backend (one test call); pick extract + translate model.
- Add 3-5 real datasheets to `sample-pdfs/` (each under 10MB / 20 pages).

### Next - Oct 28 (Upload + PDF)
- Enforce 20-page cap + return real `pageCount` per job (needs MuPDF or pdf-parse page count first).
- `GET /api/jobs/:id` status polling in the frontend (uploading / processing / completed / failed states).
- Start MuPDF evaluation: text + page render; keep `pdf-parse` until MuPDF wins.

### Then - Oct 29 (Extract, AI to JSON)
- Meta API adapter: prompt to strict 10-field JSON, normalize units, keep evidence quotes.
- Keep regex extractor as `fallback` engine value; record `extractionEngine` per job.

### Then - Oct 30 (Validate + Translate)
- Extend `validation.js` with ID consistency, duplicate/conflict, cross-section checks.
- Translate after validation via same Meta API; fill `translation: { lang, translatedValue }` only on `translatable` fields; never translate IDs, numbers, units, cert codes.

### Then - Oct 31 (Frontend)
- Language selector EN + PT + ES, side-by-side original/translation, evidence quotes, correction inputs (`userCorrected` kept separate from `originalValue`).

### Then - Nov 1/2/3 (Report, Deploy, Submit)
- Bilingual PDF report (specs + findings + evidence refs); source PDF stays separate.
- One Dockerfile (backend serves frontend static, SQLite file volume); deploy Render/Fly.io/HuggingFace; README + demo video; submit early Nov 3.
