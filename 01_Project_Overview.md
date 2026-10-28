# Visual Translator - Project Overview (updated Oct 28)

A tool that turns supplier product datasheets (PDF) into company-ready
product data, watermarked documents, and translated outputs.

## The three goals

### Goal 1 - Data extraction and enrichment (partially built)
Extract structured data from product sheets: product identity, norms and
standards, materials, dimensions, sizes, performance levels, industries
and applications. Outputs feed website descriptions and ERP imports
(JSON/CSV file downloads; no live ERP integration in demo scope).
Status: deterministic regex extractor + locked schema + validation live;
AI enrichment (Meta Model API) and the industries field are next.

### Goal 2 - Image manipulation (new: company watermark)
Stamp processed documents with the company watermark (logo).
Prerequisites: operator provides the logo asset (PNG, transparent);
engine choice (MuPDF overlay vs pdf-lib) decided at implementation.
Not started.

### Goal 3 - Translation and reproduction (planned Oct 30+)
Translate validated content, then reproduce either:
(a) as faithful to the original layout as possible, or
(b) in the standardized company format/template.
Recommendation: build (b) first (template render from the locked schema),
attempt (a) as a stretch - faithful layout rebuild is the hardest part.

## Pipeline (unchanged skeleton, extended outputs)

01 Frontend - upload PDF, review results, correct values, pick language
02 Backend API - validates upload, creates a tracked analysis job
03 PDF Processing - text + layout (+ page render for watermark/report)
04 AI Analysis - Meta Model API interprets content (extract + translate)
05 Extraction & Normalization - maps facts into the locked JSON schema
06 Data Quality Validation - deterministic checks, severity + evidence
07 Storage - SQLite jobs DB (+ JSON export for ERP/website use)
08 Results & Outputs - side-by-side translation view, watermarked PDF,
   bilingual report, standardized company-format document
