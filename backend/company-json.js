"use strict";
// Day 29 - canonical company JSON artifact (ERP + AI handoff).
// buildCompanyJson(job, options) -> plain JSON-safe object.
// One envelope around the locked-schema record, translations, website
// descriptions, quality findings, and the ERP flat row, so ERP importers
// and the future AI visual-translation step read a single file instead of
// combining the json / csv / report endpoints by hand.
// No AI call here: this only repackages stored job data (works offline).

const { migrateRecord, SCHEMA_VERSION, FIELD_KEYS, DO_NOT_TRANSLATE } = require("./schema");
const { buildEnrichment, buildWebsiteDescription } = require("./enrich");
const { TARGET_LANGS } = require("./translate");
const { readCompanyName } = require("./company-template");

const ARTIFACT_TYPE = "dataforge/company-document";
const ARTIFACT_VERSION = "1.1.0-2026-10-30";

function buildCompanyJson(job, options) {
  const opts = options || {};
  if (!job || !job.record) {
    throw new Error("Job has no record yet.");
  }
  const record = migrateRecord(job.record);
  const findings = Array.isArray(job.findings) ? job.findings : [];
  const enriched = buildEnrichment(record, findings);
  const stored = record.translatedDescriptions || {};
  const translated = {};
  TARGET_LANGS.forEach(function (lang) {
    if (stored[lang]) translated[lang] = stored[lang];
  });

  return {
    artifact: ARTIFACT_TYPE,
    artifactVersion: ARTIFACT_VERSION,
    generatedAt: opts.generatedAt || new Date().toISOString(),
    companyName: opts.companyName || readCompanyName(),
    jobId: job.id || opts.jobId || null,
    documentControl: {
      sourceDocument: record.documentName || null,
      storedPdf: job.filePath || null,
      schemaVersion: record.schemaVersion || SCHEMA_VERSION,
      extractionEngine: record.extractionEngine || null,
      jobStatus: job.status || null,
      pageCount: job.pageCount != null ? job.pageCount : null,
      createdAt: job.createdAt || null,
      completedAt: job.completedAt || null,
      watermark: job.watermarkOptions || null,
      translatedLanguages: Object.keys(translated)
    },
    fields: record.fields,
    descriptions: {
      source: enriched.websiteDescription || buildWebsiteDescription(record),
      translated: translated
    },
    findings: findings,
    erp: enriched.erpRow,
    translationPolicy: {
      supportedLanguages: TARGET_LANGS,
      doNotTranslate: DO_NOT_TRANSLATE
    }
  };
}

module.exports = {
  buildCompanyJson: buildCompanyJson,
  ARTIFACT_TYPE: ARTIFACT_TYPE,
  ARTIFACT_VERSION: ARTIFACT_VERSION
};
