const fs = require("node:fs");
const { PDFDocument } = require("pdf-lib");
const m = require("../../backend/product-image");
(async () => {
  const b = fs.readFileSync("sample-pdfs/activarmr-80-813_pds_pt.pdf");
  const img = await m.extractProductImage(b);
  console.log("len:", img.length, "magic:", img[0].toString(16) + img[1].toString(16));
  const pdf = await PDFDocument.create();
  try {
    const e = await pdf.embedJpg(img);
    console.log("embedJpg OK " + e.width + "x" + e.height);
  } catch (err) { console.log("embedJpg FAIL " + err.message.slice(0, 120)); }
  try {
    const pdf2 = await PDFDocument.create();
    const e2 = await pdf2.embedJpg(new Uint8Array(img));
    console.log("uint8 embedJpg OK " + e2.width + "x" + e2.height);
  } catch (err) { console.log("uint8 embedJpg FAIL " + err.message.slice(0, 120)); }
})();