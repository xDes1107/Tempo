"use strict";
// Goal 3 translation - simple first step (Oct 28).
// Translates the validated record via the Meta Model API (same adapter as
// extraction). No OCR and no AI extraction here: the input is the existing
// deterministic record, the output fills the schema translation slots
// ({ lang, translatedValue }) on translatable fields only.
// Never translated: IDs, numbers, units, cert codes, non-translatable fields.
// Fluent website descriptions are translated alongside and cached on the
// record as translatedDescriptions { lang: text } (rebuilt from fields is not
// fluent, so the API translation is kept).

const { fieldDef } = require("./schema");
const { buildWebsiteDescription } = require("./enrich");

const TARGET_LANGS = ["en", "pt", "es"];
const LANG_NAMES = { en: "English", pt: "Portuguese", es: "Spanish" };

function translatableEntries(record) {
  const out = {};
  if (!record || !record.fields) return out;
  Object.keys(record.fields).forEach(function (key) {
    const def = fieldDef(key);
    const f = record.fields[key];
    if (def && def.translatable && f && f.value) out[key] = f.value;
  });
  return out;
}

function buildTranslatePrompt(record, targetLang, websiteDescription) {
  const langName = LANG_NAMES[targetLang] || targetLang;
  const system = [
    "You translate supplier datasheet field values into " + langName + ".",
    "Input JSON: { fields: { key: sourceText }, websiteDescription: string }.",
    "Output JSON only: { fields: { key: translatedText }, websiteDescription: translatedString }.",
    "Rules: translate meaning faithfully; keep product identifiers, model and reference codes,",
    "numeric values, units of measure, and standards and certification codes",
    "(e.g. EN 388, ISO 13997) EXACTLY as in the source, even inside translated sentences;",
    "if a value is already a code, number, or proper name with no translation, return it unchanged;",
    "translate every key provided, add none, no commentary."
  ].join(" ");
  const user = JSON.stringify({
    targetLang: targetLang,
    fields: translatableEntries(record),
    websiteDescription: websiteDescription || buildWebsiteDescription(record)
  });
  return { system: system, user: user };
}

function applyTranslations(record, targetLang, map) {
  const applied = [];
  if (!record || !record.fields || !map) return applied;
  Object.keys(map).forEach(function (key) {
    const def = fieldDef(key);
    const f = record.fields[key];
    if (!def || !def.translatable || !f || !f.value) return;
    const t = map[key];
    if (typeof t !== "string" || !t.trim()) return;
    f.translation = { lang: targetLang, translatedValue: t.trim() };
    applied.push(key);
  });
  return applied;
}

function recordWithTranslations(record, lang) {
  const clone = JSON.parse(JSON.stringify(record));
  Object.keys(clone.fields || {}).forEach(function (key) {
    const f = clone.fields[key];
    if (f && f.translation && f.translation.lang === lang && f.translation.translatedValue) {
      f.value = f.translation.translatedValue;
    }
  });
  return clone;
}

async function translateRecord(record, targetLang, chatJson, websiteDescription) {
  if (TARGET_LANGS.indexOf(targetLang) === -1) {
    throw new Error("Unsupported language: " + targetLang + ". Use one of: " + TARGET_LANGS.join(", "));
  }
  const entries = translatableEntries(record);
  const sourceDescription = websiteDescription || buildWebsiteDescription(record);
  if (!Object.keys(entries).length) {
    return { applied: [], translatedDescription: sourceDescription, note: "No translatable values in this record." };
  }
  const prompt = buildTranslatePrompt(record, targetLang, sourceDescription);
  const res = await chatJson(prompt.system, prompt.user, { temperature: 0 });
  const json = (res && res.json) || {};
  const applied = applyTranslations(record, targetLang, json.fields || {});
  const translatedDescription = (typeof json.websiteDescription === "string" && json.websiteDescription.trim())
    ? json.websiteDescription.trim()
    : null;
  return { applied: applied, translatedDescription: translatedDescription, model: (res && res.model) || null };
}

module.exports = {
  TARGET_LANGS: TARGET_LANGS,
  LANG_NAMES: LANG_NAMES,
  translatableEntries: translatableEntries,
  buildTranslatePrompt: buildTranslatePrompt,
  applyTranslations: applyTranslations,
  translateRecord: translateRecord,
  recordWithTranslations: recordWithTranslations
};
