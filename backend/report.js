"use strict";
// Goal 3 output file: bilingual PDF report (standardized company format).
// buildBilingualReport(record, findings, targetLang) -> PDF Buffer.
// Layout: header, field table (label | original | translated), findings,
// evidence quotes, review disclaimer. One page or more as needed.
// pdf-lib is lazy-required (same pattern as watermark.js);
// operator runs `npm install pdf-lib` where network exists.

const path = require("node:path");
const { FIELD_KEYS, fieldDef } = require("./schema");
const { LANG_NAMES } = require("./translate");

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
  } catch (e) { /* global root unavailable, ignore */ }
  for (const c of candidates) {
    try {
      const lib = require(c);
      if (lib && lib.PDFDocument) return lib;
    } catch (e) { tried.push(c); }
  }
  throw new Error("pdf-lib is not installed (looked in: " + tried.join("; ") + "). Run INSIDE the Production folder: npm install pdf-lib.");
}

function sanitize(str) {
  return String(str == null ? "" : str)
    .replace(/\u2192/g, "->")
    .replace(/[^\x00-\xff]/g, "?");
}

function wrapText(text, font, size, maxWidth) {
  const words = sanitize(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  words.forEach(function (w) {
    const t = line ? line + " " + w : w;
    if (line && font.widthOfTextAtSize(t, size) > maxWidth) {
      lines.push(line);
      line = w;
    } else {
      line = t;
    }
  });
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

async function buildBilingualReport(record, findings, targetLang) {
  const lib = loadPdfLib();
  const langName = LANG_NAMES[targetLang] || targetLang;
  const pdf = await lib.PDFDocument.create();
  const font = await pdf.embedFont(lib.StandardFonts.Helvetica);
  const bold = await pdf.embedFont(lib.StandardFonts.HelveticaBold);

  const W = 595;
  const H = 842;
  const M = 48;
  let page = pdf.addPage([W, H]);
  let y = H - M;

  function ensure(space) {
    if (y - space < M) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
  }

  function para(str, size, f, gap, color) {
    const lines = wrapText(str, f || font, size || 10, W - 2 * M);
    lines.forEach(function (ln) {
      ensure(gap || 14);
      page.drawText(ln, { x: M, y: y, size: size || 10, font: f || font, color: color || lib.rgb(0, 0, 0) });
      y -= (gap || 14);
    });
  }

  function heading(str) {
    y -= 8;
    para(str, 13, bold, 18);
    y -= 2;
  }

  const name = (record.fields.productName && record.fields.productName.value) || record.documentName || "Unknown product";
  heading("Bilingual Product Report: " + name);
  para("Document: " + (record.documentName || "-") + "  |  Schema: " + record.schemaVersion, 9, font, 13);
  para("Languages: source / " + langName + "  |  Generated: " + new Date().toISOString().slice(0, 10), 9, font, 13);
  y -= 4;

  heading("Product fields");
  FIELD_KEYS.forEach(function (key) {
    const f = record.fields[key];
    if (!f || !f.value) return;
    const def = fieldDef(key);
    const label = def ? def.label : key;
    const t = (f.translation && f.translation.lang === targetLang) ? f.translation.translatedValue : null;
    para(label, 10, bold, 14);
    para("Original: " + f.value + (f.unit ? " [" + f.unit + "]" : ""), 10, font, 13);
    para(langName + ": " + (t || "(not translated)"), 10, font, 13);
    y -= 3;
  });

  heading("Quality findings");
  const list = Array.isArray(findings) ? findings : [];
  if (!list.length) {
    para("No findings.", 10, font, 14);
  } else {
    list.forEach(function (fd) {
      para("[" + fd.severity + "] " + fd.code + ": " + fd.message, 10, font, 13);
    });
  }

  heading("Evidence");
  FIELD_KEYS.forEach(function (key) {
    const f = record.fields[key];
    if (!f || !f.value || !f.evidence || !f.evidence.length) return;
    const def = fieldDef(key);
    para((def ? def.label : key) + ": " + String(f.evidence[0].quote || "").slice(0, 160), 9, font, 12);
  });

  y -= 6;
  para("Machine-assisted output. All values are candidates and require human review.", 9, font, 12);

  return Buffer.from(await pdf.save());
}

module.exports = { buildBilingualReport: buildBilingualReport, wrapText: wrapText, sanitize: sanitize };
