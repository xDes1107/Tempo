"use strict";
// Visual Translator backend - skeleton wired to the locked 10-field schema
// and the SQLite job store (Roadmap v2, Oct 27).
// POST /api/documents keeps its legacy response fields (candidateData)
// so the current vanilla frontend keeps working; new clients use
// jobId + record + findings and GET /api/jobs[/:id].
// Page-count cap (20) and MuPDF rendering land Oct 28; pageCount is
// stored as null until then.

const http = require("node:http");
const crypto = require("node:crypto");
const { extractPdfText } = require("./pdf-extractor");
const { saveAnalysisResult } = require("./results");
const { extractProductData } = require("./extractor");
const { validateRecord } = require("./validation");
const { SqliteJobStore } = require("./job-store-sqlite");

const host = "localhost";
const port = 7500;
const maximumFileSize = 10 * 1024 * 1024;

const store = new SqliteJobStore();

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  });
  response.end(JSON.stringify(data));
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

  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, 200, { status: "ok", message: "Visual Translator backend is running." });
    return;
  }

  if (request.method === "GET" && request.url === "/api/jobs") {
    sendJson(response, 200, store.all());
    return;
  }

  if (request.method === "GET" && request.url.startsWith("/api/jobs/")) {
    const id = request.url.split("/").pop();
    const job = store.get(id);
    if (!job) {
      sendJson(response, 404, { error: "Job not found." });
      return;
    }
    sendJson(response, 200, job);
    return;
  }

  if (request.method === "POST" && request.url === "/api/documents") {
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
      store.create({ id: jobId, fileName: fileName, createdAt: new Date().toISOString(), status: "processing" });
      const extractedText = await extractPdfText(fileBuffer);
      const record = extractProductData(extractedText, fileName);
      const findings = validateRecord(record);
      const saved = await saveAnalysisResult(fileName, fileBuffer.length, extractedText, record, findings);
      const job = store.update(jobId, {
        status: "completed",
        completedAt: new Date().toISOString(),
        pageCount: null,
        record: record,
        findings: findings,
        resultFile: saved.outputFileName
      });
      sendJson(response, 201, {
        message: "PDF text extracted successfully.",
        jobId: job.id,
        resultFile: saved.outputFileName,
        record: record,
        findings: findings,
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
