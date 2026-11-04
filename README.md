# Tempo

Supplier PDF datasheets into standardized company data.

Upload a supplier PDF, get validated fields with source evidence, stamp it with your logo, and download a bilingual company sheet (PDF) plus an ERP-ready Excel file.

**Live demo:** https://tempo-vuij.onrender.com/ (free tier — allow ~1 min to wake up)
**Demo video:** _(link your 3-minute video here before submitting)_

## What it does

- **Extract** — 16-field product schema (identity, materials, norms, sizes, colors, EAN, order info) via Meta AI with a deterministic offline fallback.
- **Trust report** — every value linked to source evidence, with validation findings.
- **Stamp** — corner logo or full-width footer band watermark on the source PDF.
- **Company sheet** — A4 data sheet PDF (source + PT / ES / EN) with findings and evidence quotes.
- **ERP export** — `.xlsx` matching the company import template, plus canonical company JSON.

## Quickstart

```powershell
cd Production
npm install
$env:MODEL_API_KEY = "<your-key>"
$env:MODEL_API_BASE = "https://api.meta.ai/v1"
$env:MODEL_API_MODEL = "muse-spark-1.3"
node backend/server.js
```

Open http://localhost:7500, paste your key (or leave empty for heuristic fallback), upload a PDF.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `MODEL_API_KEY` | _(none)_ | Meta model API key. Never committed. |
| `MODEL_API_BASE` | `https://api.meta.ai/v1` | Model endpoint. |
| `MODEL_API_MODEL` | `muse-spark-1.3` | Extraction/translation model. |
| `COMPANY_NAME` | `Tempo` | Header name + logo (`misc/Tempo-neutral.png`). |
| `PORT` / `HOST` | `7500` / `0.0.0.0` | Server bind. Render injects `PORT`. |

## API (see `Production/README.md` for details)

- `POST /api/documents` — upload PDF, returns `jobId`.
- `GET /api/jobs/:id/trust` — trust report.
- `POST|GET /api/jobs/:id/watermark` — stamp the source PDF.
- `POST /api/jobs/:id/translate` — fill `pt` / `es` / `en` slots.
- `GET /api/jobs/:id/company-sheet?lang=pt` — A4 company sheet PDF.
- `GET /api/jobs/:id/company-excel` / `GET /api/jobs/:id/company-json` — ERP exports.
- `GET /health`, `GET /api/config`, `GET /api/models`.

## Tests

```powershell
cd Production
foreach ($f in Get-ChildItem run_*_test.js) { node $f.FullName }
```

AI-dependent checks need `MODEL_API_KEY`; the sheet, stamp, Excel, JSON, trust, and config suites run fully offline.

## Project layout

- `Production/` — the hackathon submission (Node 22+, `pdf-lib` + `pdf-parse`, vanilla JS frontend). Deployable via `Production/Dockerfile` / `render.yaml`.
- `Production/sample-pdfs/` — fixtures, including a generated synthetic sheet for offline tests.
- `Production/misc/` — neutral `Tempo-neutral.png` logo, footer art, stamp opacity previews.
- `src/`, `tests/`, `data/` — the original dependency-free MVP skeleton this project grew out of (kept for history).

## License

MIT — see [LICENSE](LICENSE).