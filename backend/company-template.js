"use strict";
// Tempo - standardized company-format document render (v2, Tempo).
// buildCompanySheet(record, findings, options) -> Promise<Buffer> (A4 PDF).
//
// Layout: Company logo upper-left + company name, product title, hero band
// (product image left, key fields right), document control box, ordering
// block (EAN / quantities, only when found), specifications, website
// descriptions, quality findings, evidence quotes, footer + disclaimer.
//
// Schema v2.2 fields feed the sheet: manufacturer, description, norms
// (= standardsAndCertifications), sizes + colors (only if applicable),
// categorization (taxonomy path, placeholder until the taxonomy upload),
// recommendation (Recommended usage sentence per misc/Recommend.txt),
// ean + orderInfo (only if found). All other valued fields render in
// Specifications; empty fields are skipped (sheet is always downloadable).
//
// Locked defaults (operator-tunable without code edits):
// - Company display name: process.env.COMPANY_NAME, default "Tempo".
// - Page: A4 portrait, 48pt margins. Fixed for the demo.
// - Watermark on the template: opt-in per request (watermarkPngBytes set),
//   drawn centered at low opacity, same look as the stamp step.
// - Logo: Tempo-neutral.png bytes passed in as logoPngBytes (may be null -> skipped).
// - Product image: JPEG bytes passed in as productImageBytes (extracted
//   best-effort from the source PDF); placeholder frame when absent.
// pdf-lib is lazy-required (same pattern as report.js / watermark.js).

const path = require("node:path");
const { FIELD_KEYS, fieldDef } = require("./schema");
const { LANG_NAMES } = require("./translate");
const { buildWebsiteDescription } = require("./enrich");
const { sanitize, wrapText } = require("./pdf-text");

const COMPANY_NAME_DEFAULT = "Tempo";
const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 48;
const LOGO_H = 40;
const IMG_BOX_W = 150;
const IMG_MIN_H = 120;

const IDENTITY_KEYS = ["productName", "manufacturer", "modelOrReference", "categoryOrIntendedUse"];
const HERO_KEYS = ["manufacturer", "description", "standardsAndCertifications", "sizesAvailable", "colors", "categorization"];
const COMMERCIAL_KEYS = ["ean", "orderInfo"];
const SPEC_KEYS = ["materials", "dimensions",
  "protectionLevelsOrPerformance", "usageRestrictionsOrWarnings", "industriesOrApplications",
  "categoryOrIntendedUse"];

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

function cleanBytes(b) {
  if (!b || !b.length) return null;
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  return new Uint8Array(u);
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

// Recommended usage (misc/Recommend.txt template): "This [Product] is made by
// [Manufacturer]. It is a [Type of product] [Product Type i.e. Glove, Helmet],
// recommended to be used for [Area] and/or [Area]. It is certified to the
// following [Norms]." Product -> Type -> Area -> Norms, built only from
// extracted technical-sheet values, kept simple, missing parts skipped.
var PRODUCT_NOUNS = ["glove", "helmet", "goggle", "glass", "mask", "respirator", "boot", "shoe", "apron", "sleeve", "jacket", "coverall", "earmuff"];

function guessProductNoun(fields) {
  const hay = ["productName", "modelOrReference", "categoryOrIntendedUse", "description"].map(function (k) {
    const f = fields ? fields[k] : null;
    return f && f.value ? String(f.value) : "";
  }).join(" ").toLowerCase();
  for (let i = 0; i < PRODUCT_NOUNS.length; i++) {
    const n = PRODUCT_NOUNS[i];
    if (hay.indexOf(n) !== -1 || hay.indexOf(n + "s") !== -1) return n;
  }
  return null;
}

function labelOf(key) {
  const def = fieldDef(key);
  return def ? def.label : key;
}

function buildRecommendation(fields, lang) {
  function pick(key) {
    const f = fields ? fields[key] : null;
    if (!f || !f.value) return null;
    if (lang && f.translation && f.translation.lang === lang && f.translation.translatedValue) {
      return f.translation.translatedValue;
    }
    return f.unit ? f.value + " [" + f.unit + "]" : f.value;
  }
  const product = pick("productName") || pick("modelOrReference");
  const maker = pick("manufacturer");
  const type = pick("categoryOrIntendedUse") || pick("protectionLevelsOrPerformance");
  const noun = guessProductNoun(fields);
  const areaRaw = pick("industriesOrApplications");
  const norms = pick("standardsAndCertifications");
  const areas = areaRaw ? areaRaw.split(/[,;/]+/).map(function (a) { return a.trim(); }).filter(Boolean) : [];
  const kind = [type, noun].filter(Boolean).join(" ");
  const sentences = [];
  if (product && maker) sentences.push("This " + product + " is made by " + maker + ".");
  else if (product) sentences.push("This " + product + ".");
  const article = kind && /^[aeiou]/i.test(kind.trim()) ? "an" : "a";
  if (kind && areas.length > 1) sentences.push("It is " + article + " " + kind + ", recommended to be used for " + areas[0] + " and/or " + areas.slice(1).join(", ") + ".");
  else if (kind && areas.length === 1) sentences.push("It is " + article + " " + kind + ", recommended to be used for " + areas[0] + ".");
  else if (kind) sentences.push("It is " + article + " " + kind + ".");
  else if (areas.length) sentences.push("Recommended to be used for " + areas.join(" and/or ") + ".");
  if (norms) sentences.push("It is certified to the following " + norms + ".");
  if (!sentences.length) return null;
  return sentences.join(" ");
}

async function buildCompanySheet(record, findings, options) {
  const lib = loadPdfLib();
  const opts = options || {};
  const lang = opts.lang || null;
  const langName = lang ? (LANG_NAMES[lang] || lang) : null;
  const companyName = opts.companyName || readCompanyName();
  const safeRecord = record && record.fields ? record : { fields: {}, documentName: null, schemaVersion: "-", extractionEngine: "-" };
  const list = Array.isArray(findings) ? findings : [];
  // Option 1 visual prompt: user-defined hero/order/hidden. Falls back to defaults.
  let heroKeys = HERO_KEYS.slice();
  let specKeys = SPEC_KEYS.slice();
  let hideSet = {};
  let showEvidence = true;
  try {
    const cand = (record && record.layout) || (opts && opts.layout) || null;
    if (cand) {
      const L = require("./layout").normalizeLayout(cand);
      if (L.hero && L.hero.length) heroKeys = L.hero.slice();
      if (L.specOrder && L.specOrder.length) specKeys = L.specOrder.slice();
      (L.hidden || []).forEach(function (k) { hideSet[k] = true; });
      showEvidence = L.showEvidence !== false;
    }
  } catch (e) { /* defaults stand */ }

  const pdf = await lib.PDFDocument.create();
  const font = await pdf.embedFont(lib.StandardFonts.Helvetica);
  const bold = await pdf.embedFont(lib.StandardFonts.HelveticaBold);
  const contentW = PAGE_W - 2 * MARGIN;

  let logo = null;
  if (opts.logoPngBytes) {
    try { logo = await pdf.embedPng(cleanBytes(opts.logoPngBytes)); } catch (e) { logo = null; }
  }
  let productImg = null;
  if (opts.productImageBytes) {
    try { productImg = await pdf.embedJpg(cleanBytes(opts.productImageBytes)); }
    catch (e1) {
      try { productImg = await pdf.embedPng(cleanBytes(opts.productImageBytes)); } catch (e2) { productImg = null; }
    }
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
    y -= 8;
  }

  // Header: Company logo upper-left, company name beside it, title below.
  let headX = MARGIN; let logoBottom = null;
  if (logo) {
    const lw = Math.min(LOGO_H * (logo.width / logo.height), 140); const lh = lw * (logo.height / logo.width);
    page.drawImage(logo, { x: MARGIN, y: y - lh + 6, width: lw, height: lh }); logoBottom = y - lh + 6;
    headX = MARGIN + lw + 12;
  }
  const headLines = wrapText(companyName, bold, 17, contentW - (headX - MARGIN));
  headLines.forEach(function (ln) {
    page.drawText(ln, { x: headX, y: y, size: 17, font: bold, color: lib.rgb(0, 0, 0) });
    y -= 22;
  });
  y -= 2;
  if (logoBottom !== null && y - 14 < logoBottom) { y = logoBottom - 22; }
  para("Standardized Product Data Sheet", 12, font, 16);
  drawRule();

  const f = safeRecord.fields;
  const title = (f.productName && f.productName.value) ||
    (f.modelOrReference && f.modelOrReference.value) ||
    safeRecord.documentName || "Unknown product";
  para(title, 14, bold, 19);
  y -= 2;
  drawRule();

  // Hero band: product image left, key fields right.
  const heroRows = [];
  heroKeys.forEach(function (key) {
    if (hideSet[key]) return;
    const field = f[key];
    if (!field || !field.value) return;
    heroRows.push({ label: labelOf(key), source: valueText(field), translated: translatedText(field, lang) });
  });
  const catField = f.categorization;
  const catHidden = !!hideSet["categorization"];
  if (!catHidden) heroRows.push({
    label: labelOf("categorization"),
    source: (catField && catField.value) ? catField.value : "(taxonomy upload pending)",
    translated: (catField && catField.value) ? translatedText(catField, lang) : null
  });
  const textX = MARGIN + IMG_BOX_W + 14;
  const textW = contentW - IMG_BOX_W - 14;
  const heroWrapped = heroRows.map(function (r) {
    return [
      wrapText(r.label, bold, 10, textW - 6),
      wrapText("Source: " + r.source, font, 10, textW - 6)
    ].concat(r.translated !== null && r.translated !== undefined
      ? [wrapText((langName || "Translated") + ": " + r.translated, font, 10, textW - 6)]
      : []);
  });
  let heroH = 10;
  heroWrapped.forEach(function (w) { w.forEach(function (lines) { heroH += lines.length * 13; }); heroH += 6; });
  if (heroH < IMG_MIN_H) heroH = IMG_MIN_H;
  ensure(heroH + 8);
  const heroTop = y;
  if (productImg) {
    const scale = Math.min(IMG_BOX_W / productImg.width, (heroH - 8) / productImg.height);
    const iw = productImg.width * scale;
    const ih = productImg.height * scale;
    page.drawImage(productImg, { x: MARGIN + (IMG_BOX_W - iw) / 2, y: heroTop - heroH + (heroH - ih) / 2, width: iw, height: ih });
  } else {
    page.drawRectangle({
      x: MARGIN, y: heroTop - heroH, width: IMG_BOX_W, height: heroH,
      borderColor: lib.rgb(0.65, 0.65, 0.65), borderWidth: 1
    });
    page.drawText("Product image", {
      x: MARGIN + 12, y: heroTop - heroH / 2, size: 9, font: font, color: lib.rgb(0.45, 0.45, 0.45)
    });
  }
  page.drawRectangle({ x: MARGIN, y: heroTop - heroH, width: contentW, height: heroH, borderColor: lib.rgb(0.78, 0.82, 0.88), borderWidth: 1 });
  page.drawLine({ start: { x: textX - 7, y: heroTop - 4 }, end: { x: textX - 7, y: heroTop - heroH + 4 }, thickness: 1, color: lib.rgb(0.78, 0.82, 0.88) });
  let stripe = false;
  heroWrapped.forEach(function (w, idx) {
    if (stripe) {
      let rh = 6;
      w.forEach(function (lines) { rh += lines.length * 13; });
      page.drawRectangle({ x: textX - 4, y: y - rh + 4, width: textW, height: rh, color: lib.rgb(0.945, 0.957, 0.98) });
    }
    stripe = !stripe;
    w.forEach(function (lines, li) {
      lines.forEach(function (ln) {
        page.drawText(sanitize(ln), { x: textX, y: y, size: 10, font: li === 0 ? bold : font, color: lib.rgb(0, 0, 0) });
        y -= 13;
      });
    });
    y -= 6;
  });
  if (y > heroTop - heroH) y = heroTop - heroH;
  y -= 8;

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

  // Recommended usage (misc/Recommend.txt): one-line context on the product sold.
  const recommendation = buildRecommendation(f, lang);
  if (recommendation) {
    heading("Recommended usage");
    para(recommendation, 10, font, 13);
    y -= 2;
  }

  // Ordering block: only when EAN / quantities were found.
  const eanF = f.ean;
  const ordF = f.orderInfo;
  if ((eanF && eanF.value) || (ordF && ordF.value)) {
    heading("Ordering");
    let ostripe = false;
    COMMERCIAL_KEYS.forEach(function (key) {
      if (hideSet[key]) return;
      const field = f[key];
      if (!field || !field.value) return;
      specRow(labelOf(key), valueText(field), translatedText(field, lang), ostripe);
      ostripe = !ostripe;
    });
  }

  // Specifications: everything valued outside hero + ordering.
  heading("Specifications");
  let sstripe = false;
  specKeys.forEach(function (key) {
    if (hideSet[key]) return;
    const field = f[key];
    if (!field || !field.value) return;
    specRow(labelOf(key), valueText(field), translatedText(field, lang), sstripe);
    sstripe = !sstripe;
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
    try { wm = await pdf.embedPng(cleanBytes(opts.watermarkPngBytes)); } catch (e) { wm = null; }
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
  buildRecommendation: buildRecommendation,
  COMPANY_NAME_DEFAULT: COMPANY_NAME_DEFAULT,
  IDENTITY_KEYS: IDENTITY_KEYS,
  HERO_KEYS: HERO_KEYS,
  COMMERCIAL_KEYS: COMMERCIAL_KEYS,
  SPEC_KEYS: SPEC_KEYS
};
