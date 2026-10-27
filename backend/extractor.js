"use strict";
// Deterministic extraction mapped onto the locked 10-field schema.
// Method: deterministic-rules-v2-schema-locked. Regex candidates only -
// every value needs human review. AI (Meta Model API) replaces the
// finders on Oct 29 but keeps this output shape and evidence contract.

const { createEmptyRecord, makeEvidence } = require("./schema");

function getLines(text) {
  return text
    .split(/\r?\n/)
    .map(function (line) { return line.trim().replace(/\s+/g, " "); })
    .filter(Boolean);
}

function findLineIndex(lines, value) {
  return lines.findIndex(function (line) {
    return line.toLowerCase().includes(String(value).toLowerCase().slice(0, 40));
  });
}

function evidenceFor(lines, text, rawValue) {
  const idx = findLineIndex(lines, rawValue || text);
  if (idx === -1) return [];
  const start = text.indexOf(rawValue || text);
  const range = start >= 0 ? [start, start + String(rawValue || text).length] : null;
  return [makeEvidence(1, lines[idx], range)];
}

function setField(record, lines, text, key, rawValue, options) {
  if (!rawValue) return;
  const value = String(rawValue).trim();
  if (!value) return;
  const opts = options || {};
  record.fields[key] = {
    value: opts.normalized || value,
    originalValue: value,
    unit: opts.unit || null,
    evidence: evidenceFor(lines, text, value),
    translatable: record.fields[key].translatable,
    translation: null
  };
}

function findProductName(lines) {
  return lines.find(function (line) {
    const looksLikeCode = /^[A-Z][A-Z0-9 \-/]{2,60}$/.test(line);
    const isHeading = /^(EN|ISO|CATEGORY|LEVEL|CUT PROTECTION|MECHANICAL)/.test(line);
    return looksLikeCode && !isHeading;
  }) || null;
}

function findManufacturer(text) {
  const m = text.match(/(MAPA\s*SAS|MAPA|Ansell|Honeywell|3M|uvex|Showa|Towa)\b[^\n\r]{0,60}/i);
  return m ? m[0].trim() : null;
}

function findCategory(text) {
  const m = text.match(/(Cut protection|Chemical protection|Mechanical protection|Disposable gloves?|Reusable gloves?)[^\n\r]{0,80}/i);
  return m ? m[0].trim() : null;
}

function findMaterials(text) {
  const m = text.match(/(HDPE fibres?|Nitrile|Seamless textile support[^\n\r]{0,80}|Knitted cuff[^\n\r]{0,40})/i);
  return m ? m[0].trim() : null;
}

function findSizes(text) {
  const m = text.match(/Sizes?\s*:?\s*([0-9][0-9 ,\/\-]+)/i);
  return m ? m[1].trim() : null;
}

function findStandards(text) {
  const matches = text.match(/\b(?:EN(?:\s+ISO)?|ISO)\s+\d{3,6}(?::\d{4})?\b/gi) || [];
  const unique = Array.from(new Set(matches.map(function (s) { return s.replace(/\s+/g, " ").trim(); })));
  return unique.join("; ") || null;
}

function findProtectionLevels(text) {
  const m = text.match(/\b[0-9X](?:\s*[0-9X]){3,6}\b|\bLevel\s+[A-F]\b|\b[A-F]\s*\/\s*[0-9.]+\s*N\b/i);
  const perf = text.match(/(Abrasion resistance|Blade cut resistance|Tear resistance|Puncture resistance|Cut resistance[^\n\r]{0,60})/i);
  const parts = [];
  if (m) parts.push(m[0].trim());
  if (perf) parts.push(perf[0].trim());
  return parts.join(" | ") || null;
}

function findDimensions(text) {
  const m = text.match(/Length[^\n\r]{0,20}?(\d+(?:[.,]\d+)?\s*-\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)\s*(cm|mm)\b/i);
  if (!m) return null;
  return { normalized: m[1].replace(",", "."), raw: m[0].trim(), unit: m[2] };
}

function findWarnings(text) {
  const m = text.match(/(Silicone free[^\n\r]{0,80}|DMF Free[^\n\r]{0,40}|not classified hazardous[^\n\r]{0,80})/i);
  return m ? m[0].trim() : null;
}

function extractProductData(text, documentName) {
  const safeText = text || "";
  const lines = getLines(safeText);
  const record = createEmptyRecord(documentName || null);

  setField(record, lines, safeText, "productName", findProductName(lines));
  setField(record, lines, safeText, "manufacturer", findManufacturer(safeText));
  // modelOrReference defaults to the product code line; the AI step refines it.
  setField(record, lines, safeText, "modelOrReference", findProductName(lines));
  setField(record, lines, safeText, "categoryOrIntendedUse", findCategory(safeText));
  setField(record, lines, safeText, "materials", findMaterials(safeText));
  const dims = findDimensions(safeText);
  if (dims) setField(record, lines, safeText, "dimensions", dims.raw, { normalized: dims.normalized, unit: dims.unit });
  setField(record, lines, safeText, "sizesAvailable", findSizes(safeText));
  setField(record, lines, safeText, "standardsAndCertifications", findStandards(safeText));
  setField(record, lines, safeText, "protectionLevelsOrPerformance", findProtectionLevels(safeText));
  setField(record, lines, safeText, "usageRestrictionsOrWarnings", findWarnings(safeText));

  return record;
}

module.exports = { extractProductData: extractProductData };
