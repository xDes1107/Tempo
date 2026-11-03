"use strict";
// DataForge - AI-standard extraction with deterministic fallback.
// Upload path: AI attempts ALL 16 schema fields first (Meta Model API),
// deterministic regex fills whatever AI leaves empty or unevidenced.
// AI never throws: missing key, network error, or empty source all fall
// back to the deterministic record so uploads and offline tests keep working.
// Every AI value needs a verbatim evidence quote or it is dropped.
// Provenance is stored on record.aiStandard { aiFields, deterministicFields }.

var FIELD_KEYS = [];
var createEmptyRecordBase = null;
var makeEvidenceBase = null;
var migrateBase = function (r) { return r; };
var extractDeterministicBase = null;
var evidenceInSourceBase = null;
try {
  var schema = require("./schema");
  FIELD_KEYS = schema.FIELD_KEYS || [];
  createEmptyRecordBase = schema.createEmptyRecord;
  makeEvidenceBase = schema.makeEvidence;
  migrateBase = schema.migrateRecord || migrateBase;
} catch (e) { /* standalone fallback */ }
try { extractDeterministicBase = require("./extractor").extractProductData; } catch (e) { /* fallback below */ }
try { evidenceInSourceBase = require("./ai-extract").evidenceInSource; } catch (e) {
  evidenceInSourceBase = function (ev, src) {
    var s = String(src || "").replace(/\s+/g, " ").trim().toLowerCase();
    var probe = String(ev || "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 80);
    return probe.length >= 12 && s.indexOf(probe) !== -1;
  };
}

var AI_STANDARD_ENGINE = "ai-standard-v1";
var DETERMINISTIC_ENGINE = "deterministic-rules-v2.2";
var MAX_SOURCE_CHARS = 8000;
var MAX_VALUE_CHARS = 300;

function hasValue(field) {
  return Boolean(field && field.value != null && String(field.value).trim() !== "");
}

function buildAiStandardPrompt(sourceText) {
  var system = [
    "You extract product datasheet fields from supplier PDF text.",
    "You are the PRIMARY extractor: attempt every listed field.",
    "A deterministic regex runs after you as fallback, so omit anything you cannot evidence.",
    "Return STRICT JSON only with this shape:",
    "{\"fields\": {\"<key>\": {\"value\": \"STRING\", \"unit\": \"STRING|null\", \"evidence\": \"verbatim quote\"}}}",
    "Keys (use exactly these): " + FIELD_KEYS.join(", ") + ".",
    "Rules: every returned field MUST include a verbatim evidence quote copied",
    "word-for-word from the source text (max 300 chars); omit any field you cannot",
    "evidence - never invent values, manufacturers, codes, or quantities. Keep",
    "product identifiers, model and reference codes, numeric values, units of measure,",
    "standards and certification codes (for example EN 388, ISO 13997), barcodes and",
    "order quantities EXACTLY as written in the source. Value max 300 chars."
  ].join(" ");
  var user = JSON.stringify({ fields: FIELD_KEYS, sourceText: String(sourceText || "").slice(0, MAX_SOURCE_CHARS) });
  return { system: system, user: user };
}

function normalizeAiStandard(json) {
  var out = {};
  if (!json || typeof json !== "object" || !json.fields || typeof json.fields !== "object") return out;
  var allowed = {};
  FIELD_KEYS.forEach(function (k) { allowed[k] = true; });
  Object.keys(json.fields).forEach(function (key) {
    if (!allowed[key]) return;
    var f = json.fields[key];
    if (!f || typeof f !== "object") return;
    if (typeof f.value !== "string" || !f.value.trim()) return;
    if (typeof f.evidence !== "string" || !f.evidence.trim()) return;
    out[key] = {
      value: f.value.trim().slice(0, MAX_VALUE_CHARS),
      unit: (typeof f.unit === "string" && f.unit.trim()) ? f.unit.trim().slice(0, 20) : null,
      evidence: f.evidence.trim().slice(0, 300)
    };
  });
  return out;
}

function emptyRecord(fileName, engine) {
  if (typeof createEmptyRecordBase === "function") return createEmptyRecordBase(fileName, engine);
  var fields = {};
  FIELD_KEYS.forEach(function (k) {
    fields[k] = { value: null, originalValue: null, unit: null, evidence: [], translatable: false, translation: null };
  });
  return { schemaVersion: "2.2.0-2026-10-30", documentName: fileName || null, extractionEngine: engine, fields: fields };
}

function mergeAiStandard(normalized, sourceText, deterministicRecord, fileName, model) {
  var record = emptyRecord(fileName, AI_STANDARD_ENGINE);
  if (typeof migrateBase === "function") migrateBase(record);
  var aiFields = [];
  var deterministicFields = [];
  var skipped = [];
  FIELD_KEYS.forEach(function (key) {
    var cand = (normalized || {})[key];
    var det = deterministicRecord && deterministicRecord.fields ? deterministicRecord.fields[key] : null;
    if (cand && evidenceInSourceBase(cand.evidence, sourceText)) {
      record.fields[key] = {
        value: cand.value,
        originalValue: cand.value,
        unit: cand.unit,
        evidence: [makeEvidenceBase(1, cand.evidence)],
        translatable: record.fields[key] ? record.fields[key].translatable : false,
        translation: null
      };
      aiFields.push(key);
    } else {
      if (cand) skipped.push({ key: key, reason: "no-evidence" });
      if (det && hasValue(det)) {
        record.fields[key] = {
          value: det.value,
          originalValue: det.originalValue != null ? det.originalValue : det.value,
          unit: det.unit != null ? det.unit : null,
          evidence: Array.isArray(det.evidence) ? det.evidence : [],
          translatable: record.fields[key] ? record.fields[key].translatable : (det.translatable || false),
          translation: null
        };
        deterministicFields.push(key);
      } else if (cand && !skipped.some(function (x) { return x.key === key; })) {
        skipped.push({ key: key, reason: "empty-fallback" });
      }
    }
  });
  if (deterministicFields.length) record.extractionEngine = AI_STANDARD_ENGINE + "+deterministic-fallback";
  record.aiStandard = {
    model: model || null,
    aiFields: aiFields,
    deterministicFields: deterministicFields,
    skipped: skipped,
    at: new Date().toISOString()
  };
  return { record: record, aiFields: aiFields, deterministicFields: deterministicFields, skipped: skipped };
}

function deterministicOnly(sourceText, fileName, note) {
  var rec = null;
  if (typeof extractDeterministicBase === "function") {
    rec = extractDeterministicBase(sourceText, fileName);
  } else {
    rec = emptyRecord(fileName, DETERMINISTIC_ENGINE);
  }
  rec.extractionEngine = DETERMINISTIC_ENGINE + " (AI unavailable: " + note + ")";
  rec.aiStandard = { model: null, aiFields: [], deterministicFields: [], skipped: [], at: new Date().toISOString(), note: note };
  return { record: rec, note: note };
}

async function runStandardExtraction(sourceText, fileName, chatJsonFn, opts) {
  var o = opts || {};
  if (!sourceText || !String(sourceText).trim()) {
    return deterministicOnly(sourceText, fileName, "empty-source");
  }
  if (typeof chatJsonFn !== "function") {
    return deterministicOnly(sourceText, fileName, "no-ai-adapter");
  }
  if (!o.allowNoKey) {
    try {
      var getCfg = require("./meta-api").getConfig;
      var cfg = getCfg();
      if (!cfg.apiKey) return deterministicOnly(sourceText, fileName, "missing-key");
    } catch (e) { return deterministicOnly(sourceText, fileName, "missing-key"); }
  }
  var det = null;
  try {
    det = typeof extractDeterministicBase === "function" ? extractDeterministicBase(sourceText, fileName) : emptyRecord(fileName, DETERMINISTIC_ENGINE);
  } catch (e) { det = emptyRecord(fileName, DETERMINISTIC_ENGINE); }
  try {
    var prompt = buildAiStandardPrompt(sourceText);
    var res = await chatJsonFn(prompt.system, prompt.user, { model: o.model, temperature: 0 });
    var normalized = normalizeAiStandard(res.json);
    var merged = mergeAiStandard(normalized, sourceText, det, fileName, res.model || o.model || null);
    merged.note = "AI standard: " + merged.aiFields.length + " AI + " + merged.deterministicFields.length + " deterministic fallback.";
    merged.model = res.model || o.model || null;
    return merged;
  } catch (e) {
    det.extractionEngine = DETERMINISTIC_ENGINE + " (AI failed, fallback served: " + String(e && e.message || e).slice(0, 120) + ")";
    det.aiStandard = { model: o.model || null, aiFields: [], deterministicFields: [], skipped: [], at: new Date().toISOString(), note: String(e && e.message || e).slice(0, 200) };
    return { record: det, note: det.aiStandard.note, aiFields: [], deterministicFields: [] };
  }
}

module.exports = {
  AI_STANDARD_ENGINE: AI_STANDARD_ENGINE,
  DETERMINISTIC_ENGINE: DETERMINISTIC_ENGINE,
  MAX_SOURCE_CHARS: MAX_SOURCE_CHARS,
  buildAiStandardPrompt: buildAiStandardPrompt,
  normalizeAiStandard: normalizeAiStandard,
  mergeAiStandard: mergeAiStandard,
  runStandardExtraction: runStandardExtraction
};
