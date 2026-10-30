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
## Progress Log (updated Oct 28, morning - operator update)

### Done by operator
- First commit made (repo initialized in `Production/`).
- 5 real datasheets added to `sample-pdfs/`: activarmr glove (PT), DURACOIL steel sheet, P01H (2.4MB), JEAN STRETCH textile (FR/EN), SOLO BLUE glove. Synthetic fixture kept.
- `MODEL_API_KEY` configured as a local environment variable (present, non-empty; never stored in repo).

### Datasheet eval (all 6 PDFs parse; deterministic extractor only)
- activarmr: product/manufacturer/model/protection found, 0 findings.
- DURACOIL: 8/10 fields found incl. materials, sizes, standards, warnings; industry mentions present in text (Automotive repairs and maintenance) but NOT captured - no schema field for it.
- P01H + JEAN: manufacturer missing (needs AI step); standards evidence incomplete.
- SOLO BLUE: 8/10 fields, same standards-evidence gap.
- Conclusion: regex covers identity well; dimensions/category/industries need the AI step.

### Model integration scaffold (ready for operator to verify)
- New `backend/meta-api.js`: reads `MODEL_API_KEY` (+ optional `MODEL_API_BASE`, defaults to `https://api.llama.com/v1`; model override via `MODEL_API_MODEL`). `verifyConnection()` = cheap GET /models, spends no tokens. `chatJson()` ready for Oct 29/30 extract + translate prompts.
- New `npm run verify:meta` + `backend/verify-meta.js`. Sandbox run fails at network (`fetch failed`, key WAS picked up) - operator: run it in your own shell where the key + network exist. If your endpoint is not api.llama.com, set `MODEL_API_BASE`.
OPERATOR: SUCCESS. MESSAGE: $env:MODEL_API_BASE = "https://api.meta.ai/v1"
PS C:PATH/TO/FILE> npm run verify:meta

> production@1.0.0 verify:meta
> node backend/verify-meta.js

Model API reachable at https://api.meta.ai/v1 (9 models visible).

### Goals redefined (see `01_Project_Overview.md`)
- Goal 1 extraction/enrichment (website descriptions + ERP file imports), Goal 2 company watermark, Goal 3 faithful-vs-standardized translated reproduction (standardized first, faithful = stretch).
- Scope impact: file-based ERP/website export is BACK in scope (live ERP integration stays out); watermark needs logo PNG from operator + engine decision; reproduction mode (a/b) decided at report step.
- Proposed schema amendment (pending operator confirm): add optional translatable `industriesOrApplications` field -> schema v2.1. Say go and it gets implemented with the AI step.

## Progress Log (updated Oct 28 - Goal 1 enrichment built, Goal 2 scoped)

### Goal 1 done (deterministic part)
- Schema v2.1.0-2026-10-28: adds optional translatable industriesOrApplications (11 fields). Old v2.0 records migrate and validate cleanly.
- Extractor deterministic-rules-v2.1: INDUSTRIES / TRADES block grabber plus labeled and keyword fallbacks. DURACOIL now yields Aerospace Airports and Ports; Automotive Mechanical.
- New backend/enrich.js: website description template, flat ERP row (38 cols), ERP CSV serializer, AI-extract prompt builder for the Meta API step.
- Server: POST /api/documents returns enriched; GET /api/jobs/:id recomputes enriched on read; new GET /api/jobs/:id/export?format=json|csv for website and ERP file downloads.
- Eval over all 6 sample PDFs: 2 docs at 9/11, synthetic at 9/11, 3 thin docs at 4/11 (manufacturer missing, needs AI step). CSV has 38 columns throughout.
- Leftover regex limits (table layouts like SOLO food-industry table, P01H/JEAN manufacturer) are flagged for the AI extract step, not more regex.

### Goal 2 scoped
- See Production/misc/WATERMARK_SCOPE.md. watermark.png is 2400x2400 RGBA with opaque black background, needs a transparent logo-only export.
- Recommended engine: pdf-lib (pure JS, single deploy). Prerequisite: persist source uploads. API sketched (POST + GET watermark per job).

## Progress Log (updated Oct 28 - Goal 2 frontend integration)

### Watermark end-to-end (upload -> corner pick -> download)
- backend/watermark.js: stampPdf supports upper-left, upper-right, lower-left,
  lower-right, center (36pt margin, 18% width corners / 40% center, 15% opacity).
  CLI takes an optional position arg. pdf-lib resolved from Production, repo root, or global.
- backend/job-store-sqlite.js: jobs table gains filePath, watermarkFile, watermarkOptions
  (ALTER TABLE migration, old DBs keep working).
- backend/server.js: serves frontend static (index is the entry point at /),
  persists uploads to data/uploads/<jobId>.pdf, new POST /api/jobs/:id/watermark
  {position, opacity} and GET /api/jobs/:id/watermark download. Old jobs uploaded
  before persistence need a re-upload before watermarking.
- index.html + script.js + styles.css: watermark section appears after a successful
  upload, 4-corner radio grid (lower-right default), Apply button, status line,
  download link. API calls are relative paths now.
- Note Oct 28: operator sandbox runs the live server; Goal 1 export endpoints were
  re-landed in server.js after the Oct 27 file was found reverted on disk.

## Progress Log (updated Oct 28 - upper-right default + footer position)

### Watermark v2
- Default position is now upper-right (watermark.js DEFAULTS, server fallback,
  frontend preselected radio, script.js fallback).
- New 5th position footer: full-width bottom band, max 12% of page height,
  aspect preserved, centered (on A4 with Meta.png: 152x101pt at 36pt margin).
  Band height tunable via footerBand option.
- Frontend: footer radio added as a full-width row under the 2x2 corner grid.
- Previews: misc/preview-footer.png. Operator live-tests on real PDFs.

## Progress Log (updated Oct 28 - Goal 3 simple translation)

### Translate what is possible (no OCR, no AI extraction yet)
- New backend/translate.js: TARGET_LANGS en/pt/es, prompt builder with
  never-translate rules (IDs, codes, numbers, units, cert codes stay exact),
  applyTranslations fills only translatable field slots, translateRecord
  orchestrates via meta-api chatJson (temperature 0, one call per request).
- Server: POST /api/jobs/:id/translate {targetLang} validates lang, migrates
  the record, translates fields + website description, persists slots and
  translatedDescriptions on the record, returns applied list + model + note.
  Missing key or API errors surface as 500 with the message.
- Frontend: Translation section after upload, PT/ES/EN buttons, side-by-side
  original arrow translated list plus fluent translated description. Saved
  translations render instantly without spending tokens again.
- Verified offline with stubbed API: slots fill, non-translatable stay null,
  bad langs rejected, description cached per lang.
- Operator live-runs with MODEL_API_KEY (+ MODEL_API_BASE) set; restart server
  to pick up the new endpoint.

## Progress Log (updated Oct 28 - model ID fix)

### Translation 404 model_not_found
- Cause: default model Llama-4-Maverick-17B-128E-Instruct-FP8 does not exist
  on https://api.meta.ai/v1 (endpoint and key are fine, 9 models visible).
- Fix: new npm run list-models (backend/list-models.js) prints usable IDs;
  set MODEL_API_MODEL to a listed ID and restart the server. chatJson now
  appends this hint to model_not_found errors.
- Blank translation fields were the symptom of failed calls (nothing was
  stored); they fill on the next successful click per language.

## Progress Log (updated Oct 28 - translated file + encoding fix)

### Encoding bug (fixed)
- PowerShell had written the UI arrow and em dash as ? and U+FFFD, which is
  what showed in the PT translation list. script.js now carries proper UTF-8
  escapes. Lesson: keep non-ASCII out of PowerShell-written content.

### Translated file (Goal 3 output)
- New backend/report.js: bilingual PDF (header, all valued fields with
  original + translation, findings, evidence quotes, review disclaimer).
  Word-wrap + WinAnsi sanitizer unit-tested; pdf-lib lazy-required.
- Server: GET /api/jobs/:id/report?lang=pt serves the bilingual PDF
  (400 with a translate-first hint when that lang is missing).
- Translated CSV: GET /api/jobs/:id/export?format=csv&lang=pt swaps in the
  translated values (originals kept in __original columns).
- Frontend: translation result gains report + CSV download links per language.
- Default model is now muse-spark-1.3 (operator-tested on api.meta.ai).

## Progress Log (updated Oct 28 - invisible language buttons)

### Bug: white text on white buttons
- Symptom: the 3 language buttons rendered as empty bars (labels were in
  the HTML all along, even plain-ASCII English).
- Cause: the global button rule sets color white on blue; the .lang-row
  override changed the background to white without resetting the text
  color. Classic specificity-per-property trap.
- Fix: .lang-row button now sets color to the dark text variable, plus a
  hover state. No server restart needed for CSS, just hard-refresh.
﻿
## Progress Log (updated Oct 29 - standardized company format, Goal 3b)

### Company template render (template first, faithful layout stays a stretch)
- New backend/company-template.js: buildCompanySheet(record, findings, options)
  renders the standardized company data sheet as A4 portrait PDF (pdf-lib):
  header with company name + Meta.png logo, document control box (source file,
  schema, engine, languages, date, job id), product identity + specification
  rows (label | source value + unit | translated value or "(not translated)"),
  website description (source + translated), quality findings, evidence quotes,
  footer with page numbers + review disclaimer.
- Locked defaults with env override: company name from COMPANY_NAME (default
  "Meta"); A4 portrait; watermark opt-in per request (centered logo, 0.08).
  Field order follows the locked schema v2.1 (identity first, then specs).
- Server: GET /api/jobs/:id/company-sheet?lang=pt|es|en[&watermark=true].
  lang is optional (source-only sheet when omitted); missing translations show
  a placeholder instead of a 400 so the sheet is always downloadable.
  Old GET /api/jobs/:id/report stays untouched.
- Frontend: Company format section after translation (source/PT/ES/EN buttons
  + watermark checkbox + download link); ASCII-only markup (PowerShell-safe).
  Stray BOM chars from PS-written files stripped (index/styles/server/template).
- Verified offline with node (pdf-lib present): Production/run_sheet_test.js
  builds sheets from the real synthetic sample via extractor + validation;
  asserts PDF magic, translated slots, watermark embed, env override, and
  empty-record safety. Streams inflated to confirm all section strings render.
  Sample outputs in Production/data/tmp/test-company-sheet-*.pdf for the
  operator to open. Live server test left to the operator (sandbox no-network).
- Open questions carried over for the operator: confirm company display name
  (or set COMPANY_NAME and restart), any field-order changes, page size /
  orientation, whether the watermark should default on. Faithful-layout
  rebuild (Goal 3a) not started.
﻿
## Day 29 (Oct 29) - plan: company JSON handoff. KEEP SIMPLE.
- Build: canonical company JSON artifact, one envelope per job (document
  control + all 11 locked-schema fields + translations + website descriptions
  + findings + ERP flat row + never-translate policy). New
  backend/company-json.js (repackages stored job data, no AI call, offline),
  GET /api/jobs/:id/company-json file download, frontend link next to the
  company sheet. Reuses schema / enrich / translate / company-template.
- Model note: translation model stays env-configurable (MODEL_API_MODEL,
  default muse-spark-1.3). Operator choice SAM: run npm run list-models,
  set MODEL_API_MODEL to the exact SAM model id, restart the server. No code
  change needed. Caveat: if SAM means Segment Anything (vision segmentation),
  it is NOT a text-translation model - keep a chat model for translation;
  SAM-style segmentation fits the later visual-region-detection step instead.
- Complexity ratings for what this JSON feeds next:
  - ERP file import (JSON/CSV drop into the target system): LOW. The artifact
    already carries the flat ERP row; remaining work is per-system column
    mapping plus one supervised import test.
  - ERP live API sync: MEDIUM. Needs target API docs, auth, idempotency and
    error handling - outside demo scope, do file import first.
  - AI Visual Translation (layout-aware PDF rebuild, Goal 3a stretch): HIGH.
    Needs page rendering, text-region detection (where SAM-style segmentation
    actually helps), per-region vision-model translation, and reflow without
    breaking the layout. Hardest part of the project - attempt last.
- Done criteria: endpoint returns the file, frontend downloads it, offline
  node test passes, sample in data/tmp. Then commit.
