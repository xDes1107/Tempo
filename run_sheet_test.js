const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert");
const zlib = require("node:zlib");
const { extractProductData } = require("./backend/extractor");
const { validateRecord } = require("./backend/validation");
const { applyTranslations } = require("./backend/translate");
const { buildEnrichment } = require("./backend/enrich");
const { createEmptyRecord } = require("./backend/schema");
const { extractProductImage } = require("./backend/product-image");
const mod = require("./backend/company-template");

function hexDecode(s) {
  return s.replace(/<([0-9A-Fa-f]+)>/g, function (m, h) {
    const even = h.length % 2 === 0 ? h : h + "0";
    let out = "";
    for (let i = 0; i < even.length; i += 2) {
      out += String.fromCharCode(parseInt(even.substr(i, 2), 16));
    }
    return out;
  });
}

function pdfText(buf) {
  const out = [];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  const raw = buf.toString("latin1");
  let m;
  while ((m = re.exec(raw)) !== null) {
    try {
      out.push(hexDecode(zlib.inflateSync(Buffer.from(m[1], "latin1")).toString("latin1")));
    } catch (e) { out.push(m[1]); }
  }
  return out.join("\n");
}

function setTestField(record, key, value) {
  record.fields[key] = {
    value: value,
    originalValue: value,
    unit: null,
    evidence: [],
    translatable: record.fields[key].translatable,
    translation: null
  };
}

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

  // 1. source-only sheet: Meta hero layout, taxonomy placeholder, no Ordering.
  const src = await mod.buildCompanySheet(record, findings, { companyName: "Meta", jobId: "test-1" });
  assert.ok(Buffer.isBuffer(src), "source sheet is a Buffer");
  assert.strictEqual(src.subarray(0, 4).toString("ascii"), "%PDF", "source sheet is a PDF");
  const srcText = pdfText(src);
  assert.ok(srcText.indexOf("Meta") !== -1, "Meta header renders");
  assert.ok(srcText.indexOf("Categorization") !== -1, "categorization row renders");
  assert.ok(srcText.indexOf("taxonomy upload pending") !== -1, "taxonomy placeholder renders");
  assert.ok(srcText.indexOf("Norms") !== -1, "norms label renders");
  assert.ok(srcText.indexOf("Product image") !== -1, "image placeholder renders without product bytes");
  assert.ok(srcText.indexOf("Ordering") === -1, "ordering block hidden when nothing found");

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

  // 3. commercial record: new v2.2 fields valued -> Ordering block, no placeholder.
  const comm = createEmptyRecord("commercial.pdf", "test");
  setTestField(comm, "productName", "Test Glove");
  setTestField(comm, "manufacturer", "Test Maker");
  setTestField(comm, "description", "Cut-resistant glove for assembly work.");
  setTestField(comm, "colors", "Midnight blue");
  setTestField(comm, "categorization", "PPE -> GLOVES -> Anticut protection");
  setTestField(comm, "ean", "4006381333931");
  setTestField(comm, "orderInfo", "Box of 100");
  const commSheet = await mod.buildCompanySheet(comm, [], { companyName: "Meta", jobId: "test-comm" });
  assert.strictEqual(commSheet.subarray(0, 4).toString("ascii"), "%PDF", "commercial sheet is a PDF");
  const commText = pdfText(commSheet);
  assert.ok(commText.indexOf("Ordering") !== -1, "ordering block renders when found");
  assert.ok(commText.indexOf("4006381333931") !== -1, "EAN renders");
  assert.ok(commText.indexOf("Midnight blue") !== -1, "colors render");
  assert.ok(commText.indexOf("PPE") !== -1, "categorization renders");
  assert.ok(commText.indexOf("taxonomy upload pending") === -1, "placeholder hidden when categorized");

  // 4. Meta logo + watermark + real product image (JPEG from activarmr sample).
  const logo = fs.readFileSync("misc/Meta.png");
  const actBytes = fs.readFileSync("sample-pdfs/activarmr-80-813_pds_pt.pdf");
  const prodImg = await extractProductImage(actBytes);
  assert.ok(prodImg && prodImg.length > 2000, "product image extracted from sample PDF");
  const wm = await mod.buildCompanySheet(record, findings, {
    lang: "pt", companyName: "Meta", jobId: "test-1",
    logoPngBytes: logo, watermarkPngBytes: logo, watermarkOpacity: 0.08,
    productImageBytes: prodImg
  });
  assert.strictEqual(wm.subarray(0, 4).toString("ascii"), "%PDF", "watermarked sheet is a PDF");
  assert.ok(wm.length > pt.length, "watermarked sheet embeds the logo (" + wm.length + " > " + pt.length + ")");
  const wmText = pdfText(wm);
  assert.ok(wmText.indexOf("Meta") !== -1, "Meta logo/name renders on watermarked sheet");
  assert.ok(wmText.indexOf("Product image") === -1, "placeholder hidden when product image embedded");

  // 5. company name default + env override
  delete process.env.COMPANY_NAME;
  assert.strictEqual(mod.readCompanyName(), "Meta", "default company name");
  process.env.COMPANY_NAME = "Acme Co";
  assert.strictEqual(mod.readCompanyName(), "Acme Co", "env override");
  delete process.env.COMPANY_NAME;

  // 6. empty record does not crash (always downloadable)
  const empty = await mod.buildCompanySheet(createEmptyRecord("empty.pdf", "test"), [], { companyName: "Meta" });
  assert.strictEqual(empty.subarray(0, 4).toString("ascii"), "%PDF", "empty-record sheet is a PDF");

  fs.mkdirSync("data/tmp", { recursive: true });
  fs.writeFileSync("data/tmp/test-company-sheet-source.pdf", src);
  fs.writeFileSync("data/tmp/test-company-sheet-pt.pdf", pt);
  fs.writeFileSync("data/tmp/test-company-sheet-wm.pdf", wm);
  fs.writeFileSync("data/tmp/test-company-sheet-commercial.pdf", commSheet);
  console.log("sizes (bytes): source=" + src.length + " pt=" + pt.length + " watermarked=" + wm.length + " commercial=" + commSheet.length);
  console.log("ALL COMPANY-TEMPLATE TESTS PASSED");
}
main().catch(function (e) { console.error("TEST FAILED: " + (e.stack || e.message)); process.exit(1); });