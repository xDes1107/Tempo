"use strict";
// Tempo backend - 11-field schema v2.1 + SQLite job store.
// Serves the frontend static (index.html is the entry point) and the API.
// POST /api/documents keeps legacy candidateData so the vanilla frontend
// keeps working; new clients use jobId + record + findings + enriched.
// Goal 1: GET /api/jobs/:id/export?format=json|csv (ERP/website download).
// Goal 2: POST+GET /api/jobs/:id/watermark (corner logo stamp, footer band).
// Uploads persist under data/uploads; watermarked PDFs under data/watermarked.

const http = require("node:http");
const crypto = require("node:crypto");
const nodeFs = require("node:fs/promises");
const nodePath = require("node:path");
const { extractPdfText } = require("./pdf-extractor");
const { saveAnalysisResult } = require("./results");
const { extractProductData } = require("./extractor");
const { validateRecord } = require("./validation");
const { buildEnrichment } = require("./enrich");
const { migrateRecord } = require("./schema");
const { stampPdf, POSITIONS, DEFAULTS } = require("./watermark");
const { translateRecord, TARGET_LANGS, recordWithTranslations, recordNeedsTranslation } = require("./translate");
const { buildCompanySheet, COMPANY_NAME_DEFAULT } = require("./company-template");
const { extractProductImage } = require("./product-image");
const { buildCompanyJson } = require("./company-json");
const { chatJson } = require("./meta-api");
const { buildCompanyExcel } = require("./company-excel");
const { normalizeLayout, defaultLayout } = require("./layout");
const { buildTrustReport } = require("./trust");
const { runAiReview } = require("./ai-review");
const { runAiExtract } = require("./ai-extract");
const { runStandardExtraction } = require("./ai-standard");
const { getConfig, setUiConfig, clearUiConfig, configStatus } = require("./meta-api");
const { SqliteJobStore } = require("./job-store-sqlite");

const host = process.env.HOST || "0.0.0.0";
const port = parseInt(process.env.PORT || "7500", 10);
const maximumFileSize = 10 * 1024 * 1024;
const uploadsDir = nodePath.resolve(__dirname, "..", "data", "uploads");
const watermarkedDir = nodePath.resolve(__dirname, "..", "data", "watermarked");
const defaultLogoFile = DEFAULTS.logoFile;
const defaultFooterFile = DEFAULTS.footerFile;

const STATIC_FILES = {
  "/": { file: "index.html", type: "text/html; charset=utf-8" },
  "/index.html": { file: "index.html", type: "text/html; charset=utf-8" },
  "/script.js": { file: "script.js", type: "text/javascript; charset=utf-8" },
  "/styles.css": { file: "styles.css", type: "text/css; charset=utf-8" }
};

const store = new SqliteJobStore();

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  });
  response.end(JSON.stringify(data));
}

function parseUrl(request) {
  try {
    return new URL(request.url, "http://" + (request.headers.host || "localhost"));
  } catch (e) {
    return { pathname: request.url.split("?")[0], searchParams: new URLSearchParams() };
  }
}

function withEnrichment(job) {
  if (!job) return job;
  if (job.record) migrateRecord(job.record);
  if (job.record && !job.enriched) {
    try {
      job.enriched = buildEnrichment(job.record, job.findings || []);
    } catch (e) { job.enriched = null; }
  }
  return job;
}

function readRequestBody(request) {
  return new Promise(function (resolve, reject) {
    const chunks = [];
    let totalSize = 0;
    request.on("data", function (chunk) {
      totalSize += chunk.length;
      if (totalSize > maximumFileSize) {
        reject(new Error("The file exceeds the 10 MB upload limit."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", function () { resolve(Buffer.concat(chunks)); });
    request.on("error", function (error) { reject(error); });
  });
}

function toLegacyCandidateData(record) {
  const f = record.fields;
  const standards = f.standardsAndCertifications.value
    ? f.standardsAndCertifications.value.split(/;\s*/).map(function (s) {
        return { value: s, evidence: f.standardsAndCertifications.evidence };
      })
    : [];
  return {
    extractionMethod: record.extractionEngine,
    product: {
      name: f.productName.value
        ? { value: f.productName.value, evidence: f.productName.evidence }
        : null
    },
    standards: standards,
    unclassifiedMeasurements: f.dimensions.value
      ? [{ value: f.dimensions.value, originalValue: f.dimensions.originalValue, unit: f.dimensions.unit, evidence: f.dimensions.evidence }]
      : [],
    warnings: ["All extracted values are candidates and require human review."]
  };
}

const server = http.createServer(async function (request, response) {
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-File-Name"
    });
    response.end();
    return;
  }

  const parsed = parseUrl(request);
  const pathname = parsed.pathname;

  if (request.method === "GET" && STATIC_FILES[pathname]) {
    try {
      const body = await nodeFs.readFile(nodePath.resolve(__dirname, "..", STATIC_FILES[pathname].file));
      response.writeHead(200, { "Content-Type": STATIC_FILES[pathname].type });
      response.end(body);
    } catch (e) {
      sendJson(response, 404, { error: "Frontend file not found." });
    }
    return;
  }

  if (request.method === "GET" && pathname === "/health") {
    sendJson(response, 200, { status: "ok", message: "Tempo backend is running." });
    return;
  }

  if (request.method === "GET" && pathname === "/api/jobs") {
    sendJson(response, 200, store.all());
    return;
  }

  // Goal 1 export: /api/jobs/:id/export?format=json|csv
  if (request.method === "GET" && pathname.indexOf("/api/jobs/") === 0 && pathname.endsWith("/export")) {
    const parts = pathname.split("/").filter(Boolean);
    const id = parts[2];
    const job = withEnrichment(store.get(id));
    if (!job) {
      sendJson(response, 404, { error: "Job not found." });
      return;
    }
    const format = (parsed.searchParams.get("format") || "json").toLowerCase();
    if (format === "csv") {
      const lang = (parsed.searchParams.get("lang") || "").toLowerCase();
      let csv = (job.enriched && job.enriched.erpCsv) || "";
      if (lang && job.record) {
        csv = buildEnrichment(recordWithTranslations(job.record, lang), job.findings || []).erpCsv;
      }
      response.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=\"" + job.id + ".csv\"",
        "Access-Control-Allow-Origin": "*"
      });
      response.end(csv);
      return;
    }
    sendJson(response, 200, { jobId: job.id, record: job.record, findings: job.findings, enriched: job.enriched });
    return;
  }

  // Goal 3b: standardized company-format data sheet (template render).
  // GET /api/jobs/:id/company-sheet?lang=pt|es|en[&watermark=true]
  // lang is optional (source-only sheet when omitted). When a lang is asked
  // for and slots are missing, the sheet translates them on demand first;
  // anything still missing renders as a placeholder so the sheet is always
  // downloadable.
  if (request.method === "GET" && /^\/api\/jobs\/[^/]+\/company-sheet$/.test(pathname)) {
    const id = pathname.split("/").filter(Boolean)[2];
    const job = withEnrichment(store.get(id));
    if (!job || !job.record) {
      sendJson(response, 404, { error: "Job or record not found." });
      return;
    }
    const lang = (parsed.searchParams.get("lang") || "").toLowerCase();
    const useLang = TARGET_LANGS.indexOf(lang) !== -1 ? lang : null;
    const wantWatermark = parsed.searchParams.get("watermark") === "true";
    if (useLang && recordNeedsTranslation(job.record, useLang)) {
      try {
        const autoOut = await translateRecord(job.record, useLang, chatJson, job.enriched && job.enriched.websiteDescription);
        if (autoOut.translatedDescription) {
          job.record.translatedDescriptions = Object.assign({}, job.record.translatedDescriptions, { [useLang]: autoOut.translatedDescription });
        }
        store.update(id, { record: job.record, enriched: null });
      } catch (e) { /* fall through to placeholders */ }
    }
    try {
      let logoBytes = null;
      try { logoBytes = await nodeFs.readFile(defaultLogoFile); } catch (e) { logoBytes = null; }
      let productImageBytes = null;
      try {
        if (job.filePath) {
          const srcBytes = await nodeFs.readFile(nodePath.resolve(__dirname, "..", job.filePath));
          productImageBytes = await extractProductImage(srcBytes);
        }
      } catch (e) { productImageBytes = null; }
      if (wantWatermark && !logoBytes) {
        sendJson(response, 500, { error: "Logo file missing, cannot watermark the company sheet." });
        return;
      }
      const bytes = await buildCompanySheet(job.record, job.findings || [], {
        lang: useLang,
        companyName: process.env.COMPANY_NAME || COMPANY_NAME_DEFAULT,
        jobId: id,
        logoPngBytes: logoBytes,
        productImageBytes: productImageBytes,
        watermarkPngBytes: wantWatermark ? logoBytes : null,
        watermarkOpacity: 0.08
      });
      response.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=\"" + id + "-company-sheet" + (useLang ? "-" + useLang : "") + ".pdf\"",
        "Access-Control-Allow-Origin": "*"
      });
      response.end(bytes);
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
    return;
  }

  // Day 29: canonical company JSON artifact (ERP + AI handoff download).
  if (request.method === "GET" && /^\/api\/jobs\/[^/]+\/company-json$/.test(pathname)) {
    const id = pathname.split("/").filter(Boolean)[2];
    const job = withEnrichment(store.get(id));
    if (!job || !job.record) {
      sendJson(response, 404, { error: "Job or record not found." });
      return;
    }
    try {
      const doc = buildCompanyJson(job, {
        companyName: process.env.COMPANY_NAME || COMPANY_NAME_DEFAULT,
        jobId: id
      });
      const body = JSON.stringify(doc, null, 2);
      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": "attachment; filename=\"" + id + "-company.json\"",
        "Access-Control-Allow-Origin": "*"
      });
      response.end(body);
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
    return;
  }

  // Goal 2: stamp the stored source PDF with the logo.
  if (request.method === "POST" && /^\/api\/jobs\/[^/]+\/watermark$/.test(pathname)) {
    const id = pathname.split("/").filter(Boolean)[2];
    const job = store.get(id);
    if (!job) {
      sendJson(response, 404, { error: "Job not found." });
      return;
    }
    let body = {};
    try {
      body = JSON.parse((await readRequestBody(request)).toString("utf8") || "{}");
    } catch (e) {
      sendJson(response, 400, { error: "Invalid JSON body." });
      return;
    }
    const position = body.position || "upper-right";
    if (POSITIONS.indexOf(position) === -1) {
      sendJson(response, 400, { error: "Unknown position. Use one of: " + POSITIONS.join(", ") });
      return;
    }
    const opacity = body.opacity == null ? (position === "footer" ? 1 : 0.15) : Number(body.opacity);
    if (!job.filePath) {
      sendJson(response, 404, { error: "Source PDF was not stored for this job (uploaded before persistence). Re-upload to enable watermarking." });
      return;
    }
    try {
      const pdfBytes = await nodeFs.readFile(nodePath.resolve(__dirname, "..", job.filePath));
      const imgBytes = await nodeFs.readFile(body.logoFile || (position === "footer" ? defaultFooterFile : defaultLogoFile));
      const out = await stampPdf(pdfBytes, imgBytes, { position: position, opacity: opacity });
      const wmRel = nodePath.join("data", "watermarked", id + "-" + position + ".pdf");
      await nodeFs.mkdir(watermarkedDir, { recursive: true });
      await nodeFs.writeFile(nodePath.resolve(__dirname, "..", wmRel), out);
      const updated = withEnrichment(store.update(id, { watermarkFile: wmRel, watermarkOptions: { position: position, opacity: opacity } }));
      sendJson(response, 200, { jobId: id, watermarkFile: wmRel, position: position, opacity: opacity, downloadUrl: "/api/jobs/" + id + "/watermark", job: updated });
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
    return;
  }

  // Company Excel export (.xlsx): Document | Product | Findings | ERP row.
  // Trust Report (deterministic, offline-safe). GET /api/jobs/:id/trust
  if (request.method === "GET" && /^\/api\/jobs\/[^/]+\/trust$/.test(pathname)) {
    const id = pathname.split("/").filter(Boolean)[2];
    const job = withEnrichment(store.get(id));
    if (!job || !job.record) {
      sendJson(response, 404, { error: "Job or record not found." });
      return;
    }
    try {
      const trust = buildTrustReport(job.record, job.findings || []);
      sendJson(response, 200, { jobId: id, trust: trust });
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
    return;
  }

  // Models available for on-demand AI review. GET /api/models
  // Tries the live Meta endpoint when a key is configured; otherwise
  // returns the last-known list so the dropdown always renders.
  if (request.method === "GET" && pathname === "/api/models") {
    const cfg = getConfig();
    const TEXT_MODELS = ["muse-spark-1.3", "muse-spark-1.2", "muse-spark-1.1", "muse-wonder-1.0", "sam-3.1"];    const fallback = TEXT_MODELS.slice();
    if (!cfg.apiKey) {
      sendJson(response, 200, { models: fallback, default: cfg.model, configured: false, note: "MODEL_API_KEY is not set on the server. Set it and restart to list live models." });
      return;
    }
    try {
      const res = await fetch(cfg.baseUrl + "/models", { headers: { Authorization: "Bearer " + cfg.apiKey } });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      const ids = (Array.isArray(data.data) ? data.data : []).map(function (m) { return m.id || m.name; }).filter(function (id) { return TEXT_MODELS.indexOf(id) !== -1; }).filter(Boolean);
      sendJson(response, 200, { models: ids.length ? ids : fallback, default: cfg.model, configured: true, baseUrl: cfg.baseUrl });
    } catch (error) {
      sendJson(response, 200, { models: fallback, default: cfg.model, configured: false, note: "Live list failed (" + error.message + "). Showing last-known list." });
    }
    return;
  }

  // Opt-in AI enhancement over deterministic extraction.
  // POST /api/jobs/:id/ai-extract { model? }
  // Manual retry: AI-standard already ran on upload; this re-runs the AI fill on demand.
  // fields and may correct known misfire fields. Unevidenced values are
  // dropped on merge, then findings and trust are recomputed.
  if (request.method === "POST" && /^\/api\/jobs\/[^/]+\/ai-extract$/.test(pathname)) {
    const aiExtractId = pathname.split("/").filter(Boolean)[2];
    const aiExtractJob = withEnrichment(store.get(aiExtractId));
    if (!aiExtractJob || !aiExtractJob.record) {
      sendJson(response, 404, { error: "Job or record not found." });
      return;
    }
    let aiExtractBody = {};
    try {
      aiExtractBody = JSON.parse((await readRequestBody(request)).toString("utf8") || "{}");
    } catch (e) {
      sendJson(response, 400, { error: "Invalid JSON body." });
      return;
    }
    try {
      const aiRel = aiExtractJob.filePath || nodePath.join("data", "uploads", aiExtractId + ".pdf");
      const aiPdfBytes = await nodeFs.readFile(nodePath.resolve(__dirname, "..", aiRel));
      const aiSourceText = await extractPdfText(aiPdfBytes);
      if (!aiSourceText || !aiSourceText.trim()) {
        sendJson(response, 400, { error: "No extractable text in this PDF, nothing for AI to enhance." });
        return;
      }
      migrateRecord(aiExtractJob.record);
      const aiResult = await runAiExtract(aiExtractJob.record, aiSourceText, chatJson, { model: aiExtractBody.model });
      const aiFindings = validateRecord(aiExtractJob.record);
      const aiTrust = buildTrustReport(aiExtractJob.record, aiFindings);
      const aiUpdated = withEnrichment(store.update(aiExtractId, { record: aiExtractJob.record, findings: aiFindings, enriched: null }));
      sendJson(response, 200, { jobId: aiExtractId, trust: aiTrust, ai: aiResult, record: aiUpdated.record, findings: aiFindings });
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
    return;
  }
  // On-demand AI review that also fixes what it flags.
  // POST /api/jobs/:id/ai-review { model? }
  // Deterministic trust always exists first; this is opt-in only. Evidenced
  // corrections are merged into the record, then findings and trust are
  // recomputed so the review visibly enhances the file output.
  if (request.method === "POST" && /^\/api\/jobs\/[^/]+\/ai-review$/.test(pathname)) {
    const id = pathname.split("/").filter(Boolean)[2];
    const job = withEnrichment(store.get(id));
    if (!job || !job.record) {
      sendJson(response, 404, { error: "Job or record not found." });
      return;
    }
    let body = {};
    try {
      body = JSON.parse((await readRequestBody(request)).toString("utf8") || "{}");
    } catch (e) {
      sendJson(response, 400, { error: "Invalid JSON body." });
      return;
    }
    try {
      migrateRecord(job.record);
      let reviewSourceText = "";
      try {
        const reviewRel = job.filePath || nodePath.join("data", "uploads", id + ".pdf");
        const reviewBytes = await nodeFs.readFile(nodePath.resolve(__dirname, "..", reviewRel));
        reviewSourceText = await extractPdfText(reviewBytes);
      } catch (e) { reviewSourceText = ""; }
      const preTrust = buildTrustReport(job.record, job.findings || []);
      const ai = await runAiReview(job.record, preTrust, chatJson, { model: body.model, sourceText: reviewSourceText });
      job.record.aiReview = Object.assign({}, job.record.aiReview, { lastRun: new Date().toISOString(), model: ai.rawModel, aiScore: ai.aiScore, aiFindings: ai.aiFindings, notes: ai.notes, appliedCorrections: ai.applied, skippedCorrections: ai.skipped });
      const aiReviewFindings = validateRecord(job.record);
      const aiReviewTrust = buildTrustReport(job.record, aiReviewFindings);
      const updated = withEnrichment(store.update(id, { record: job.record, findings: aiReviewFindings, enriched: null }));
      sendJson(response, 200, { jobId: id, trust: aiReviewTrust, ai: ai, record: updated.record, findings: aiReviewFindings });
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
    return;
  }

  // GET /api/jobs/:id/company-excel?lang=pt|es|en (lang optional, source when omitted)
  if (request.method === "GET" && /^\/api\/jobs\/[^/]+\/company-excel$/.test(pathname)) {
    const excelId = pathname.split("/").filter(Boolean)[2];
    const excelJob = withEnrichment(store.get(excelId));
    if (!excelJob || !excelJob.record) {
      sendJson(response, 404, { error: "Job or record not found." });
      return;
    }
    const excelLang = (parsed.searchParams.get("lang") || "").toLowerCase();
    const excelUseLang = TARGET_LANGS.indexOf(excelLang) !== -1 ? excelLang : "";
    if (excelUseLang && recordNeedsTranslation(excelJob.record, excelUseLang)) {
      try {
        const excelOut = await translateRecord(excelJob.record, excelUseLang, chatJson, excelJob.enriched && excelJob.enriched.websiteDescription);
        if (excelOut.translatedDescription) {
          excelJob.record.translatedDescriptions = Object.assign({}, excelJob.record.translatedDescriptions, { [excelUseLang]: excelOut.translatedDescription });
        }
        store.update(excelId, { record: excelJob.record, enriched: null });
      } catch (e) { /* fall through to source values */ }
    }
    try {
      const excelBytes = buildCompanyExcel(excelJob, {
        lang: excelUseLang,
        companyName: process.env.COMPANY_NAME || COMPANY_NAME_DEFAULT,
        jobId: excelId
      });
      const excelSuffix = excelUseLang ? "-" + excelUseLang : "";
      response.writeHead(200, {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": "attachment; filename=\"" + excelId + "-erp-import" + excelSuffix + ".xlsx\"",
        "Access-Control-Allow-Origin": "*"
      });
      response.end(excelBytes);
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
    return;
  }

  if (request.method === "GET" && /^\/api\/jobs\/[^/]+\/watermark$/.test(pathname)) {
    const id = pathname.split("/").filter(Boolean)[2];
    const job = store.get(id);
    if (!job || !job.watermarkFile) {
      sendJson(response, 404, { error: "No stamp yet. POST to /api/jobs/" + (id || ":id") + "/watermark first." });
      return;
    }
    try {
      const bytes = await nodeFs.readFile(nodePath.resolve(__dirname, "..", job.watermarkFile));
      response.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=\"" + id + "-stamped.pdf\"",
        "Access-Control-Allow-Origin": "*"
      });
      response.end(bytes);
    } catch (e) {
      sendJson(response, 404, { error: "Stamp file missing on disk." });
    }
    return;
  }

  // Option 1 layout (visual prompt): GET + POST /api/jobs/:id/layout
  // Stored on record.layout, no DB migration. Company sheet/excel read it automatically.
  if (pathname.match(/^\/api\/jobs\/[^/]+\/layout$/)) {
    const layoutId = pathname.split("/").filter(Boolean)[2];
    const layoutJob = store.get(layoutId);
    if (!layoutJob) { sendJson(response, 404, { error: "Job not found." }); return; }
    if (request.method === "GET") {
      const layout = (layoutJob.record && layoutJob.record.layout) ? layoutJob.record.layout : defaultLayout();
      sendJson(response, 200, { jobId: layoutId, layout: layout });
      return;
    }
    if (request.method === "POST") {
      const layoutBody = await readRequestBody(request);
      let layoutInput = {};
      try { layoutInput = JSON.parse(layoutBody.toString("utf8")); } catch (e) { sendJson(response, 400, { error: "Invalid JSON." }); return; }
      const layout = normalizeLayout(layoutInput.layout || layoutInput);
      layoutJob.record = layoutJob.record || {};
      layoutJob.record.layout = layout;
      const layoutUpdated = store.update(layoutId, { record: layoutJob.record, enriched: null });
      sendJson(response, 200, { jobId: layoutId, layout: layout, job: withEnrichment(layoutUpdated) });
      return;
    }
  }

  if (request.method === "GET" && pathname.indexOf("/api/jobs/") === 0) {
    const id = pathname.split("/").filter(Boolean).pop();
    const job = withEnrichment(store.get(id));
    if (!job) {
      sendJson(response, 404, { error: "Job not found." });
      return;
    }
    sendJson(response, 200, job);
    return;
  }

  if (request.method === "POST" && pathname === "/api/documents") {
    const fileName = request.headers["x-file-name"];
    if (!fileName || !fileName.toLowerCase().endsWith(".pdf")) {
      sendJson(response, 400, { error: "Please provide a PDF filename." });
      return;
    }
    const jobId = crypto.randomUUID();
    try {
      const fileBuffer = await readRequestBody(request);
      if (fileBuffer.subarray(0, 4).toString("ascii") !== "%PDF") {
        sendJson(response, 400, { error: "The uploaded file is not a valid PDF." });
        return;
      }
      await nodeFs.mkdir(uploadsDir, { recursive: true });
      const storedRel = nodePath.join("data", "uploads", jobId + ".pdf");
      await nodeFs.writeFile(nodePath.resolve(__dirname, "..", storedRel), fileBuffer);
      store.create({ id: jobId, fileName: fileName, createdAt: new Date().toISOString(), status: "processing", filePath: storedRel });
      const extractedText = await extractPdfText(fileBuffer);
      let record = extractProductData(extractedText, fileName);
      try {
        if (extractedText && extractedText.trim()) {
          const std = await runStandardExtraction(extractedText, fileName, chatJson, {});
          if (std && std.record) record = std.record;
        }
      } catch (e) { /* deterministic record above stands */ }
      const findings = validateRecord(record);
      const enriched = buildEnrichment(record, findings);
      const saved = await saveAnalysisResult(fileName, fileBuffer.length, extractedText, record, findings, enriched);
      const job = withEnrichment(store.update(jobId, {
        status: "completed",
        completedAt: new Date().toISOString(),
        pageCount: null,
        record: record,
        findings: findings,
        resultFile: saved.outputFileName
      }));
      sendJson(response, 201, {
        message: "PDF text extracted successfully.",
        jobId: job.id,
        resultFile: saved.outputFileName,
        record: record,
        findings: findings,
        enriched: enriched,
        candidateData: toLegacyCandidateData(record),
        document: {
          fileName: fileName,
          sizeInBytes: fileBuffer.length,
          status: "text-extracted",
          textCharacterCount: extractedText.length,
          textPreview: extractedText.slice(0, 1000),
          hasExtractableText: extractedText.length > 0
        }
      });
    } catch (error) {
      try { store.update(jobId, { status: "failed", completedAt: new Date().toISOString() }); } catch (e) { /* job may not exist yet */ }
      sendJson(response, 413, { error: error.message, jobId: jobId });
    }
    return;
  }

  
  // UI credentials (demo): key + base URL entered above the upload, kept in server memory only.
  // Never persisted to disk or DB, never logged, never returned to the client.
  // Empty key falls back to env, then deterministic. Covers uploads AND sheet downloads.
  if (pathname === "/api/config" && request.method === "GET") {
    sendJson(response, 200, configStatus());
    return;
  }
  if (pathname === "/api/config" && request.method === "POST") {
    let cfgBody = {};
    try { cfgBody = JSON.parse((await readRequestBody(request)).toString("utf8") || "{}"); } catch (e) { sendJson(response, 400, { error: "Invalid JSON." }); return; }
    if (cfgBody.clear || (!cfgBody.apiKey && !cfgBody.baseUrl && !cfgBody.model)) {
      sendJson(response, 200, clearUiConfig());
      return;
    }
    if (cfgBody.apiKey && typeof cfgBody.apiKey !== "string") { sendJson(response, 400, { error: "apiKey must be a string." }); return; }
    if (cfgBody.baseUrl && typeof cfgBody.baseUrl !== "string") { sendJson(response, 400, { error: "baseUrl must be a string." }); return; }
    if (cfgBody.baseUrl && cfgBody.baseUrl.trim() && !/^https?:\/\//i.test(cfgBody.baseUrl.trim())) { sendJson(response, 400, { error: "baseUrl must start with http(s)://" }); return; }
    sendJson(response, 200, setUiConfig({ apiKey: cfgBody.apiKey || "", baseUrl: cfgBody.baseUrl || "", model: cfgBody.model || "" }));
    return;
  }
  sendJson(response, 404, { error: "Route not found." });
});

server.listen(port, host, function () {
  console.log("Server running at http://" + host + ":" + port);
});





