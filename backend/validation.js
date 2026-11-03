"use strict";
// Deterministic data-quality checks over the 11-field schema (v2.1).
// AI may flag ambiguity later, but these rules always run in code
// (Architecture 3.6). Each finding: code, severity, message, field, evidence.
// Backward compat: v2.0 10-field records pass; missing OPTIONAL field is
// info only, missing REQUIRED field is still an error.

const { FIELD_KEYS, fieldDef } = require("./schema");

const REQUIRED_FIELDS = ["productName", "manufacturer", "modelOrReference"];

function finding(code, severity, message, field, evidence) {
  return { code: code, severity: severity, message: message, field: field, evidence: evidence || [] };
}

function validateRecord(record) {
  const findings = [];
  if (!record || !record.fields) {
    return [finding("INVALID_RECORD", "error", "Record has no fields object.", null)];
  }

  FIELD_KEYS.forEach(function (key) {
    if (!(key in record.fields)) {
      const def = fieldDef(key);
      if (def && def.required) {
        findings.push(finding("UNKNOWN_SCHEMA", "error", "Record is missing locked field: " + key + ".", key));
      } else {
        findings.push(finding("MISSING_OPTIONAL_FIELD", "info", "Record has no optional field: " + key + " (v2.0 record?).", key));
      }
    }
  });

  REQUIRED_FIELDS.forEach(function (key) {
    if (!record.fields[key] || !record.fields[key].value) {
      findings.push(finding("MISSING_REQUIRED_FIELD", "warning", key + " is required but was not found.", key));
    }
  });

  Object.entries(record.fields).forEach(function (entry) {
    const key = entry[0];
    const item = entry[1];
    const def = fieldDef(key);
    if (!item || !item.value) return;
    if (item.unit && !/^[A-Za-z%\/\-.]+$/.test(item.unit)) {
      findings.push(finding("INVALID_UNIT", "warning", "The unit for " + key + " is not recognised: " + item.unit + ".", key, item.evidence));
    }
    if (def && !def.allowsUnit && item.unit) {
      findings.push(finding("UNEXPECTED_UNIT", "info", key + " does not normally carry a unit, got: " + item.unit + ".", key, item.evidence));
    }
    if (!item.evidence || item.evidence.length === 0) {
      findings.push(finding("MISSING_EVIDENCE", "info", key + " has no source evidence.", key));
    }
    if (!item.originalValue) {
      findings.push(finding("MISSING_ORIGINAL_VALUE", "info", key + " is missing its verbatim original value.", key, item.evidence));
    }
  });

  return findings;
}

module.exports = { REQUIRED_FIELDS: REQUIRED_FIELDS, validateRecord: validateRecord };

