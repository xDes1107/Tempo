"use strict";
// Tempo - on-demand AI review that also fixes what it flags.
// The deterministic trust report always renders first; this runs ONLY when
// the user picks a model and clicks Run AI review. Besides the score and
// findings, the model may propose corrections (better field values backed by
// verbatim evidence quotes). Evidenced corrections are merged into the record,
// then findings and trust are recomputed by the route, so the review visibly
// enhances the file output instead of only commenting on it.
// Results are cached on record.aiReview per run.

var FIELD_KEYS = [];
var makeEvidenceBase = function (page, quote) { return { page: page || 1, quote: String(quote || "").slice(0, 300) }; };
var migrateBase = function (r) { return r; };
var evidenceInSourceBase = function (ev, src) {
  var s = String(src || "").replace(/\s+/g, " ").trim().toLowerCase();
  var probe = String(ev || "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 80);
  return probe.length >= 12 && s.indexOf(probe) !== -1;
};
try {
  var schema = require("./schema");
  FIELD_KEYS = schema.FIELD_KEYS || [];
  makeEvidenceBase = schema.makeEvidence || makeEvidenceBase;
  migrateBase = schema.migrateRecord || migrateBase;
} catch (e) { /* standalone-test fallback */ }
try {
  var aiExtract = require("./ai-extract");
  if (aiExtract && aiExtract.evidenceInSource) evidenceInSourceBase = aiExtract.evidenceInSource;
} catch (e) { /* fallback above */ }

var MAX_CORRECTIONS = 10;

function buildAiReviewPrompt(record, trust) {
  const fields = {};
  const src = (record && record.fields) || {};
  Object.keys(src).forEach(function (k) {
    const f = src[k];
    fields[k] = {
      value: f ? f.value || null : null,
      unit: f ? f.unit || null : null,
      evidence: Array.isArray(f && f.evidence) ? f.evidence.slice(0, 2) : []
    };
  });
  const system = [
    "You are a quality reviewer for extracted product datasheet data.",
    "Given the extracted fields (with source evidence) and the deterministic",
    "trust report, return STRICT JSON only with this shape:",
    "{\"aiScore\": 0-100, \"aiFindings\": [{\"code\": \"STRING\", \"severity\": \"error|warning|info\", \"message\": \"STRING\", \"field\": \"key|null\"}], \"notes\": \"short string\",",
    "\"corrections\": [{\"key\": \"field key\", \"value\": \"better value\", \"unit\": \"STRING|null\", \"evidence\": \"verbatim quote\", \"reason\": \"short string\"}]}",
    "Rules: never invent values; only flag inconsistency, missing evidence,",
    "suspicious units, or likely extraction errors. IDs, numbers, units and",
    "certification codes are literal - do not propose translations of them.",
    "Propose a correction ONLY when the current value contradicts its evidence",
    "or the evidence clearly supports a better value (for example corporate",
    "boilerplate stored as manufacturer, or a year stored as a performance",
    "value). Every correction MUST carry a verbatim evidence quote copied",
    "word-for-word from the source evidence or the field text (max 300 chars);",
    "omit any correction you cannot evidence. Corrections may target any field",
    "key present in the input."
  ].join(" ");
  const user = JSON.stringify({ fields: fields, trust: { score: trust.score, counts: trust.counts } });
  return { system: system, user: user };
}

function normalizeAiResult(json, model) {
  const out = { model: model || null, aiScore: null, aiFindings: [], notes: "", corrections: [] };
  if (!json || typeof json !== "object") return out;
  if (typeof json.aiScore === "number") out.aiScore = Math.max(0, Math.min(100, Math.round(json.aiScore)));
  if (Array.isArray(json.aiFindings)) {
    out.aiFindings = json.aiFindings.slice(0, 20).map(function (f) {
      return {
        code: String((f && f.code) || "AI_FLAG"),
        severity: (f && (f.severity === "error" || f.severity === "warning" || f.severity === "info")) ? f.severity : "info",
        message: String((f && f.message) || ""),
        field: (f && f.field) || null
      };
    }).filter(function (f) { return f.message.length > 0; });
  }
  if (typeof json.notes === "string") out.notes = json.notes.slice(0, 500);
  if (Array.isArray(json.corrections)) {
    const known = {};
    FIELD_KEYS.forEach(function (k) { known[k] = true; });
    json.corrections.slice(0, MAX_CORRECTIONS).forEach(function (x) {
      if (!x || typeof x !== "object") return;
      if (typeof x.key !== "string" || !known[x.key]) return;
      if (typeof x.value !== "string" || !x.value.trim()) return;
      if (typeof x.evidence !== "string" || !x.evidence.trim()) return;
      out.corrections.push({
        key: x.key,
        value: x.value.trim().slice(0, 300),
        unit: (typeof x.unit === "string" && x.unit.trim()) ? x.unit.trim().slice(0, 20) : null,
        evidence: x.evidence.trim().slice(0, 300),
        reason: (typeof x.reason === "string") ? x.reason.slice(0, 200) : ""
      });
    });
  }
  return out;
}

function mergeAiCorrections(record, corrections, sourceText) {
  migrateBase(record);
  const applied = [];
  const skipped = [];
  (corrections || []).forEach(function (x) {
    if (!x || !record.fields[x.key]) { skipped.push({ key: (x && x.key) || null, reason: "unknown-field" }); return; }
    if (!evidenceInSourceBase(x.evidence, sourceText)) { skipped.push({ key: x.key, reason: "no-evidence" }); return; }
    const slot = record.fields[x.key];
    const current = slot && slot.value != null ? String(slot.value) : "";
    if (current === x.value) { skipped.push({ key: x.key, reason: "same-value" }); return; }
    record.fields[x.key] = {
      value: x.value,
      originalValue: x.value,
      unit: x.unit != null ? x.unit : slot.unit,
      evidence: [makeEvidenceBase(1, x.evidence)],
      translatable: slot.translatable,
      translation: null
    };
    applied.push({ key: x.key, reason: x.reason || "" });
  });
  if (applied.length && String(record.extractionEngine || "").indexOf("ai-review-fix") === -1) {
    record.extractionEngine = (record.extractionEngine || "unknown") + "+ai-review-fix-v1";
  }
  return { record: record, applied: applied, skipped: skipped };
}

async function runAiReview(record, trust, chatJsonFn, opts) {
  const o = opts || {};
  if (typeof chatJsonFn !== "function") throw new Error("chatJsonFn is required.");
  const prompt = buildAiReviewPrompt(record, trust);
  const res = await chatJsonFn(prompt.system, prompt.user, { model: o.model, temperature: 0 });
  const norm = normalizeAiResult(res.json, res.model);
  norm.rawModel = res.model || o.model || null;
  norm.applied = [];
  norm.skipped = [];
  if (o.sourceText && norm.corrections.length) {
    const merged = mergeAiCorrections(record, norm.corrections, o.sourceText);
    norm.applied = merged.applied;
    norm.skipped = merged.skipped;
  }
  return norm;
}

module.exports = { buildAiReviewPrompt: buildAiReviewPrompt, normalizeAiResult: normalizeAiResult, mergeAiCorrections: mergeAiCorrections, runAiReview: runAiReview };
