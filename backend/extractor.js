"use strict";
// Deterministic extraction mapped onto the 16-field schema (v2.2).
// Method: deterministic-rules-v2.2. Regex candidates only -
// every value needs human review. AI (Meta Model API) replaces the
// finders next but keeps this output shape and evidence contract.

const { createEmptyRecord, makeEvidence } = require("./schema");

function getLines(text) {
  return text
    .split(/\r?\n/)
    .map(function (line) { return line.trim().replace(/\s+/g, " "); })
    .filter(Boolean);
}

function findLineIndex(lines, value) {
  return lines.findIndex(function (line) {
    return line.toLowerCase().includes(String(value).toLowerCase().slice(0, 40));
  });
}

function evidenceFor(lines, text, rawValue) {
  const idx = findLineIndex(lines, rawValue || text);
  if (idx === -1) return [];
  const start = text.indexOf(rawValue || text);
  const range = start >= 0 ? [start, start + String(rawValue || text).length] : null;
  return [makeEvidence(1, lines[idx], range)];
}

function setField(record, lines, text, key, rawValue, options) {
  if (!rawValue) return;
  const value = String(rawValue).trim();
  if (!value) return;
  const opts = options || {};
  record.fields[key] = {
    value: opts.normalized || value,
    originalValue: value,
    unit: opts.unit || null,
    evidence: evidenceFor(lines, text, value),
    translatable: record.fields[key].translatable,
    translation: null
  };
}

function findProductName(lines) {
  return lines.find(function (line) {
    const looksLikeCode = /^[A-Z][A-Z0-9 \-/]{2,60}$/.test(line);
    const isHeading = /^(EN|ISO|CATEGORY|LEVEL|CUT PROTECTION|MECHANICAL)/.test(line);
    return looksLikeCode && !isHeading;
  }) || null;
}

function findManufacturer(text) {
  const m = text.match(/(MAPA\s*SAS|MAPA|Ansell|Honeywell|3M|uvex|Showa|Towa)\b[^\n\r]{0,60}/i);
  return m ? m[0].trim() : null;
}

function findCategory(text) {
  const m = text.match(/(Cut protection|Chemical protection|Mechanical protection|Disposable gloves?|Reusable gloves?)[^\n\r]{0,80}/i);
  return m ? m[0].trim() : null;
}

function findMaterials(text) {
  const m = text.match(/(HDPE fibres?|Nitrile|Seamless textile support[^\n\r]{0,80}|Knitted cuff[^\n\r]{0,40})/i);
  return m ? m[0].trim() : null;
}

function findSizes(text) {
  const m = text.match(/Sizes?\s*:?\s*([0-9][0-9 ,\/\-]+)/i);
  return m ? m[1].trim() : null;
}

function findStandards(text) {
  const matches = text.match(/\b(?:EN(?:\s+ISO)?|ISO)\s+\d{3,6}(?::\d{4})?\b/gi) || [];
  const unique = Array.from(new Set(matches.map(function (s) { return s.replace(/\s+/g, " ").trim(); })));
  return unique.join("; ") || null;
}

function findProtectionLevels(text) {
  const m = text.match(/\b[0-9X](?:\s*[0-9X]){3,6}\b|\bLevel\s+[A-F]\b|\b[A-F]\s*\/\s*[0-9.]+\s*N\b/i);
  const perf = text.match(/(Abrasion resistance|Blade cut resistance|Tear resistance|Puncture resistance|Cut resistance[^\n\r]{0,60})/i);
  const parts = [];
  if (m) parts.push(m[0].trim());
  if (perf) parts.push(perf[0].trim());
  return parts.join(" | ") || null;
}

function findDimensions(text) {
  const m = text.match(/Length[^\n\r]{0,20}?(\d+(?:[.,]\d+)?\s*-\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)\s*(cm|mm)\b/i);
  if (!m) return null;
  return { normalized: m[1].replace(",", "."), raw: m[0].trim(), unit: m[2] };
}

function findWarnings(text) {
  const m = text.match(/(Silicone free[^\n\r]{0,80}|DMF Free[^\n\r]{0,40}|not classified hazardous[^\n\r]{0,80})/i);
  return m ? m[0].trim() : null;
}

function cleanIndustryValue(v) {
  if (!v) return null;
  let s = String(v).split(bullet).join("; ").replace(/[\t]+/g, "; ").replace(/\s{2,}/g, " ");
  let parts = s.split(";").map(function (x) { return x.replace(/^[;:,\.\s-]+|[;:,\.\s-]+$/g, "").trim(); }).filter(function (x) { return x && x.length >= 4 && !/^(applications?|industr(y|ies)|trades?)$/i.test(x); });
  if (!parts.length) return null;
  s = parts.join("; ");
  if (/^(industries\s+applications)$/i.test(s)) return null;
  return s.slice(0, 300);
}

const bullet = String.fromCharCode(8226);

function grabSectionBlock(text, headerRe) {
  const m = text.match(headerRe);
  if (!m) return null;
  const after = text.slice(m.index + m[0].length, m.index + m[0].length + 500);
  const lines = after.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
  const stopRe = /^(FEATURES|BENEFITS|NORMS|PACKAGING|SPECIFIC|COMFORT|CATEGORY|PROTECTION|PERFORMANCE|DETAILS|DESCRIPTION)\b/i;
  const picked = [];
  for (const ln of lines) {
    if (stopRe.test(ln)) break;
    if (/^(EN|ISO|ANSI|Cat\b|CE\b)/i.test(ln) && picked.length) break;
    if (/^\d{1,2} of \d{1,2} /.test(ln)) break;
    const bulletParts = ln.split(bullet).map(function (p) { return cleanIndustryValue(p); }).filter(Boolean);
    if (bulletParts.length > 1) {
      bulletParts.forEach(function (p) { if (picked.indexOf(p) === -1) picked.push(p); });
    } else {
      const c = cleanIndustryValue(ln);
      if (c && picked.indexOf(c) === -1) picked.push(c);
    }
    if (picked.join("; ").length > 250 || picked.length >= 4) break;
  }
  return picked.length ? picked.join("; ") : null;
}

function findIndustriesOrApplications(text) {
  let v = grabSectionBlock(text, /INDUSTRIES\s*:?\s*\r?\n/i);
  if (v) return v;
  v = grabSectionBlock(text, /TRADES\s*&\s*APPLICATIONS\s*:?\s*\r?\n/i);
  if (v) return v;
  const labeled = text.match(/(?:Suitable for|Recommended for|Ideal for|Intended for|Field(?:s)? of use)\s*:?\s*([^\n\r]{4,160})/i);
  if (labeled) {
    const c = cleanIndustryValue(labeled[1]);
    if (c) return c;
  }
  const m = text.match(/(Automotive[^\n\r]{0,80}|Aerospace[^\n\r]{0,60}|Food (?:industry|handling|preparation)[^\n\r]{0,80}|Construction[^\n\r]{0,60}|Oil\s*(?:&|and)?\s*gas[^\n\r]{0,60}|Electronics[^\n\r]{0,60}|Medical[^\n\r]{0,60}|Chemical[^\n\r]{0,60}|Maintenance[^\n\r]{0,60}|Assembly[^\n\r]{0,60})/i);
  return m ? cleanIndustryValue(m[0]) : null;
}

function findDescription(text) {
  const labeled = text.match(/(?:^|\n)\s*Descriptions?\s*:?\s*([^\n\r]{20,300})/i);
  if (labeled) return labeled[1].trim().replace(/^[\u2022\-\*]+\s*/, "").replace(/\s+/g, " ");
  return null;
}

function findColors(text) {
  const m = text.match(/(?:colou?rs?|colourway|coloris)\s*:?\s*([A-Za-z][^\n\r]{1,80})/i);
  if (!m) return null;
  return m[1].trim().replace(/^[\u2022\-\*]+\s*/, "").replace(/[;,.:\-]+$/, "").trim().slice(0, 120) || null;
}

function gtinCheckOk(digits) {
  const s = String(digits).replace(/\D/g, "");
  if (!/^(8|12|13|14)$/.test(String(s.length))) return false;
  let sum = 0;
  for (let i = 0; i < s.length - 1; i++) {
    const d = parseInt(s[i], 10);
    const fromRight = s.length - 1 - i;
    sum += fromRight % 2 === 1 ? d * 3 : d;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === parseInt(s[s.length - 1], 10);
}

function findEan(text) {
  const kw = text.match(/(?:EAN(?:-?13)?|GTIN|bar-?codes?)\s*:?\s*([0-9][0-9 .\-]{7,20})/i);
  if (kw) {
    const digits = kw[1].replace(/\D/g, "");
    if (digits.length >= 8 && digits.length <= 14 && gtinCheckOk(digits)) return digits;
  }
  const bare = text.match(/(?<![0-9])[0-9]{13}(?![0-9])/);
  if (bare && gtinCheckOk(bare[0])) return bare[0];
  return null;
}

function findOrderInfo(text) {
  const parts = [];
  const moq = text.match(/(?:MOQ|minimum order|min\.?\s*order(?:ing)?(?: quantity)?)\s*:?\s*([^\n\r]{1,60})/i);
  if (moq) parts.push("Min order: " + moq[1].trim().replace(/^[\u2022\-\*]+\s*/, "").replace(/\s+/g, " "));
  const pack = text.match(/((?:[A-Za-z]+\s+){0,3}?(?:[A-Za-z]*?(?:box|pack|carton|case|bag|inner)(?:s|es)?)(?: of \d[^\n\r]{0,40}|\s*:?\s*\d[^\n\r]{0,40}))/i);
  if (pack) parts.push(pack[1].trim().replace(/^[\u2022\-\*]+\s*/, "").replace(/\s+/g, " "));
  return parts.length ? parts.join(" | ").slice(0, 200) : null;
}

// categorization has no deterministic finder yet: the DEXIS taxonomy
// (e.g. PPE -> GLOVES -> Anticut protection) is uploaded later and the
// template renders a placeholder until then.

function extractProductData(text, documentName) {
  const safeText = text || "";
  const lines = getLines(safeText);
  const record = createEmptyRecord(documentName || null, "deterministic-rules-v2.2");

  setField(record, lines, safeText, "productName", findProductName(lines));
  setField(record, lines, safeText, "manufacturer", findManufacturer(safeText));
  // modelOrReference defaults to the product code line; the AI step refines it.
  setField(record, lines, safeText, "modelOrReference", findProductName(lines));
  setField(record, lines, safeText, "categoryOrIntendedUse", findCategory(safeText));
  setField(record, lines, safeText, "description", findDescription(safeText));
  setField(record, lines, safeText, "materials", findMaterials(safeText));
  const dims = findDimensions(safeText);
  if (dims) setField(record, lines, safeText, "dimensions", dims.raw, { normalized: dims.normalized, unit: dims.unit });
  setField(record, lines, safeText, "sizesAvailable", findSizes(safeText));
  setField(record, lines, safeText, "colors", findColors(safeText));
  setField(record, lines, safeText, "standardsAndCertifications", findStandards(safeText));
  setField(record, lines, safeText, "protectionLevelsOrPerformance", findProtectionLevels(safeText));
  setField(record, lines, safeText, "usageRestrictionsOrWarnings", findWarnings(safeText));
  setField(record, lines, safeText, "industriesOrApplications", findIndustriesOrApplications(safeText));
  setField(record, lines, safeText, "ean", findEan(safeText));
  setField(record, lines, safeText, "orderInfo", findOrderInfo(safeText));

  return record;
}

module.exports = { extractProductData: extractProductData, findIndustriesOrApplications: findIndustriesOrApplications };
