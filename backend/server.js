"use strict";
// Visual Translator backend - 11-field schema v2.1 + SQLite job store.
// Serves the frontend static (index.html is the entry point) and the API.
// POST /api/documents keeps legacy candidateData so the vanilla frontend
// keeps working; new clients use jobId + record + findings + enriched.
// Goal 1: GET /api/jobs/:id/export?format=json|csv (ERP/website download).
// Goal 2: POST+GET /api/jobs/:id/watermark (corner logo stamp).
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
const { translateRecord, TARGET_LANGS, recordWithTranslations } = require("./translate");
const { buildBilingualReport } = require("./report");
const { buildCompanySheet, COMPANY_NAME_DEFAULT } = require("./company-template");
const { buildCompanyJson } = require("./company-json");
const { chatJson } = require("./meta-api");
const { SqliteJobStore } = require("./job-store-sqlite");

const host = "localhost";
const port = 7500;
const maximumFileSize = 10 * 1024 * 1024;
const uploadsDir = nodePath.resolve(__dirname, "..", "data", "uploads");
const watermarkedDir = nodePath.resolve(__dirname, "..", "data", "watermarked");
const defaultLogoFile = DEFAULTS.logoFile;

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
    sendJson(response, 200, { status: "ok", message: "Visual Translator backend is running." });
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

  // Goal 3 output file: bilingual PDF report for a translated job.
  if (request.method === "GET" && /^\/api\/jobs\/[^/]+\/report$/.test(pathname)) {
    const id = pathname.split("/").filter(Boolean)[2];
    const job = withEnrichment(store.get(id));
    if (!job || !job.record) {
      sendJson(response, 404, { error: "Job or record not found." });
      return;
    }
    const lang = (parsed.searchParams.get("lang") || "pt").toLowerCase();
    const hasLang = Object.keys(job.record.fields || {}).some(function (key) {
      const f = job.record.fields[key];
      return f && f.value && f.translation && f.translation.lang === lang;
    });
    if (!hasLang) {
      sendJson(response, 400, { error: "No " + lang + " translation yet. POST to /api/jobs/" + id + "/translate first." });
      return;
    }
    try {
      const bytes = await buildBilingualReport(job.record, job.findings || [], lang);
      response.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=\"" + id + "-report-" + lang + ".pdf\"",
        "Access-Control-Allow-Origin": "*"
      });
      response.end(bytes);
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
    return;
  }

  // Goal 3b: standardized company-format data sheet (template render).
  // GET /api/jobs/:id/company-sheet?lang=pt|es|en[&watermark=true]
  // lang is optional (source-only sheet when omitted); missing translations
  // render as placeholders so the sheet is always downloadable.
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
    try {
      let logoBytes = null;
      try { logoBytes = await nodeFs.readFile(defaultLogoFile); } catch (e) { logoBytes = null; }
      if (wantWatermark && !logoBytes) {
        sendJson(response, 500, { error: "Logo file missing, cannot watermark the company sheet." });
        return;
      }
      const bytes = await buildCompanySheet(job.record, job.findings || [], {
        lang: useLang,
        companyName: process.env.COMPANY_NAME || COMPANY_NAME_DEFAULT,
        jobId: id,
        logoPngBytes: logoBytes,
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
    const opacity = body.opacity == null ? 0.15 : Number(body.opacity);
    if (!job.filePath) {
      sendJson(response, 404, { error: "Source PDF was not stored for this job (uploaded before persistence). Re-upload to enable watermarking." });
      return;
    }
    try {
      const pdfBytes = await nodeFs.readFile(nodePath.resolve(__dirname, "..", job.filePath));
      const pngBytes = await nodeFs.readFile(body.logoFile || defaultLogoFile);
      const out = await stampPdf(pdfBytes, pngBytes, { position: position, opacity: opacity });
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

  // Goal 3: translate the validated record via the Meta Model API.
  if (request.method === "POST" && /^\/api\/jobs\/[^/]+\/translate$/.test(pathname)) {
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
    if (!body.targetLang) {
      sendJson(response, 400, { error: "Provide targetLang: " + TARGET_LANGS.join(", ") });
      return;
    }
    try {
      const out = await translateRecord(job.record, body.targetLang, chatJson, job.enriched && job.enriched.websiteDescription);
      if (out.translatedDescription) {
        job.record.translatedDescriptions = Object.assign({}, job.record.translatedDescriptions, { [body.targetLang]: out.translatedDescription });
      }
      const updated = withEnrichment(store.update(id, { record: job.record }));
      sendJson(response, 200, { jobId: id, targetLang: body.targetLang, applied: out.applied, translatedDescription: out.translatedDescription, model: out.model, note: out.note || null, record: updated.record });
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
    return;
  }

  if (request.method === "GET" && /^\/api\/jobs\/[^/]+\/watermark$/.test(pathname)) {
    const id = pathname.split("/").filter(Boolean)[2];
    const job = store.get(id);
    if (!job || !job.watermarkFile) {
      sendJson(response, 404, { error: "No watermark yet. POST to /api/jobs/" + (id || ":id") + "/watermark first." });
      return;
    }
    try {
      const bytes = await nodeFs.readFile(nodePath.resolve(__dirname, "..", job.watermarkFile));
      response.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=\"" + id + "-watermarked.pdf\"",
        "Access-Control-Allow-Origin": "*"
      });
      response.end(bytes);
    } catch (e) {
      sendJson(response, 404, { error: "Watermark file missing on disk." });
    }
    return;
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
      const record = extractProductData(extractedText, fileName);
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

  sendJson(response, 404, { error: "Route not found." });
});

server.listen(port, host, function () {
  console.log("Server running at http://" + host + ":" + port);
});
