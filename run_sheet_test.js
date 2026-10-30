const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert");
const { extractProductData } = require("./backend/extractor");
const { validateRecord } = require("./backend/validation");
const { applyTranslations } = require("./backend/translate");
const { buildEnrichment } = require("./backend/enrich");
const mod = require("./backend/company-template");

async function main() {
  let record;
  try {
    const { PDFParse } = require("pdf-parse");
    const buf = fs.readFileSync("sample-pdfs/synthetic-glove-sample.pdf");
    const parser = new PDFParse({ data: buf });
    const parsed = await parser.getText();
    await parser.destroy();
    record = extractProductData(parsed.text || "", "synthetic-glove-sample.pdf");
    console.log("record from real sample PDF, fields valued: " +
      Object.keys(record.fields).filter(function (k) { return record.fields[k].value; }).join(","));
  } catch (e) {
    throw new Error("sample extract failed: " + e.message);
  }
  const findings = validateRecord(record);

  // 1. source-only sheet
  const src = await mod.buildCompanySheet(record, findings, { companyName: "Meta", jobId: "test-1" });
  assert.ok(Buffer.isBuffer(src), "source sheet is a Buffer");
  assert.strictEqual(src.subarray(0, 4).toString("ascii"), "%PDF", "source sheet is a PDF");

  // 2. translated sheet (fake PT slots, same shape as translate endpoint output)
  const applied = applyTranslations(record, "pt", {
    productName: "Luva de teste",
    categoryOrIntendedUse: "Uso industrial",
    materials: "Materiais de teste",
    usageRestrictionsOrWarnings: "Restricoes de teste",
    industriesOrApplications: "Industria alimentar"
  });
  record.translatedDescriptions = { pt: "Descricao fluente de teste." };
  const pt = await mod.buildCompanySheet(record, findings, { lang: "pt", companyName: "Meta", jobId: "test-1" });
  assert.strictEqual(pt.subarray(0, 4).toString("ascii"), "%PDF", "pt sheet is a PDF");
  assert.ok(applied.length > 0, "translation slots filled: " + applied.join(","));

  // 3. watermarked sheet with the real logo
  const logo = fs.readFileSync("misc/Meta.png");
  const wm = await mod.buildCompanySheet(record, findings, {
    lang: "pt", companyName: "Meta", jobId: "test-1",
    logoPngBytes: logo, watermarkPngBytes: logo, watermarkOpacity: 0.08
  });
  assert.strictEqual(wm.subarray(0, 4).toString("ascii"), "%PDF", "watermarked sheet is a PDF");
  assert.ok(wm.length > pt.length, "watermarked sheet embeds the logo (" + wm.length + " > " + pt.length + ")");

  // 4. company name default + env override
  delete process.env.COMPANY_NAME;
  assert.strictEqual(mod.readCompanyName(), "Meta", "default company name");
  process.env.COMPANY_NAME = "Acme Co";
  assert.strictEqual(mod.readCompanyName(), "Acme Co", "env override");
  delete process.env.COMPANY_NAME;

  // 5. empty record does not crash (always downloadable)
  const { createEmptyRecord } = require("./backend/schema");
  const empty = await mod.buildCompanySheet(createEmptyRecord("empty.pdf", "test"), [], { companyName: "Meta" });
  assert.strictEqual(empty.subarray(0, 4).toString("ascii"), "%PDF", "empty-record sheet is a PDF");

  fs.mkdirSync("data/tmp", { recursive: true });
  fs.writeFileSync("data/tmp/test-company-sheet-source.pdf", src);
  fs.writeFileSync("data/tmp/test-company-sheet-pt.pdf", pt);
  fs.writeFileSync("data/tmp/test-company-sheet-wm.pdf", wm);
  console.log("sizes (bytes): source=" + src.length + " pt=" + pt.length + " watermarked=" + wm.length);
  console.log("ALL COMPANY-TEMPLATE TESTS PASSED");
}
main().catch(function (e) { console.error("TEST FAILED: " + (e.stack || e.message)); process.exit(1); });
