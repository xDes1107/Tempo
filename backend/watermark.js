"use strict";
// Goal 2 watermark stamper (pdf-lib, pure JS, single-deploy friendly).
// Usage as module: stampPdf(pdfBytes, pngBytes, { opacity, scale, position, margin })
// Usage as CLI: node backend/watermark.js <input.pdf> <logo.png> <output.pdf> [opacity] [position]
// Needs: npm install pdf-lib (operator runs this where network exists).
// Defaults picked from the Oct 28 opacity preview test on Meta.png:
// center default: 40% page width, 15% opacity; corners: 18% width + 36pt margin.

const fs = require("node:fs/promises");
const path = require("node:path");

const POSITIONS = ["upper-left", "upper-right", "lower-left", "lower-right", "footer", "center"];

const DEFAULTS = {
  opacity: 0.15,
  scale: 0.4,
  cornerScale: 0.18,
  position: "upper-right",
  margin: 36,
  footerBand: 0.12,
  logoFile: path.resolve(__dirname, "..", "misc", "DEXIS.png")
};

function layoutWatermark(pageW, pageH, imgW, imgH, opts) {
  const scale = opts.position === "center" ? opts.scale : opts.cornerScale;
  const w = pageW * scale;
  const h = w * (imgH / imgW);
  const m = opts.margin;
  let x = (pageW - w) / 2;
  let y = (pageH - h) / 2;
  if (opts.position === "upper-left") { x = m; y = pageH - h - m; }
  else if (opts.position === "upper-right") { x = pageW - w - m; y = pageH - h - m; }
  else if (opts.position === "lower-left") { x = m; y = m; }
  else if (opts.position === "lower-right") { x = pageW - w - m; y = m; }
  else if (opts.position === "footer") {
    const band = pageH * opts.footerBand;
    let fw = pageW - 2 * m;
    let fh = fw * (imgH / imgW);
    if (fh > band) { fh = band; fw = fh * (imgW / imgH); }
    return { x: (pageW - fw) / 2, y: m, width: fw, height: fh };
  }
  return { x: x, y: y, width: w, height: h };
}

async function stampPdf(pdfBytes, pngBytes, options) {
  let PDFDocument;
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
  let lastErr = null;
  for (const c of candidates) {
    try { PDFDocument = require(c).PDFDocument; if (PDFDocument) break; }
    catch (e) { tried.push(c); lastErr = e; }
  }
  if (!PDFDocument) {
    throw new Error("pdf-lib is not installed (looked in: " + tried.join("; ") + "). Run INSIDE the Production folder: npm install pdf-lib. Last error: " + (lastErr && lastErr.message));
  }
  const opts = Object.assign({}, DEFAULTS, options || {});
  if (POSITIONS.indexOf(opts.position) === -1) {
    throw new Error("Unknown position: " + opts.position + ". Use one of: " + POSITIONS.join(", "));
  }
  const pdf = await PDFDocument.load(pdfBytes);
  const png = await pdf.embedPng(pngBytes);
  const pages = pdf.getPages();
  pages.forEach(function (page) {
    const size = page.getSize();
    const box = layoutWatermark(size.width, size.height, png.width, png.height, opts);
    page.drawImage(png, {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      opacity: opts.opacity
    });
  });
  return Buffer.from(await pdf.save());
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.log("Usage: node backend/watermark.js <input.pdf> <logo.png> <output.pdf> [opacity] [position]");
    console.log("Positions: " + POSITIONS.join(", "));
    process.exit(1);
  }
  const pdfBytes = await fs.readFile(args[0]);
  const pngBytes = await fs.readFile(args[1]);
  const opacity = args[3] ? parseFloat(args[3]) : DEFAULTS.opacity;
  const position = args[4] || DEFAULTS.position;
  const out = await stampPdf(pdfBytes, pngBytes, { opacity: opacity, position: position });
  await fs.mkdir(path.dirname(args[2]), { recursive: true });
  await fs.writeFile(args[2], out);
  console.log("Stamped " + args[0] + " -> " + args[2] + " (" + out.length + " bytes, opacity " + opacity + ", position " + position + ").");
}

if (require.main === module) {
  main().catch(function (e) { console.error("watermark FAILED: " + e.message); process.exit(1); });
}

module.exports = { stampPdf: stampPdf, DEFAULTS: DEFAULTS, POSITIONS: POSITIONS, layoutWatermark: layoutWatermark };
