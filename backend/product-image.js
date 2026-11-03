"use strict";
// Best-effort product-image extraction from the source PDF.
// Finds the largest embedded JPEG (DCTDecode) image XObject via the
// pdf-lib low-level API (no new dependencies). Returns the raw JPEG
// bytes, or null when there is nothing usable. Anything unexpected
// (encrypted files, odd colorspaces, tiny icons) falls back to null -
// the company sheet then renders its image placeholder frame instead.

const path = require("node:path");

function loadPdfLib() {
  const tried = [];
  const candidates = [
    "pdf-lib",
    path.resolve(__dirname, "..", "node_modules", "pdf-lib"),
    path.resolve(__dirname, "..", "..", "node_modules", "pdf-lib")
  ];
  try {
    const npmRoot = require("node:child_process").execSync("npm root -g", { encoding: "utf8" }).trim();
    if (npmRoot) candidates.push(path.join(npmRoot, "pdf-lib"));
  } catch (e) { /* ignore */ }
  for (const c of candidates) {
    try {
      const lib = require(c);
      if (lib && lib.PDFDocument) return lib;
    } catch (e) { tried.push(c); }
  }
  throw new Error("pdf-lib is not installed (looked in: " + tried.join("; ") + ").");
}

function nameOf(lib, dict, key) {
  try {
    const v = dict.lookup(lib.PDFName.of(key));
    if (!v) return null;
    if (typeof v.decodeText === "function") return v.decodeText();
    return String(v);
  } catch (e) { return null; }
}


function filterText(v) {
  if (!v) return "";
  try {
    if (Array.isArray(v)) return v.map(filterText).join(" ");
    if (typeof v.decodeText === "function") return v.decodeText();
    return String(v);
  } catch (e) { return ""; }
}

async function extractProductImage(pdfBytes) {
  try {
    if (!pdfBytes || !pdfBytes.length) return null;
    const lib = loadPdfLib();
    if (!lib.PDFDict || !lib.PDFName || !lib.PDFRawStream) return null;
    const doc = await lib.PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    let best = null;
    let bestArea = 0;
    const objects = doc.context.enumerateIndirectObjects();
    for (const entry of objects) {
      const obj = entry[1];
      try {
        if (!(obj instanceof lib.PDFRawStream)) continue;
        const dict = obj.dict;
        if (!dict || !(dict instanceof lib.PDFDict)) continue;
        if (nameOf(lib, dict, "Subtype") !== "Image") continue;
        const filters = filterText(dict.lookup(lib.PDFName.of("Filter")));
        if (filters.indexOf("DCTDecode") === -1) continue;
        const width = parseInt(dict.lookup(lib.PDFName.of("Width")) || "0", 10) || 0;
        const height = parseInt(dict.lookup(lib.PDFName.of("Height")) || "0", 10) || 0;
        if (width < 120 || height < 120) continue;
        const area = width * height;
        if (area <= bestArea) continue;
        const bytes = obj.getContents();
        if (!bytes || bytes.length < 2000) continue;
        best = Buffer.from(bytes);
        bestArea = area;
      } catch (e) { /* skip unreadable objects */ }
    }
    return best;
  } catch (e) { return null; }
}

module.exports = { extractProductImage: extractProductImage };
