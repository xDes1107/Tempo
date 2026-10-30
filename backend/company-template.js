"use strict";
// Goal 3b - standardized company-format document render.
// buildCompanySheet(record, findings, options) -> Promise<Buffer> (A4 PDF).
//
// Template render from the locked schema (schema.js v2.1): company header
// with logo, document control box, product identity + specification rows
// (source value alongside the translated value), website descriptions,
// quality findings, evidence quotes, footer with pagination + disclaimer.
//
// Faithful-layout rebuild of the supplier original is explicitly out of
// scope (later stretch); this template IS the company standard output.
//
// Locked defaults (operator-tunable without code edits):
// - Company display name: process.env.COMPANY_NAME, default "Meta".
// - Page: A4 portrait, 48pt margins. Fixed for the demo.
// - Watermark on the template: opt-in per request (watermarkPngBytes set),
//   drawn centered at low opacity, same look as the Goal 2 stamp.
// - Logo: Meta.png bytes passed in as logoPngBytes (may be null -> skipped).
// pdf-lib is lazy-required (same pattern as report.js / watermark.js).

const path = require("node:path");
const { FIELD_KEYS, fieldDef } = require("./schema");
const { LANG_NAMES } = require("./translate");
const { buildWebsiteDescription } = require("./enrich");
const { sanitize, wrapText } = require("./report");

const COMPANY_NAME_DEFAULT = "Meta";
const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 48;

const IDENTITY_KEYS = ["productName", "manufacturer", "modelOrReference", "categoryOrIntendedUse"];
const SPEC_KEYS = ["materials", "dimensions", "sizesAvailable", "standardsAndCertifications",
  "protectionLevelsOrPerformance", "usageRestrictionsOrWarnings", "industriesOrApplications"];

function readCompanyName() {
  const v = (process.env.COMPANY_NAME || "").trim();
  return v || COMPANY_NAME_DEFAULT;
}

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

function valueText(f) {
  if (!f || !f.value) return "-";
  return f.unit ? f.value + " [" + f.unit + "]" : f.value;
}

function translatedText(f, lang) {
  if (!f || !f.value || !lang) return null;
  if (f.translation && f.translation.lang === lang && f.translation.translatedValue) {
    return f.translation.translatedValue;
  }
  return "(not translated)";
}

function labelOf(key) {
  const def = fieldDef(key);
  return def ? def.label : key;
}

async function buildCompanySheet(record, findings, options) {
  const lib = loadPdfLib();
  const opts = options || {};
  const lang = opts.lang || null;
  const langName = lang ? (LANG_NAMES[lang] || lang) : null;
  const companyName = opts.companyName || readCompanyName();
  const safeRecord = record && record.fields ? record : { fields: {}, documentName: null, schemaVersion: "-", extractionEngine: "-" };
  const list = Array.isArray(findings) ? findings : [];

  const pdf = await lib.PDFDocument.create();
  const font = await pdf.embedFont(lib.StandardFonts.Helvetica);
  const bold = await pdf.embedFont(lib.StandardFonts.HelveticaBold);
  const contentW = PAGE_W - 2 * MARGIN;

  let logo = null;
  if (opts.logoPngBytes) {
    try { logo = await pdf.embedPng(opts.logoPngBytes); } catch (e) { logo = null; }
  }

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  function ensure(space) {
    if (y - space < MARGIN + 28) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  }

  function para(str, size, f, gap, color) {
    const lines = wrapText(str, f || font, size || 10, contentW);
    lines.forEach(function (ln) {
      ensure(gap || 14);
      page.drawText(ln, { x: MARGIN, y: y, size: size || 10, font: f || font, color: color || lib.rgb(0, 0, 0) });
      y -= (gap || 14);
    });
  }

  function heading(str) {
    y -= 6;
    ensure(22);
    para(str, 13, bold, 18);
    y -= 2;
  }

  function drawRule() {
    ensure(16);
    page.drawLine({
      start: { x: MARGIN, y: y },
      end: { x: PAGE_W - MARGIN, y: y },
      thickness: 1,
      color: lib.rgb(0.25, 0.25, 0.25)
    });
    y -= 12;
  }

  function specRow(label, source, translated, stripe) {
    const rows = [{ text: label, f: bold }];
    rows.push({ text: "Source: " + source, f: font });
    if (translated !== null && translated !== undefined) {
      rows.push({ text: (langName || "Translated") + ": " + translated, f: font });
    }
    const wrapped = rows.map(function (r) {
      return wrapText(r.text, r.f, 10, contentW - 12);
    });
    let h = 8;
    wrapped.forEach(function (w) { h += w.length * 13; });
    ensure(h);
    if (stripe) {
      page.drawRectangle({ x: MARGIN, y: y - h + 4, width: contentW, height: h, color: lib.rgb(0.945, 0.957, 0.98) });
    }
    wrapped.forEach(function (w, idx) {
      w.forEach(function (ln) {
        page.drawText(sanitize(ln), { x: MARGIN + 6, y: y, size: 10, font: rows[idx].f, color: lib.rgb(0, 0, 0) });
        y -= 13;
      });
    });
    y -= 6;
  }

  // Header: company name + logo, document title.
  if (logo) {
    const lh = 36;
    const lw = lh * (logo.width / logo.height);
    page.drawImage(logo, { x: PAGE_W - MARGIN - lw, y: y - lh + 14, width: lw, height: lh });
  }
  para(companyName, 17, bold, 22);
  para("Standardized Product Data Sheet", 12, font, 16);
  drawRule();

  const f = safeRecord.fields;
  const title = (f.productName && f.productName.value) ||
    (f.modelOrReference && f.modelOrReference.value) ||
    safeRecord.documentName || "Unknown product";
  para(title, 14, bold, 19);
  if (f.manufacturer && f.manufacturer.value) {
    para("Manufacturer: " + f.manufacturer.value, 10, font, 13);
  }
  y -= 2;

  // Document control box.
  heading("Document control");
  const generated = opts.generatedDate || new Date().toISOString().slice(0, 10);
  const control = [
    ["Source document", safeRecord.documentName || "-"],
    ["Schema", safeRecord.schemaVersion || "-"],
    ["Extraction engine", safeRecord.extractionEngine || "-"],
    ["Languages", langName ? "Source / " + langName : "Source only"],
    ["Generated (UTC)", generated],
    ["Job ID", opts.jobId || "-"]
  ];
  control.forEach(function (row, idx) {
    specRow(row[0], row[1], null, idx % 2 === 1);
  });

  // Product identity, then specifications (schema order in each group).
  heading("Product identity");
  IDENTITY_KEYS.forEach(function (key, idx) {
    const field = f[key];
    if (!field || !field.value) return;
    specRow(labelOf(key), valueText(field), translatedText(field, lang), idx % 2 === 1);
  });

  heading("Specifications");
  let stripe = false;
  SPEC_KEYS.forEach(function (key) {
    const field = f[key];
    if (!field || !field.value) return;
    specRow(labelOf(key), valueText(field), translatedText(field, lang), stripe);
    stripe = !stripe;
  });
  if (!SPEC_KEYS.some(function (key) { return f[key] && f[key].value; })) {
    para("No specification values extracted.", 10, font, 13);
  }

  // Website descriptions (source + translated).
  heading("Website description");
  para("Source: " + (buildWebsiteDescription(safeRecord) || "-"), 10, font, 13);
  if (lang) {
    const cached = (safeRecord.translatedDescriptions || {})[lang] || null;
    para(langName + ": " + (cached || "(not translated yet - run POST /api/jobs/:id/translate first)"), 10, font, 13);
  }

  // Quality findings.
  heading("Quality findings (" + list.length + ")");
  if (!list.length) {
    para("No findings.", 10, font, 14);
  } else {
    list.forEach(function (fd) {
      para("[" + String(fd.severity || "info").toUpperCase() + "] " + (fd.code || "") + ": " + (fd.message || ""), 10, font, 13);
    });
  }

  // Evidence quotes.
  heading("Evidence");
  let anyEvidence = false;
  FIELD_KEYS.forEach(function (key) {
    const field = f[key];
    if (!field || !field.value || !field.evidence || !field.evidence.length) return;
    anyEvidence = true;
    const ev = field.evidence[0];
    para(labelOf(key) + " (p. " + (ev.page || 1) + "): " + String(ev.quote || "").slice(0, 160), 9, font, 12);
  });
  if (!anyEvidence) {
    para("No source evidence recorded.", 9, font, 12);
  }

  y -= 4;
  drawRule();
  para("Machine-assisted output. All values are candidates and require human review before commercial use.", 9, font, 12);

  // Second pass: optional watermark stamp + footer with pagination.
  let wm = null;
  if (opts.watermarkPngBytes) {
    try { wm = await pdf.embedPng(opts.watermarkPngBytes); } catch (e) { wm = null; }
  }
  const pages = pdf.getPages();
  pages.forEach(function (p, i) {
    const size = p.getSize();
    if (wm) {
      const ww = size.width * 0.4;
      const wh = ww * (wm.height / wm.width);
      p.drawImage(wm, {
        x: (size.width - ww) / 2,
        y: (size.height - wh) / 2,
        width: ww,
        height: wh,
        opacity: opts.watermarkOpacity || 0.08
      });
    }
    p.drawText(sanitize(companyName) + "  |  Standardized Product Data Sheet  |  Page " + (i + 1) + " of " + pages.length,
      { x: MARGIN, y: 28, size: 8, font: font, color: lib.rgb(0.42, 0.42, 0.42) });
  });

  return Buffer.from(await pdf.save());
}

module.exports = {
  buildCompanySheet: buildCompanySheet,
  readCompanyName: readCompanyName,
  COMPANY_NAME_DEFAULT: COMPANY_NAME_DEFAULT,
  IDENTITY_KEYS: IDENTITY_KEYS,
  SPEC_KEYS: SPEC_KEYS
};
