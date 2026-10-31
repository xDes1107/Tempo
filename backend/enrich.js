"use strict";
// Goal 1 enrichment: website description + ERP flat row + CSV,
// plus the AI-extract prompt builder for the Meta Model API step.
// Deterministic parts run offline; AI parts need MODEL_API_KEY.

const { FIELD_KEYS } = require("./schema");

function fieldValue(record, key) {
  if (!record || !record.fields || !record.fields[key]) return null;
  return record.fields[key].value || null;
}

function buildWebsiteDescription(record) {
  const name = fieldValue(record, "productName");
  const maker = fieldValue(record, "manufacturer");
  const model = fieldValue(record, "modelOrReference");
  const cat = fieldValue(record, "categoryOrIntendedUse");
  const mats = fieldValue(record, "materials");
  const dims = fieldValue(record, "dimensions");
  const sizes = fieldValue(record, "sizesAvailable");
  const stds = fieldValue(record, "standardsAndCertifications");
  const perf = fieldValue(record, "protectionLevelsOrPerformance");
  const desc = fieldValue(record, "description");
  const colors = fieldValue(record, "colors");
  const apps = fieldValue(record, "industriesOrApplications");
  const parts = [];
  if (name) parts.push(model && model !== name ? name + " (" + model + ")" : name);
  else if (model) parts.push(model);
  if (maker) parts.push("by " + maker);
  if (cat) parts.push("- " + cat);
  let head = parts.join(" ").trim();
  if (head && !/[.!]$/.test(head)) head += ".";
  const body = [];
  if (desc) body.push("Description: " + desc);
  if (mats) body.push("Materials: " + mats);
  if (dims) body.push("Dimensions: " + dims);
  if (sizes) body.push("Sizes: " + sizes);
  if (colors) body.push("Colors: " + colors);
  if (stds) body.push("Standards: " + stds);
  if (perf) body.push("Performance: " + perf);
  if (apps) body.push("Industries / applications: " + apps);
  return [head, body.join(". ") + (body.length ? "." : "")].filter(Boolean).join(" ");
}

function toErpRow(record, findings) {
  const row = {
    schemaVersion: record ? record.schemaVersion : null,
    documentName: record ? record.documentName : null,
    extractionEngine: record ? record.extractionEngine : null
  };
  FIELD_KEYS.forEach(function (key) {
    const f = record && record.fields ? record.fields[key] : null;
    row[key] = f && f.value ? f.value : "";
    row[key + "__original"] = f && f.originalValue ? f.originalValue : "";
    row[key + "__unit"] = f && f.unit ? f.unit : "";
  });
  row.findingsCount = Array.isArray(findings) ? findings.length : 0;
  row.websiteDescription = buildWebsiteDescription(record);
  return row;
}

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? "\"" + s.replace(/\"/g, "\"\"") + "\"" : s;
}

function toErpCsv(rows) {
  const list = Array.isArray(rows) ? rows : [rows];
  if (!list.length) return "";
  const headers = Object.keys(list[0]);
  const lines = [headers.map(csvEscape).join(",")];
  list.forEach(function (r) {
    lines.push(headers.map(function (h) { return csvEscape(r[h]); }).join(","));
  });
  return lines.join("\r\n") + "\r\n";
}

function buildEnrichment(record, findings) {
  const erpRow = toErpRow(record, findings);
  return {
    websiteDescription: erpRow.websiteDescription,
    erpRow: erpRow,
    erpCsv: toErpCsv(erpRow)
  };
}

// Prompt builder for the AI extract step (Meta Model API).
// Returns { system, user } - caller sends via chatJson(), then maps
// the JSON back through the same 11-field evidence contract.
function buildAiExtractPrompt(extractedText) {
  const system = [
    "You extract supplier datasheet facts into strict JSON for schema 2.2.0-2026-10-30.",
    "Fields: productName, manufacturer, modelOrReference, categoryOrIntendedUse,",
    "materials, dimensions, sizesAvailable, colors, standardsAndCertifications,",
    "protectionLevelsOrPerformance, usageRestrictionsOrWarnings, industriesOrApplications, description, categorization, ean, orderInfo.",
    "Each field: { value, originalValue, unit, evidence: [{ page, quote }] }.",
    "Rules: keep originalValue verbatim; normalize value lightly; units in unit only;",
    "evidence quotes must be substrings of the input text; never invent facts;",
    "missing facts get null value with empty evidence; output JSON object with a",
    "\"fields\" object only, no commentary."
  ].join(" ");
  const text = String(extractedText || "").slice(0, 12000);
  const user = "Extract the 16 fields from this datasheet text:\n\n" + text;
  return { system: system, user: user };
}

module.exports = {
  buildWebsiteDescription: buildWebsiteDescription,
  toErpRow: toErpRow,
  toErpCsv: toErpCsv,
  buildEnrichment: buildEnrichment,
  buildAiExtractPrompt: buildAiExtractPrompt
};
