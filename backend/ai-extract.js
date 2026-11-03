"use strict";
// DataForge - manual AI retry over the AI-standard record.
// The deterministic regex record always renders first; this runs ONLY when
// the user clicks Re-run AI extraction (AI-standard already ran on upload). The model fills missing fields and may
// correct known misfire fields (manufacturer noise, protection year-as-value,
// categorization which has no deterministic finder). Every AI value needs a
// verbatim evidence quote from the source text or it is dropped on merge.
// Downstream outputs (trust, company sheet, JSON, Excel, translation) reuse
// the merged record untouched, so they all benefit automatically.

var FIELD_KEYS = [];
var makeEvidenceBase = function (page, quote) { return { page: page || 1, quote: String(quote || "").slice(0, 300) }; };
var migrateBase = function (r) { return r; };
try {
  var schema = require("./schema");
  FIELD_KEYS = schema.FIELD_KEYS || [];
  makeEvidenceBase = schema.makeEvidence || makeEvidenceBase;
  migrateBase = schema.migrateRecord || migrateBase;
} catch (e) { /* standalone-test fallback */ }

var CORRECTABLE = ["manufacturer", "protectionLevelsOrPerformance", "categorization"];
var MAX_SOURCE_CHARS = 8000;
var MAX_VALUE_CHARS = 300;

function hasValue(field) {
  return Boolean(field && field.value != null && String(field.value).trim() !== "");
}

function missingKeys(record) {
  var fields = (record && record.fields) || {};
  return FIELD_KEYS.filter(function (k) { return !hasValue(fields[k]); });
}

function correctableKeys(record) {
  var fields = (record && record.fields) || {};
  return CORRECTABLE.filter(function (k) { return fields[k] && hasValue(fields[k]); });
}

function buildAiExtractPrompt(record, sourceText) {
  var missing = missingKeys(record);
  var correctable = correctableKeys(record).map(function (k) {
    return { key: k, currentValue: record.fields[k].value };
  });
  var system = [
    "You extract product datasheet fields from supplier PDF text.",
    "A deterministic extractor already ran; you ONLY fill the listed missing fields,",
    "and you MAY propose a better value for the listed correctable fields when the",
    "current value looks like noise (corporate capital text, a year read as a",
    "performance value, an empty placeholder).",
    "Return STRICT JSON only with this shape:",
    "{\"fields\": {\"<key>\": {\"value\": \"STRING\", \"unit\": \"STRING|null\", \"evidence\": \"verbatim quote\"}}}",
    "Rules: every returned field MUST include a verbatim evidence quote copied",
    "word-for-word from the source text (max 300 chars); omit any field you cannot",
    "evidence - never invent values, manufacturers, codes, or quantities. Keep",
    "product identifiers, model and reference codes, numeric values, units of measure,",
    "standards and certification codes (for example EN 388, ISO 13997), barcodes and",
    "order quantities EXACTLY as written in the source. Value max 300 chars. Only return",
    "keys from the missing and correctable lists - never add other keys."
  ].join(" ");
  var user = JSON.stringify({
    missing: missing,
    correctable: correctable,
    sourceText: String(sourceText || "").slice(0, MAX_SOURCE_CHARS)
  });
  return { system: system, user: user, missing: missing, correctable: correctable.map(function (x) { return x.key; }) };
}

function normalizeAiExtract(json, targets) {
  var out = {};
  if (!json || typeof json !== "object" || !json.fields || typeof json.fields !== "object") return out;
  var allowed = {};
  (targets || []).forEach(function (k) { allowed[k] = true; });
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

function normSpace(s) {
  return String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function evidenceInSource(evidence, sourceText) {
  var src = normSpace(sourceText);
  if (!src) return false;
  var probe = normSpace(evidence).slice(0, 80);
  if (probe.length < 12) return false;
  if (src.indexOf(probe) !== -1) return true;
  var head = normSpace(evidence).slice(0, 40);
  return head.length >= 12 && src.indexOf(head) !== -1;
}

function mergeAiExtract(record, normalized, sourceText, model) {
  migrateBase(record);
  var applied = [];
  var skipped = [];
  Object.keys(normalized || {}).forEach(function (key) {
    var cand = normalized[key];
    if (!record.fields[key]) { skipped.push({ key: key, reason: "unknown-field" }); return; }
    if (!evidenceInSource(cand.evidence, sourceText)) { skipped.push({ key: key, reason: "no-evidence" }); return; }
    var slot = record.fields[key];
    if (!hasValue(slot)) {
      record.fields[key] = {
        value: cand.value,
        originalValue: cand.value,
        unit: cand.unit,
        evidence: [makeEvidenceBase(1, cand.evidence)],
        translatable: slot.translatable,
        translation: null
      };
      applied.push({ key: key, kind: "fill" });
    } else if (CORRECTABLE.indexOf(key) !== -1 && String(slot.value) !== cand.value) {
      record.fields[key] = {
        value: cand.value,
        originalValue: cand.value,
        unit: cand.unit != null ? cand.unit : slot.unit,
        evidence: [makeEvidenceBase(1, cand.evidence)],
        translatable: slot.translatable,
        translation: null
      };
      applied.push({ key: key, kind: "correction" });
    } else {
      skipped.push({ key: key, reason: "already-valued" });
    }
  });
  if (applied.length && record.extractionEngine.indexOf("ai-enhance") === -1) {
    record.extractionEngine = record.extractionEngine + "+ai-enhance-v1";
  }
  record.aiExtract = {
    model: model || null,
    applied: applied,
    skipped: skipped,
    at: new Date().toISOString()
  };
  return { record: record, applied: applied, skipped: skipped };
}

async function runAiExtract(record, sourceText, chatJsonFn, opts) {
  var o = opts || {};
  if (typeof chatJsonFn !== "function") throw new Error("chatJsonFn is required.");
  var prompt = buildAiExtractPrompt(record, sourceText);
  if (!prompt.missing.length && !prompt.correctable.length) {
    return { model: o.model || null, applied: [], skipped: [], note: "Nothing to enhance: all fields already valued." };
  }
  var res = await chatJsonFn(prompt.system, prompt.user, { model: o.model, temperature: 0 });
  var targets = prompt.missing.concat(prompt.correctable);
  var normalized = normalizeAiExtract(res.json, targets);
  var merged = mergeAiExtract(record, normalized, sourceText, res.model || o.model || null);
  merged.model = res.model || o.model || null;
  return merged;
}

module.exports = {
  CORRECTABLE: CORRECTABLE,
  MAX_SOURCE_CHARS: MAX_SOURCE_CHARS,
  missingKeys: missingKeys,
  correctableKeys: correctableKeys,
  buildAiExtractPrompt: buildAiExtractPrompt,
  normalizeAiExtract: normalizeAiExtract,
  evidenceInSource: evidenceInSource,
  mergeAiExtract: mergeAiExtract,
  runAiExtract: runAiExtract
};
