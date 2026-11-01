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

## Session Nov 1 (pm) - AI next to standard + target-only files + recommendation + button polish

### AI translation moved next to regular translation - DONE
- Removed the full-width #ai-translation-beta tfull section; nested it as a
  div inside #translation (right column). Same element IDs, so the script.js
  selectors and backend routes work untouched. Buster script.js?v=aitarget1.

### Report bilingual -> target-language only - DONE
- buildBilingualReport now renders translated values only (source fallback
  when a translation is missing). Heading is Product Report (<Lang>).
  Export name kept for compat + buildTargetLanguageReport alias added.
  Evidence quotes stay source (they are proof, not field values).
  Translated CSV was already target-only via recordWithTranslations.
  Frontend link now reads Download PDF report (target language).

### AI translated file downloads - DONE (operator-confirmed links appear)
- JSON link (existing cached GET /api/jobs/:id/ai-translation?lang=xx) +
  TXT download (blocks translatedText joined, target-only, browser Blob).
- Then PDF link added: new backend/ai-report.js buildAiTranslationPdf
  (per-block translated text + confidence + warnings, target-only) +
  GET /api/jobs/:id/ai-translation-pdf?lang=xx (attachment
  <id>-ai-p1-<lang>.pdf, 404 with POST-first hint when absent).
  Buster v=aitarget3. AI PDF verified offline (%PDF header).

### Recommended usage from misc/Recommend.txt - DONE (two passes)
- Pass 1: arrow chain Product -> Type -> Area -> Norms.
- Pass 2 (file redone by operator): sentence This [Product] is made by
  [Manufacturer]. It is a/an [Type], recommended for [Area] and/or [Area].
  It is certified to [Norms]. Mapping: productName (fallback model) /
  manufacturer / categoryOrIntendedUse (fallback protectionLevels) /
  industriesOrApplications (split on , ; /) / standardsAndCertifications.
  Missing parts skip their clause; fully empty omits the section;
  sheet language translations used when present.
- Grammar cleanups applied to the draft (double verb, its/It is, a/an)
  and flagged to the operator; revert to verbatim on request.
- Renders as Recommended usage on the company sheet (after Document
  control) + recommendation field in Company JSON (shared helper,
  exported from company-template.js). Taxonomy placeholder untouched;
  Excel Product tab not yet extended.

### Company-format button/divider misalignment - DONE
- Cause: 4 language buttons in the narrow left column with flex no-wrap
  overflowed across the middle-column divider. Fix: .lang-row wraps,
  buttons share the row evenly (ellipsis on overflow), company-format
  buttons form a 2x2 grid. styles.css?v=aitarget3 buster added.

### Verified
- node --check clean (ai-report, server, script, template, json).
- All suites green from Production/: sheet, trust, company-json, excel.
- Operator live-confirmed: AI download links appear.

### Next (Part 2): polish + deploy prep
1. Full polish pass (DEXIS brand/feel, robustness, leftover eyes-on items).
2. Dockerfile + Render free deploy from GitHub.
3. README/demo notes refresh under DataForge name + demo video.
4. Buffer Nov 2-3, early submit Nov 3.

## Session Nov 1 (late) - AI extraction integrated as opt-in enhancement DONE

### What was asked
- Integrate AI into file analysis, as an option or an integral part.

### Decision: opt-in Enhance with AI button (deterministic stays default)
- Deterministic regex record still renders first (offline-safe, zero token
  cost, demo-safe). AI runs ONLY on click, fills missing fields and may
  correct the known misfire set: manufacturer noise, protection year-as-value,
  categorization (no deterministic finder). Every AI value needs a verbatim
  evidence quote from the source text or it is dropped on merge.
- New backend/ai-extract.js: buildAiExtractPrompt (targets = missing keys +
  correctable with current values, source text capped at 8000 chars, STRICT
  JSON, temp 0) + normalizeAiExtract (target allow-list, length caps) +
  evidenceInSource (quote must appear in source) + mergeAiExtract (fill empty
  slots, correct CORRECTABLE only, tag engine +ai-enhance-v1, stamp aiExtract
  {model, applied, skipped, at}) + runAiExtract orchestrator.
- Server: POST /api/jobs/:id/ai-extract { model? } re-extracts text from the
  stored upload, runs the model via chatJson, persists the merged record,
  recomputes findings + trust + enrichment, returns record + trust + ai.
  Needs MODEL_API_KEY like the other AI routes; missing key surfaces as 500.
- Frontend: Enhance with AI button + status line in Candidate results
  (left column). On success it refreshes product/standards/measurements,
  re-renders Trust, and lists applied fields with fill vs correction kinds.
  Buster script.js?v=aiextract1.
- New run_ai_extract_test.js (stubbed model, real synthetic sample): prompt
  shape, target allow-list, evidenced fill, unevidenced drop, manufacturer
  correction, route + frontend wiring asserts. Green.
- Verified: node --check clean (ai-extract, server, script, test); all suites
  green from Production/: ai-extract, trust (86), sheet, company-json, excel.
- Demo note: synthetic sample is missing exactly description, materials,
  colors, industriesOrApplications, categorization, ean, orderInfo - the
  ideal before/after for Enhance with AI.

### Next (agreed order)
1. Operator live-test: restart server, upload a PDF, click Enhance with AI,
   confirm applied fields + trust re-render, then run AI review as before.
2. Final polish + deployment (Dockerfile + Render free deploy, README/demo
   notes refresh, demo video). Buffer Nov 2-3, early submit Nov 3.

## Session Nov 1 (late 2) - frontend polish part 1: merged Results+Trust layout DONE

### What was asked
- Frontend too cluttered. Combine Trust report with candidate results (duplicate
  info made no sense). Trust occupies the bulk, extras stretch below as a band,
  translation stretches vertically on the right.

### What changed
- index.html: single merged section #trust.tmain titled Results and Trust
  (score line, extraction summary, ONE field list with evidence status,
  warnings, Enhance with AI, AI review controls). Removed the separate
  Candidate results section (product/standards/measurements lists were strict
  subsets of the trust list). Translation moved to a right rail including the
  AI beta block. Watermark + company format sit in a full-width .band below
  the trust panel. Translation lang buttons now ASCII Portugues/Espanol,
  matching the beta block and dodging the old mojibake bytes.
- styles.css: 3-column grid - trust spans cols 1-2, translation rail col 3
  rows 1-2 with left divider, band row 2 cols 1-2 with two cards + divider.
  Band auto-hides pre-upload via :has. Mobile stacks trust, rail, band.
  Deleted the obsolete #analysis-results/#watermark/#translation/
  #company-format spacing rules and old tcol/tleft/tmid/tright placement.
- script.js: showCandidateResults is summary-only (trust list carries the
  fields), renderAiExtractedRecord notes the engine (trust re-render carries
  the values), analysisResults const now points at #trust. No route or
  backend changes. Busters: index + css + script v=frontpolish1.
- Verified: all suites green (trust 86, sheet, company-json, excel,
  ai-extract); DOM/script/css wiring check green (all IDs, fns, classes,
  section balance, no stale selectors).

### Operator eyes-on (needs server + hard refresh)
1. Upload a PDF: trust bulk left, translation rail right, band below.
2. Narrow window: stacked trust, translation, watermark, company.
3. Enhance with AI + AI review still work from inside the merged panel.

### Next
- Awaiting further polish instructions. Then deploy prep (Dockerfile +
  Render), README/demo refresh, video. Buffer Nov 2-3, early submit Nov 3.

## Session Nov 1 (late 3) - review applies fixes + translations removed DONE

### What was asked
- AI review should apply changes (enhance the file output), not just review.
- AI translation cannot keep the original: remove it entirely, plus standard
  translation (company format already translates). Trust report stays as the
  enhancer of the file result.

### Review now fixes what it flags
- backend/ai-review.js: prompt output gains corrections[] (key, value, unit,
  verbatim evidence, reason, max 10, known fields only). normalizeAiResult
  parses them; new mergeAiCorrections applies evidenced corrections to ANY
  field, clears the stale translation slot on change, tags the engine
  +ai-review-fix-v1. runAiReview merges only when the route passes sourceText.
- server.js ai-review route: re-extracts source text from the stored upload,
  merges corrections, persists record.aiReview {appliedCorrections,
  skippedCorrections}, recomputes findings + trust + enrichment, returns the
  updated trust/record/findings. Frontend status reports Fixed N fields (keys)
  or No corrections applied.
- New run_ai_review_test.js green (normalize filtering, merge guards
  no-evidence/same-value, end-to-end with/without sourceText, route + UI
  asserts).

### Translations removed as sections, kept as company engine
- Frontend: #translation section + #ai-translation-beta gone from index.html;
  all standard + AI translation handlers, consts, and listeners cut from
  script.js (~5.6k chars). Layout: Results and Trust full-width bulk, extras
  band (watermark + company) below. Dead CSS removed.
- Backend: routes POST /translate, GET /report, POST+GET /ai-translation,
  GET /ai-translation-pdf, GET /ai-page removed. Deleted modules:
  ai-translation.js, ai-report.js, page-render.js, sam-segment.js, report.js.
- report.js shared helpers (sanitize + wrapText) live on as backend/pdf-text.js
  for company-template.js; sheet/JSON/Excel outputs byte-identical.
- Company sheet + company Excel now translate on demand: when ?lang= is asked
  and slots are missing, the route runs translateRecord first (best-effort,
  placeholders on failure) via new translate.js recordNeedsTranslation.
  translate.js stays as an internal engine, not a UI section.
- Verified: all 6 suites green (trust 86, sheet, company-json, excel,
  ai-extract, ai-review). No dead refs in html/js/css/server.

### Operator live-test (restart + hard refresh, busters cuttrans1)
1. Upload a PDF: trust bulk full-width, band below, no translation rail.
2. Run AI review: status shows score + fixed fields; trust list updates.
3. Company sheet PT button: first click translates on demand (slower),
   second click instant (cached slots).

### Next
- Awaiting further polish instructions. Then deploy prep (Dockerfile +
  Render), README/demo refresh, video. Buffer Nov 2-3, early submit Nov 3.

## Session Nov 1 (late 4) - Recommend.txt template + JSON out + trust UI redo DONE

### Recommendation file (misc/Recommend.txt, operator-authored)
- buildRecommendation now follows the file template exactly: This [Product]
  is made by [Maker]. It is a [Type] [noun], recommended to be used for [Area]
  and/or [Area]. It is certified to the following [Norms]. Missing parts skip
  their clause. New guessProductNoun detects the product-type noun (glove,
  helmet, mask...) from name/category/description for the [Type] [noun] pair.
- Verified live in test PDFs: This Test Glove is made by Test Maker. It is
  a glove. (cert sentence correctly omitted when norms missing).
- Fixed along the way: the template rewrite had swallowed the labelOf helper
  (sheet suite caught it instantly); restored, sheet suite green. New text
  shifts sample sheet bytes slightly (3474/3762/28091/2926), content asserts
  pass.

### Company outputs: Excel + PDF only
- Removed the company JSON download link from the Company format section
  (index.html + script.js refs, zero left). Backend GET /company-json and
  company-json.js stay (ERP/AI handoff later, suite still guards them).

### Trust panel redesign (stats + donut + clean list)
- renderTrust rebuilt: header with SVG donut (green ok / amber review / red
  missing segments, score in the center) + stat grid (fields total,
  extracted, ok, need review, missing). Field list grouped ok, then review,
  then missing; each row is a colored dot + label + value (page) or missing.
  Zero bracket prefixes. AI review findings use the same dot style.
- trust-summary is now a div (was p) to hold the header; new CSS for
  donut/stats/rows. Busters trustui1.
- Verified headless with DOM stubs: 4 SVG circles, stats present, rows
  grouped, no [ anywhere, values + pages + missing labels correct.
- All 6 suites green (trust 86, sheet, company-json, excel, ai-extract,
  ai-review).

### Operator eyes-on (restart + hard refresh)
1. Upload: donut + stats on top, clean grouped list, no brackets.
2. Company format: sheet PDF + Excel links only, no JSON.
3. Company sheet Recommended usage follows the new sentence shape.

### Next
- Awaiting further polish instructions. Then deploy prep (Dockerfile +
  Render), README/demo refresh, video. Buffer Nov 2-3, early submit Nov 3.
﻿
## Session Nov 1 (late 5) - ERP import Excel from XLXS_Template DONE

### What was asked
- New file misc/XLXS_Template.xls is the ERP import template. Use it as the
  basis for the xlsx download button, filled with extraction data. Original
  file must stay unchanged.

### Template decoded (legacy .xls, BIFF5, single sheet exp32_32_3042026)
- 84 columns, row 0 headers, row 1 example placeholders. Decoded with a
  zero-dep Node OLE/BIFF reader (Book stream, LABEL 0x0204 cells).
- Headers: inactivar, bloq_entrada, bloq_saida, servicos, usagrelhas, site,
  pai, stock, referencia, designacao, ref_site, desig_site, cor, tamanho,
  ref_fornecedor, ref2_fornecedor, ean, ean2_1, qnt_ean2_emb_1,
  qnt_ean2_qtt_1, ean2_2, qnt_ean2_emb_2, qnt_ean2_qtt_2, tipo, linha, modelo,
  marca, classe, tipo_at, unidade, familia, no_fornecedor, estab_fornecedor,
  fornecedor_habitual, preco_tabela, desc_tp1, desc_tp2, custo_ponderado,
  ultimo_custo, preco_import, moeda, descricao_documentos, descricao_tecnica,
  desc_fornecedor, cod_antigo, observ, preco_vd1..vd5, qtvendas_2anos,
  stock_minimo, stock_maximo, qtd_cx, qtd_lote, tx_iva, cod_snc, conta_inv,
  conta_cev, mes_tab, ano_tab, obs, usalote, dias_aviso, art_pautal,
  site_link, cardex, pentrega, imagem, volume, peso_liquido, peso_bruto,
  anexos, imagens_secundarias, videos, cor_es, desig_site_es, nao_ver_site,
  recomendado, site_modelo, site_subfamilia, site_familia, categoria.

### New export (backend/company-excel.js rewritten, zero new deps)
- Single-sheet .xlsx with the exact 84 headers + ONE filled data row.
  Sheet name kept (exp32_32_3042026) so it stays a drop-in replacement.
- Mapping: referencia=model||name, designacao=name (+model), modelo/
  ref_fornecedor=model, marca=manufacturer, cor=colors, tamanho=sizes,
  ean=ean, categoria=categorization, descricao_tecnica=composed technical
  text, desc_fornecedor=description, observ=restrictions+orderInfo,
  obs=recommendation, mes/ano_tab=current month/year. List-bound columns
  (tipo, linha, classe, ...), prices, control flags stay empty for the ERP
  owner. ref_site/desig_site stay empty per the template LEAVE EMPTY rule.
- lang=es fills desig_site_es/cor_es from Spanish slots; otherwise empty.
- Placeholder row (REFERENCIAEXEMPLO, VER BIBLIA, ...) is NOT copied: the
  download is import-ready. Template file untouched (still 25600 bytes).
- Accented header stock_maximo kept via unicode escape (source stays ASCII).

### Wiring
- Same route GET /api/jobs/:id/company-excel, download renamed to
  <job>-erp-import[-lang].xlsx. Frontend link now reads
  Download ERP import Excel (.xlsx). No other route/frontend changes.

### Verified
- New run_excel_test.js green (headers, mapping, es slots, no placeholders,
  template untouched, missing-record throws). All 6 suites green.

### Operator live-test (restart + hard refresh)
1. Upload a PDF, click Download ERP import Excel (.xlsx), open in Excel.
2. Data row carries the extracted values; empty cells need ERP completion.

### Next
- Awaiting further polish instructions. Then deploy prep (Dockerfile +
  Render), README/demo refresh, video. Buffer Nov 2-3, early submit Nov 3.
﻿
## Session Nov 1 (late 6) - single AI action: Enhance only DONE

### What was asked
- AI Review is not needed; AI is there to enhance. Keep the models
  dropdown, move it left of Enhance with AI, remove Run AI review.

### Change (frontend only, backend untouched)
- index.html: trust panel now has one lang-row: model select + Enhance
  with AI side by side, status line below. ai-review-run button,
  ai-review-status line and ai-review-list gone. Busters singleai1.
- script.js: runAiReviewNow + review consts/listener removed. loadModels
  messages now report into the enhance status line. Enhance already sent
  the chosen model (aiModelSelect.value), so no logic change needed.
- styles.css: dead #ai-review-list / .review-row selectors removed.
- Backend kept as-is: POST /ai-review route + ai-review.js + suite stay
  (API available, just no button). run_ai_review_test.js frontend assert
  updated to the new reality (no review button/handler, picker stays,
  enhance stays).

### Verified
- Zero ai-review refs left in html/js/css. node --check clean.
- All 6 suites green.

### Operator live-test (restart + hard refresh)
1. Upload a PDF: model dropdown sits left of Enhance with AI.
2. Enhance: donut + trust list update, status names the model used.

### Next
- Awaiting further polish instructions. Then deploy prep (Dockerfile +
  Render), README/demo refresh, video. Buffer Nov 2-3, early submit Nov 3.
﻿
## Session Nov 1 (late 7) - Stamp rename + Footer.jpg band DONE

### What was asked
- Rename Watermark to Stamp (corners stamp the logo as before), add the
  footer band covering the lower section using new misc/Footer.jpg.

### Change
- backend/watermark.js: JPG support via magic-byte imageKind (embedJpg vs
  embedPng). Footer layout is now full-bleed: full page width,
  bottom-anchored, art aspect kept (old 12% centered logo-footer gone).
  DEFAULTS gains footerFile (misc/Footer.jpg). Bytes are copied to a fresh
  Uint8Array before embedding: pdf-lib reads imageData.buffer directly and
  misreads pooled Node Buffers (nondeterministic SOI not found in JPEG).
- server.js stamp route: footer uses Footer.jpg unless logoFile override;
  footer opacity defaults to 1 (a designed band, not a ghost), corners stay
  0.15. Download renamed <job>-stamped.pdf. User strings say stamp.
  Route paths (/watermark) and internal ids/keys unchanged on purpose.
- Frontend: Stamp heading, Apply stamp button, Download stamped PDF link,
  footer option kept as Footer (full-width band). Sheet checkbox says
  stamp logo. Busters stamp1.
- New run_stamp_test.js (7th suite): art dims, full-bleed math, corner math,
  real PDF stamping PNG+JPG via pdf-lib, text preserved byte-identical
  (101 chars), server + frontend asserts.

### Verified
- All 7 suites green. data/tmp/test-stamp-footer.pdf written for eyes-on.

### Operator live-test (restart + hard refresh)
1. Upload a PDF, Stamp section: pick a corner, Apply stamp, download.
2. Pick Footer (full-width band): red wave band across the bottom edge.
3. Open data/tmp/test-stamp-footer.pdf to preview the band without a server.

### Next
- Deployment prep tomorrow (Dockerfile + Render), README/demo refresh,
  video. Buffer Nov 2-3, early submit Nov 3.
﻿
## Resolution for tomorrow (Nov 2) - single-image stamp UX + new footer art

### Problem stated (Nov 1 night)
- Stamping currently needs 2 images (DEXIS.png for corners, Footer.jpg
  for the band). Goal: ONE image drives all 5 positions (4 corners +
  footer). Operator supplies the single art.
- Corner UX: the 4 corners must be mutually exclusive with toggle-off.
  Picking one corner disables the other 3; clicking the chosen one again
  unclicks it and re-enables the rest. (Radios cannot unclick, so the
  corner inputs need toggle behavior, not plain radios.)
- Footer stays INDEPENDENT: always available to stamp regardless of
  corner state (footer + at most one corner per document).
- Footer art: current Footer.jpg sits too high/large. Operator provides
  better footer art tomorrow; then tune the band geometry (bottom offset,
  height cap) to the new art. Single-image goal may subsume this if the
  one art covers both roles.

### Suggested build order
1. Backend: stampPdf already takes any bytes per call; add support for
   stamping footer + one corner in a single pass (two drawImage calls,
   one save), or keep two sequential stamps. Decide when art lands.
2. Frontend: corner toggle group (click-on disables siblings, click-off
   re-enables), footer checkbox/radio independent, Apply stamp sends
   { corner, footer } state.
3. run_stamp_test.js: extend (single art for all positions, combined
   stamp output, toggle-state is frontend-only so cover positions math).
4. Operator live-test with the new art, eyes on band placement.

### Then
- Deployment prep (Dockerfile + Render), README/demo refresh, video.
  Buffer Nov 2-3, early submit Nov 3. See you tomorrow.
