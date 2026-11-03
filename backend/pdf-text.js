"use strict";
// Tempo - shared PDF text helpers (extracted from the old report.js when
// the standalone translation report was removed; company-template.js is the
// remaining PDF renderer and keeps using these).

// Map of common non-WinAnsi characters to safe replacements so pdf-lib
// (WinAnsi encoding) never throws on French datasheet text.
var SANITIZE_MAP = {
  "\u2192": "->",
  "\u2190": "<-",
  "\u2013": "-",
  "\u2014": "-",
  "\u2018": "'",
  "\u2019": "'",
  "\u201C": "\"",
  "\u201D": "\"",
  "\u2022": "-",
  "\u2026": "...",
  "\u00A0": " ",
  "\u0153": "oe",
  "\u0152": "OE",
  "\u00AB": "\"",
  "\u00BB": "\"",
  "\u00B0": "deg",
  "\u00B2": "2",
  "\u00B3": "3",
  "\u00BC": "1/4",
  "\u00BD": "1/2",
  "\u00BE": "3/4",
  "\u00D7": "x",
  "\u2212": "-",
  "\u2264": "<=",
  "\u2265": ">="
};

function sanitize(s) {
  return String(s || "").split("").map(function (ch) {
    var code = ch.charCodeAt(0);
    if (code >= 32 && code <= 126) return ch;
    if (SANITIZE_MAP[ch]) return SANITIZE_MAP[ch];
    if (code >= 160 && code <= 255) return ch;
    if (ch === "\u20AC") return "EUR";
    return "?";
  }).join("");
}

function wrapText(text, font, size, maxWidth) {
  var words = String(text || "").split(/\s+/).filter(Boolean);
  var lines = [];
  var line = "";
  words.forEach(function (w) {
    var t = line ? line + " " + w : w;
    var tooWide = false;
    try {
      tooWide = font.widthOfTextAtSize(sanitize(t), size) > maxWidth;
    } catch (e) { tooWide = t.length > 80; }
    if (tooWide && line) {
      lines.push(line);
      line = w;
    } else {
      line = t;
    }
  });
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

module.exports = { sanitize: sanitize, wrapText: wrapText };
