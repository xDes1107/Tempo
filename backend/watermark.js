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
  logoFile: path.resolve(__dirname, "..", "misc", "Meta.png"),
  footerFile: path.resolve(__dirname, "..", "misc", "Footer.jpg")
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
    const fw = pageW;
    const fh = fw * (imgH / imgW);
    return { x: 0, y: 0, width: fw, height: fh };
  }
  return { x: x, y: y, width: w, height: h };
}

function imageKind(bytes) {
  if (bytes && bytes.length > 3 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return "png";
  if (bytes && bytes.length > 2 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return "jpg";
  return "png";
}

async function stampPdf(pdfBytes, imgBytes, options) {
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
  const bytes = new Uint8Array(imgBytes);
  const kind = imageKind(bytes);
  const png = kind === "jpg" ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
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

