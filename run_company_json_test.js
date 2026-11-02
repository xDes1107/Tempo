const fs = require("node:fs");
const assert = require("node:assert");
const { PDFParse } = require("pdf-parse");
const { extractProductData } = require("./backend/extractor");
const { validateRecord } = require("./backend/validation");
const { applyTranslations } = require("./backend/translate");
const { FIELD_KEYS } = require("./backend/schema");
const mod = require("./backend/company-json");

async function main() {
  const buf = fs.readFileSync("sample-pdfs/synthetic-glove-sample.pdf");
  const parser = new PDFParse({ data: buf });
  const parsed = await parser.getText();
  await parser.destroy();
  const record = extractProductData(parsed.text || "", "synthetic-glove-sample.pdf");
  const findings = validateRecord(record);
  applyTranslations(record, "pt", { productName: "Luva de teste", materials: "Materiais de teste" });
  record.translatedDescriptions = { pt: "Descricao fluente de teste." };
  const job = {
    id: "test-json-1",
    record: record,
    findings: findings,
    status: "completed",
    pageCount: null,
    createdAt: "2026-10-29T00:00:00.000Z",
    completedAt: "2026-10-29T00:01:00.000Z",
    filePath: "data/uploads/test-json-1.pdf",
    watermarkOptions: { position: "upper-right", opacity: 0.15 }
  };
  record.fields.colors.value = "Midnight blue";
  record.fields.colors.originalValue = "Colour: Midnight blue";
  record.fields.categorization.value = "PPE -> GLOVES -> Anticut protection";
  record.fields.categorization.originalValue = "PPE -> GLOVES -> Anticut protection";
  record.fields.ean.value = "4006381333931";
  record.fields.ean.originalValue = "EAN: 4006381333931";
  record.fields.orderInfo.value = "Box of 100";
  record.fields.orderInfo.originalValue = "Box of 100";
  const doc = mod.buildCompanyJson(job, { companyName: "Meta", generatedAt: "2026-10-29T00:00:00.000Z" });

  assert.strictEqual(doc.artifact, "dataforge/company-document");
  assert.strictEqual(doc.artifactVersion, mod.ARTIFACT_VERSION);
  assert.strictEqual(doc.jobId, "test-json-1");
  assert.strictEqual(doc.companyName, "Meta");
  assert.strictEqual(doc.fields.colors.value, "Midnight blue");
  assert.strictEqual(doc.fields.categorization.value, "PPE -> GLOVES -> Anticut protection");
  assert.strictEqual(doc.fields.ean.value, "4006381333931");
  assert.strictEqual(doc.fields.orderInfo.value, "Box of 100");
  assert.strictEqual(doc.erp.ean, "4006381333931");
  assert.strictEqual(doc.erp.colors, "Midnight blue");
  assert.strictEqual(doc.erp.orderInfo, "Box of 100");
  FIELD_KEYS.forEach(function (k) { assert.ok(doc.fields[k], "field present: " + k); });
  assert.ok(doc.fields.productName.value, "productName valued");
  assert.strictEqual(doc.fields.productName.translation.translatedValue, "Luva de teste");
  assert.strictEqual(doc.descriptions.translated.pt, "Descricao fluente de teste.");
  assert.ok(doc.descriptions.source.length > 0, "source description built");
  assert.ok(Array.isArray(doc.findings), "findings array");
  assert.ok(doc.erp && doc.erp.websiteDescription, "ERP row with website description");
  assert.ok(doc.translationPolicy.doNotTranslate.length > 0, "never-translate policy included");
  assert.deepStrictEqual(doc.documentControl.translatedLanguages, ["pt"]);
  assert.strictEqual(doc.documentControl.watermark.position, "upper-right");

  const body = JSON.stringify(doc, null, 2);
  const back = JSON.parse(body);
  assert.strictEqual(back.fields.productName.value, doc.fields.productName.value);

  let threw = false;
  try { mod.buildCompanyJson({ id: "x" }, {}); } catch (e) { threw = true; }
  assert.ok(threw, "missing record throws");

  fs.mkdirSync("data/tmp", { recursive: true });
  fs.writeFileSync("data/tmp/test-company.json", body);
  console.log("company JSON bytes: " + body.length);
  console.log("ALL COMPANY-JSON TESTS PASSED");
}
main().catch(function (e) { console.error("TEST FAILED: " + (e.stack || e.message)); process.exit(1); });
