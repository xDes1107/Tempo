"use strict";
// JSON export kept as interchange format; SQLite is the source of truth.
// Accepts the locked 10-field record + findings. Old callers passing the
// v1 productData object still work: it is stored under legacyProductData.

const fs = require("node:fs/promises");
const path = require("node:path");
const { SCHEMA_VERSION } = require("./schema");

function createSafeFileName(fileName) {
  const base = path.basename(fileName, path.extname(fileName));
  const safe = base.replace(/[^a-z0-9_-]/gi, "_").replace(/_+/g, "_");
  return safe || "document";
}

function isLockedRecord(obj) {
  return Boolean(obj && obj.fields && typeof obj.fields === "object");
}

async function saveAnalysisResult(fileName, fileSize, extractedText, recordOrLegacy, findings) {
  const resultsFolder = path.resolve(__dirname, "..", "data", "results");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputFileName = createSafeFileName(fileName) + "-" + timestamp + ".json";

  const locked = isLockedRecord(recordOrLegacy);
  const result = {
    schemaVersion: locked ? (recordOrLegacy.schemaVersion || SCHEMA_VERSION) : "1.0",
    exportedAt: new Date().toISOString(),
    document: { originalFileName: fileName, sizeInBytes: fileSize },
    extraction: {
      status: "text-extracted",
      hasExtractableText: extractedText.length > 0,
      textCharacterCount: extractedText.length,
      text: extractedText
    },
    record: locked ? recordOrLegacy : null,
    findings: Array.isArray(findings) ? findings : [],
    legacyProductData: locked ? null : recordOrLegacy || null
  };

  await fs.mkdir(resultsFolder, { recursive: true });
  await fs.writeFile(path.join(resultsFolder, outputFileName), JSON.stringify(result, null, 2), "utf8");
  return { outputFileName: outputFileName, result: result };
}

module.exports = { saveAnalysisResult: saveAnalysisResult };
