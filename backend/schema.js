"use strict";
// Visual Translator - locked 10-field product schema.
// Version: 2.0.0-locked-2026-10-27 (Roadmap v2, Oct 27 rescope day).
// Every extracted field keeps: value (normalized, source language),
// originalValue (verbatim), unit (never translated), evidence (source
// quotes pointing at the PDF), translatable flag, and a translation
// slot filled later by the Meta Model API step (Oct 30).

const SCHEMA_VERSION = "2.0.0-locked-2026-10-27";

const FIELDS = [
  { key: "productName", label: "Product name", required: true, translatable: true, allowsUnit: false },
  { key: "manufacturer", label: "Manufacturer", required: true, translatable: false, allowsUnit: false },
  { key: "modelOrReference", label: "Model / reference", required: true, translatable: false, allowsUnit: false },
  { key: "categoryOrIntendedUse", label: "Category / intended use", required: false, translatable: true, allowsUnit: false },
  { key: "materials", label: "Materials", required: false, translatable: true, allowsUnit: false },
  { key: "dimensions", label: "Dimensions", required: false, translatable: false, allowsUnit: true },
  { key: "sizesAvailable", label: "Sizes available", required: false, translatable: false, allowsUnit: false },
  { key: "standardsAndCertifications", label: "Standards / certifications", required: false, translatable: false, allowsUnit: false },
  { key: "protectionLevelsOrPerformance", label: "Protection levels / performance", required: false, translatable: false, allowsUnit: true },
  { key: "usageRestrictionsOrWarnings", label: "Usage restrictions / warnings", required: false, translatable: true, allowsUnit: false }
];

const FIELD_KEYS = FIELDS.map(function (f) { return f.key; });

// Value-level never-translate rules (Roadmap v2): IDs, numbers, units,
// cert codes stay in the source language even inside translatable fields.
const DO_NOT_TRANSLATE = [
  "product identifiers and model/reference codes",
  "numeric values and quantities",
  "units of measure",
  "standards and certification codes (e.g. EN 388, ISO 13997)"
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
    extractionEngine: extractionEngine || "deterministic-rules-v2-schema-locked",
    fields: fields
  };
}

function makeEvidence(page, quote, charRange) {
  const ev = { page: page || 1, quote: String(quote || "").slice(0, 300) };
  if (charRange) ev.characterRange = charRange;
  return ev;
}

module.exports = {
  SCHEMA_VERSION: SCHEMA_VERSION,
  FIELDS: FIELDS,
  FIELD_KEYS: FIELD_KEYS,
  DO_NOT_TRANSLATE: DO_NOT_TRANSLATE,
  fieldDef: fieldDef,
  isTranslatableField: isTranslatableField,
  makeEmptyField: makeEmptyField,
  createEmptyRecord: createEmptyRecord,
  makeEvidence: makeEvidence
};
