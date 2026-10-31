"use strict";
// DataForge - 16-field product schema.
// Version: 2.2.0-2026-10-30 (DEXIS sheet polish: adds optional description,
// colors, categorization, ean, orderInfo for the commercial block).
// Every extracted field keeps: value (normalized, source language),
// originalValue (verbatim), unit (never translated), evidence (source
// quotes pointing at the PDF), translatable flag, and a translation
// slot filled later by the Meta Model API step.

const SCHEMA_VERSION = "2.2.0-2026-10-30";
const SUPPORTED_SCHEMA_VERSIONS = ["2.0.0-locked-2026-10-27", "2.1.0-2026-10-28", SCHEMA_VERSION];

const FIELDS = [
  { key: "productName", label: "Product name", required: true, translatable: true, allowsUnit: false },
  { key: "manufacturer", label: "Manufacturer", required: true, translatable: false, allowsUnit: false },
  { key: "modelOrReference", label: "Model / reference", required: true, translatable: false, allowsUnit: false },
  { key: "categoryOrIntendedUse", label: "Category / intended use", required: false, translatable: true, allowsUnit: false },
  { key: "description", label: "Description", required: false, translatable: true, allowsUnit: false },
  { key: "materials", label: "Materials", required: false, translatable: true, allowsUnit: false },
  { key: "dimensions", label: "Dimensions", required: false, translatable: false, allowsUnit: true },
  { key: "sizesAvailable", label: "Sizes", required: false, translatable: false, allowsUnit: false },
  { key: "colors", label: "Colors", required: false, translatable: true, allowsUnit: false },
  { key: "standardsAndCertifications", label: "Norms", required: false, translatable: false, allowsUnit: false },
  { key: "protectionLevelsOrPerformance", label: "Protection levels / performance", required: false, translatable: false, allowsUnit: true },
  { key: "usageRestrictionsOrWarnings", label: "Usage restrictions / warnings", required: false, translatable: true, allowsUnit: false },
  { key: "industriesOrApplications", label: "Industries / applications", required: false, translatable: true, allowsUnit: false },
  { key: "categorization", label: "Categorization", required: false, translatable: false, allowsUnit: false },
  { key: "ean", label: "EAN / barcode", required: false, translatable: false, allowsUnit: false },
  { key: "orderInfo", label: "Order / pack quantities", required: false, translatable: false, allowsUnit: false }
];

const FIELD_KEYS = FIELDS.map(function (f) { return f.key; });

// Value-level never-translate rules (Roadmap v2): IDs, numbers, units,
// cert codes stay in the source language even inside translatable fields.
const DO_NOT_TRANSLATE = [
  "product identifiers and model/reference codes",
  "numeric values and quantities",
  "units of measure",
  "standards and certification codes (e.g. EN 388, ISO 13997)",
  "barcodes (EAN/GTIN) and order quantities"
];

function fieldDef(key) {
  return FIELDS.find(function (f) { return f.key === key; }) || null;
}

function isTranslatableField(key) {
  const def = fieldDef(key);
  return def ? def.translatable : false;
}

function makeEmptyField(key) {
  const def = fieldDef(key);
  return {
    value: null,
    originalValue: null,
    unit: null,
    evidence: [],
    translatable: def ? def.translatable : false,
    translation: null
  };
}

function createEmptyRecord(documentName, extractionEngine) {
  const fields = {};
  FIELD_KEYS.forEach(function (key) { fields[key] = makeEmptyField(key); });
  return {
    schemaVersion: SCHEMA_VERSION,
    documentName: documentName || null,
    extractionEngine: extractionEngine || "deterministic-rules-v2.2",
    fields: fields
  };
}

function makeEvidence(page, quote, charRange) {
  const ev = { page: page || 1, quote: String(quote || "").slice(0, 300) };
  if (charRange) ev.characterRange = charRange;
  return ev;
}

// Backward compat: older records validate and migrate cleanly.
// Missing optional fields are filled with empty slots, version is bumped.
function migrateRecord(record) {
  if (!record || !record.fields) return record;
  FIELD_KEYS.forEach(function (key) {
    if (!(key in record.fields)) record.fields[key] = makeEmptyField(key);
  });
  if (SUPPORTED_SCHEMA_VERSIONS.indexOf(record.schemaVersion) !== -1 && record.schemaVersion !== SCHEMA_VERSION) {
    record.migratedFrom = record.schemaVersion;
    record.schemaVersion = SCHEMA_VERSION;
  }
  return record;
}

module.exports = {
  SCHEMA_VERSION: SCHEMA_VERSION,
  SUPPORTED_SCHEMA_VERSIONS: SUPPORTED_SCHEMA_VERSIONS,
  FIELDS: FIELDS,
  FIELD_KEYS: FIELD_KEYS,
  DO_NOT_TRANSLATE: DO_NOT_TRANSLATE,
  fieldDef: fieldDef,
  isTranslatableField: isTranslatableField,
  makeEmptyField: makeEmptyField,
  createEmptyRecord: createEmptyRecord,
  makeEvidence: makeEvidence,
  migrateRecord: migrateRecord
};