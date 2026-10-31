Work project is in the Production folder. Read Production/SESSION_HANDOFF.md and continue with the standardized company format

Hello again. Nice to see you! :)

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
# OPERATOR: Results for npm run list-models script:
muse-wonder-1.0
sam-3.1
muse-spark-1.3-contributor
muse-voice-transcribe-1.0
muse-spark-1.3
muse-image-1.0
muse-spark-1.2-contributor
muse-spark-1.2
muse-spark-1.1
(9 models at https://api.meta.ai/v1, current default: muse-spark-1.3)

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

## Addendum Oct 29 - Goal 3b company template DONE (pending operator live-test)
- backend/company-template.js + GET /api/jobs/:id/company-sheet + frontend
  Company format section. Defaults: COMPANY_NAME env or "Meta", A4 portrait,
  watermark opt-in. Details in the 03_Roadmap_v2.md log. Operator live-test:
  restart the server, upload a PDF, click a company-sheet language button,
  open the downloaded PDF.

## Session Oct 29 (short) - company template + company JSON DONE, both pending live-test
- Did: backend/company-template.js (A4 company data sheet PDF) + frontend
  Company format section + GET /api/jobs/:id/company-sheet (Goal 3b); then
  backend/company-json.js (canonical ERP/AI handoff envelope) + frontend
  JSON link + GET /api/jobs/:id/company-json (Day 29 plan, kept simple).
- Verified offline only (sandbox still no-network, server never started here):
  run_sheet_test.js + run_company_json_test.js green on the real synthetic
  sample; sample outputs in data/tmp (3 PDFs + test-company.json) for the
  operator to open. node --check clean on all touched files.
- Fixed along the way: missing updateSheetLink append in script.js; stray BOM
  chars in PS-written files (check after every PS write).
- Model note: translation model is env-only (MODEL_API_MODEL, default
  muse-spark-1.3). SAM = set the exact id from npm run list-models + restart;
  if SAM is Segment Anything it is vision-only, not for text translation.
- Complexity ratings logged in 03_Roadmap_v2.md: ERP file import LOW, ERP live
  API MEDIUM, AI Visual Translation HIGH (stretch, attempt last).
- NOT committed (no git repo found here - "not a git repository"). Operator:
  git init/commit if needed, restart server, live-test both downloads, commit
  Oct 28-29 together.

## Tomorrow: suggested start
1. Restart server, upload a PDF, download company sheet + company JSON.
2. Confirm COMPANY_NAME header + open questions (field order, page size,
   watermark default-on?).
3. Then: ERP file-import mapping test (LOW) or deploy prep - your call.

## Session Oct 30 - rename to DataForge + overview rewrite

- Renamed app Visual Translator -> DataForge (scope is bigger than
  translation). Updated user-facing strings: index.html title/h1 +
  intro line, server status message, package.json name/description.
  Code comments updated (schema, server, company-json).
- Artifact id bumped: dataforge/company-document v1.1.0-2026-10-30
  (was visual-translator/company-document v1.0). Test assertion
  updated; checked-in Company-JSON.json sample updated to match.
- Rewrote 01_Project_Overview.md around the DataForge core
  (extraction -> Company JSON + Company PDF); translation + image
  manipulation documented as supporting; faithful-layout CUT;
  ERP integration OFF.
- New roadmap presented as v3 section in 03_Roadmap_v2.md.
- Deliberately kept: DB filename visual-translator.db (existing
  data continuity), API route paths (/api/jobs/...), dated history
  entries in 03 and this file, workspace folder name.
- Still pending operator live-test (server restart + downloads)
  and COMPANY_NAME / template open questions.
## Session Oct 30 (pm) - live-test feedback + DEXIS + polish phase

- Operator live-tested the company sheet + company JSON: workable
  but sloppy. REMINDER: polish the output artifacts before demo.
- Company name decided: DEXIS (replace "Meta" default). Operator
  will upload the DEXIS watermark logo later; misc/Meta.png stays
  until then. Code default swap (company-template.js + "Meta"
  test assertions) queued for the polish pass.
- ForLLM.md renamed to Production/AGENTS.md. Old workflow preamble
  marked irrelevant by operator; core ideas + pipeline map now live
  there. Operator estimate: ~90% of the map is built.
- Map gaps noted: DOCX/XLSX inputs, tables/images/OCR, AI
  extraction + AI validation failover, user-defined output mapping
  (standard schema for now), XLSX output, future ERP/PowerBI/API.
- Next: full-application polish. Operator asked for suggestions
  first - see assistant message Oct 30 pm. No polish code written yet.
## Session Oct 30 (evening) - DEXIS standard sheet v2 DONE (pending live-test)

- Built to operator brief: DEXIS logo upper-left, hero band with
  product image left + Manufacturer/Description/Norms/Sizes(if
  applicable)/Colors(if applicable)/Categorization right, Ordering
  block (EAN, min order, box/pack) only when found.
- Schema v2.2 + extractor v2.2 + template v2 + product-image.js
  (new). Defaults now DEXIS everywhere. pdf-lib Buffer-offset bug
  found + fixed (cleanBytes). Both offline suites green, samples
  regenerated. Details in 03_Roadmap_v2.md (Oct 30 pm entry).
- Operator live-test: restart server, upload a PDF (JEAN or SOLO
  show the new fields best), download company sheet, confirm hero
  band + Ordering block + product image. No COMPANY_NAME env
  needed anymore (DEXIS is the code default).
- Still open: DEXIS taxonomy upload (categorization placeholder
  until then), sheet look-and-feel polish, frontend brand pass.
## Session Oct 30 (night) - live-test verdict + taxonomy pivot

- Operator live-tested the DEXIS standard sheet v2 on the server:
  verdict DECENT. Sheet v2 accepted as the working standard.
- Taxonomy DROPPED for now (no PPE -> GLOVES -> ... upload coming).
  Replacement: RECOMMENDED USAGE - operator will provide a file
  matching product characteristics to a recommendation description;
  the sheet will build the recommendation from that file instead.
- Categorization field + "(taxonomy upload pending)" placeholder
  stay as-is until the recommended-usage file arrives; revisit the
  placeholder text when that work starts.
- Tomorrow: ingest the recommended-usage file (format TBD on
  arrival), render the recommendation on the sheet, then continue
  with the polish queue (frontend brand pass, feel, robustness).## Session Oct 31 (day) - AI Translation spike (parked) + Company Excel DONE

### AI Translation spike - built, tested, PARKED as not worth pursuing
- Operator approved a viewer-only experiment: separate AI Translation (beta)
  section using Meta vision models, complementary to field translation +
  company sheet. Spec frozen in 04_AI_Translation_Spike_Spec.md.
- Probes (operator machine, api.meta.ai): probe-vision HTTP 200
  (muse-spark-1.3 accepts image_url); probe-sam HTTP 404 on
  /chat/completions ("use /v1/responses"); probe-sam-responses HTTP 200
  with images_processed 1 but EMPTY text output. Conclusion: SAM transport
  works, prompt shape needs iteration; spike went Spark-only.
- Built: backend/page-render.js (pdftoppm, 200dpi p1), meta-api.js chatVision(),
  backend/ai-translation.js (vision prompt + DO_NOT_TRANSLATE validation;
  greedy-regex bug caught by self-test and fixed), backend/sam-segment.js
  (best-effort, never throws), 3 server routes (POST ai-translation, GET
  ai-translation?lang=, GET ai-page), frontend viewer section + hooks.
  Operator has pdftoppm 26.09.0 installed.
- Operator live verdict: fell back on muse (Spark-only, samStatus
  empty-fallback-spark-only), DECENT but not worth pursuing. PARKED.
  Do not invest more unless SAM regions start working (tune Responses prompt).

### Company Excel export - DONE (pending operator live-test)
- Asked for PDF-to-EXCEL in the standard company format for future ERP work.
  Matches AGENTS.md goal (XLSX for analysis / PowerBI / PySpark).
- backend/company-excel.js (new): genuine .xlsx, ZERO new dependencies
  (hand-rolled ZIP-store writer + inline-string worksheets; CRC32 checked
  against the standard vector). 4 sheets: Document | Product (16 fields +
  Translated column, follows ?lang=) | Findings | ERP row (flat header +
  data row from toErpRow, consistent with CSV/Company JSON).
- Route GET /api/jobs/:id/company-excel[?lang=xx] + frontend download link
  next to the company JSON link (follows sheet language buttons).
- Offline: run_excel_test.js green (EOCD/central-dir/CRC parse, all 9 parts,
  content asserts on DEXIS/EAN/translations/ERP keys); sheet + json suites
  still green; node --check clean everywhere. Sample:
  data/tmp/test-company.xlsx. Numbers/dates ship as text cells (CSV stays
  the machine-import format); exceljs swap later if ERP demands styled
  native output (same endpoint, no frontend change).

## Next (Oct 31 close / next session)
1. Restart server, upload a PDF, download company Excel (Source only + one
   language), open in Excel: 4 tabs, PT column, ERP row values incl. EAN.
2. Recommended-usage file still expected from operator (replaces taxonomy).
3. Commit everything: company-excel.js, run_excel_test.js, server.js,
   index.html, script.js, 04 spec, probes, sample xlsx, this handoff.
## Session Oct 31 (night) - Trust Report live + AI review + Step 2 demo theme DONE

### Trust Report - LIVE and operator-verified
- Fix: trust fetch calls were appended to script.js but the 3 upload-handler
  lines (unhide + loadTrust + loadModels) silently failed to apply earlier.
  Patched + verified; cache-buster script.js?v=trust2 in index.html.
- Operator live result on SOLO BLUE 999: Score 82% - 11 extracted,
  9 supported, 0 missing, 2 review. Matches deterministic design
  (unsourced Norms + orderInfo are the 2 review items).

### AI review (on-demand) - WORKING, first real verdict recorded
- Root cause of historic routing pain found: meta-api.js defaulted to
  https://api.llama.com/v1 while the operator key is for
  https://api.meta.ai/v1. Default switched to api.meta.ai; explicit
  MODEL_API_BASE still wins. 401 hint now reports base URL + key
  presence (length only) so the next auth failure is one-glance.
- Operator live verdict via muse-spark-1.3: AI score 58% - values without
  evidence and misread protection level lower trust; manufacturer noisy.
  Flags: MISSING_EVIDENCE standardsAndCertifications + orderInfo (error),
  EXTRACTION_ERROR protectionLevelsOrPerformance value 1994 is a year
  from the French decree date (error), EVIDENCE_MISMATCH + EXTRACTION_NOISE
  manufacturer capital info (warning), WEAK_EVIDENCE colors from name (info).
- Known extractor misfires queued for AI-extraction step, NOT more regex:
  manufacturer corporate-capital noise, protection 1994 year-as-value.

### Step 2 demo theme - DONE (pending operator eyes-on)
- Dark background, red upload button (form button only, others stay blue).
- Post-upload 3-column triage grid with dividing lines: LEFT candidate
  results + company format, MIDDLE Trust Report (amber heading), RIGHT
  watermark/stamping + translation. AI Translation (beta) full-width below.
- Files: index.html (triage wrapper + column classes), styles.css
  (theme + grid + mobile single-column collapse under 900px).
  Structure checked (div/section balanced, braces balanced),
  run_trust_test.js + run_sheet_test.js green, node --check clean.
- Operator eyes-on: restart server, hard-refresh, upload a PDF, confirm
  3 columns + dividers on desktop and stacked cards on narrow window.

### Env reminder (server terminal, in order)
- $env:MODEL_API_KEY = "<key>"
- $env:MODEL_API_BASE = "https://api.meta.ai/v1"
- npm run verify:meta, npm run list-models, then node backend/server.js.
- Key + base must be set in the SAME terminal BEFORE starting the server.

## Next (Nov 1)
1. Eyes-on confirm: demo theme columns/dividers + Trust middle + right rail.
2. Dockerfile + Render free deploy from GitHub (Fly.io is pay-only, out).
3. README/demo notes refresh under DataForge name + demo video.
4. Buffer Nov 2-3: fixes, early submit Nov 3.
