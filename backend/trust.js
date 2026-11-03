"use strict";
// Tempo - deterministic Trust Report (no AI call, offline-safe).
// buildTrustReport(record, findings) -> { score, counts, fields, generatedAt }.
// Score is a transparent heuristic (NOT a calibrated probability):
//   start 100, -12 per missing REQUIRED field, -4 per valued-but-unsourced
//   field, -2 per missing optional field (capped), -2 per error finding,
//   -1 per warning finding. Clamped 0-100.
// Counts mirror the Tempo mock: extracted / supported / missing / review.

const { FIELD_KEYS, fieldDef } = require("./schema");
const { REQUIRED_FIELDS } = require("./validation");

function fieldStatus(key, field, isRequired) {
  const hasValue = Boolean(field && field.value);
  const evCount = hasValue && Array.isArray(field.evidence) ? field.evidence.length : 0;
  const firstEv = evCount > 0 ? field.evidence[0] : null;
  const page = firstEv && firstEv.page != null ? firstEv.page : null;
  const quote = firstEv && firstEv.quote != null ? String(firstEv.quote).slice(0, 160) : null;
  let status = "missing-optional";
  if (hasValue && evCount > 0) status = "supported";
  else if (hasValue) status = "unsourced";
  else if (isRequired) status = "missing-required";
  const def = fieldDef(key);
  return {
    key: key,
    label: def ? def.label : key,
    hasValue: hasValue,
    value: hasValue ? field.value : null,
    evidenceCount: evCount,
    page: page,
    quote: quote,
    status: status,
    required: Boolean(isRequired)
  };
}

function buildTrustReport(record, findings) {
  const fieldsObj = (record && record.fields) || {};
  const list = Array.isArray(findings) ? findings : [];
  const rows = FIELD_KEYS.map(function (key) {
    return fieldStatus(key, fieldsObj[key], REQUIRED_FIELDS.indexOf(key) !== -1);
  });
  const extracted = rows.filter(function (r) { return r.hasValue; }).length;
  const supported = rows.filter(function (r) { return r.status === "supported"; }).length;
  const missingRequired = rows.filter(function (r) { return r.status === "missing-required"; }).length;
  const unsourced = rows.filter(function (r) { return r.status === "unsourced"; }).length;
  const missingOptional = rows.filter(function (r) { return r.status === "missing-optional"; }).length;
  let errors = 0;
  let warnings = 0;
  list.forEach(function (fd) {
    if (fd && fd.severity === "error") errors += 1;
    else if (fd && fd.severity === "warning") warnings += 1;
  });
  let score = 100;
  score -= missingRequired * 12;
  score -= unsourced * 4;
  score -= Math.min(missingOptional, 8) * 2;
  score -= errors * 2;
  score -= warnings * 1;
  if (score < 0) score = 0;
  if (score > 100) score = 100;
  const review = missingRequired + unsourced + errors + warnings;
  return {
    score: Math.round(score),
    counts: {
      total: rows.length,
      extracted: extracted,
      supported: supported,
      missing: missingRequired,
      review: review
    },
    fields: rows,
    generatedAt: new Date().toISOString()
  };
}

module.exports = { buildTrustReport: buildTrustReport };
