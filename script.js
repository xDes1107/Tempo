const form = document.querySelector("form");
const fileInput = document.querySelector("#pdf-file");
const fileStatus = document.querySelector("#file-status");
const uploadButton = document.querySelector("button");
const analysisResults = document.querySelector("#trust");
const analysisSummary = document.querySelector("#analysis-summary");
const analysisWarning = document.querySelector("#analysis-warning");
const watermarkSection = document.querySelector("#watermark");
const watermarkApply = document.querySelector("#watermark-apply");
const watermarkStatus = document.querySelector("#watermark-status");
const watermarkDownload = document.querySelector("#watermark-download");
const companyFormat = document.querySelector("#company-format");
const sheetDownload = document.querySelector("#sheet-download");
const sheetWatermark = document.querySelector("#sheet-watermark");
const sheetExcelDownload = document.querySelector("#sheet-excel-download");
const trustSection = document.querySelector("#trust");
const trustSummary = document.querySelector("#trust-summary");
const trustList = document.querySelector("#trust-list");
const aiModelSelect = document.querySelector("#ai-model");
let sheetLang = "";
let lastTrust = null;


let currentJobId = null;
let currentRecord = null;

let selectedFile = null;

uploadButton.disabled = true;

fileInput.addEventListener("change", function () {
  selectedFile = fileInput.files[0];
  analysisResults.hidden = true;
  watermarkSection.hidden = true;
  watermarkDownload.hidden = true;
  watermarkStatus.textContent = "";
  currentJobId = null;
  currentRecord = null;
  companyFormat.hidden = true;
  sheetDownload.hidden = true;
  sheetExcelDownload.hidden = true;

  if (!selectedFile) {
    fileStatus.textContent = "No file selected.";
    uploadButton.disabled = true;
    return;
  }

  const sizeInMegabytes = (selectedFile.size / 1024 / 1024).toFixed(2);

  fileStatus.textContent =
    `Selected: ${selectedFile.name} (${sizeInMegabytes} MB)`;

  uploadButton.disabled = false;
});

function renderList(listElement, values, emptyMessage) {
  listElement.replaceChildren();

  if (values.length === 0) {
    const item = document.createElement("li");
    item.textContent = emptyMessage;
    listElement.append(item);
    return;
  }

  values.forEach(function (value) {
    const item = document.createElement("li");
    item.textContent = value;
    listElement.append(item);
  });
}

function describeRecordEngine(record) {
  if (!record) return "Engine unknown.";
  var eng = record.extractionEngine || "unknown";
  var std = record.aiStandard || {};
  if (eng.indexOf("ai-standard-v1") === 0) {
    var aiN = (std.aiFields || []).length;
    var detN = (std.deterministicFields || []).length;
    var model = std.model || "Meta model";
    return "Extracted with AI (" + model + "): " + aiN + " AI fields, " + detN + " deterministic fallback.";
  }
  return "Extracted with deterministic rules (" + eng + ").";
}
function showCandidateResults(result) {
  const candidateData = result.candidateData;

  analysisResults.hidden = false;

  analysisSummary.textContent =
    `${result.document.textCharacterCount} characters. ` +
    describeRecordEngine(result.record) +
    ` See the Trust list for every field and its evidence status.`;

  analysisWarning.textContent = candidateData.warnings.join(" ");
}
form.addEventListener("submit", async function (event) {
  event.preventDefault();

  if (!selectedFile) {
    fileStatus.textContent = "Choose a PDF before uploading.";
    return;
  }

  uploadButton.disabled = true;
  fileStatus.textContent = "Uploading and extracting text...";

  try {
    const response = await fetch(
      "/api/documents",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/pdf",
          "X-File-Name": selectedFile.name
        },
        body: selectedFile
      }
    );

    const result = await response.json();

    showCandidateResults(result);

    if (!response.ok) {
      throw new Error(result.error || "The upload failed.");
    }

    currentJobId = result.jobId;
    currentRecord = result.record;
    companyFormat.hidden = false;
    if (trustSection) { trustSection.hidden = false; }
    loadTrust();
    if (typeof loadLayout === "function") { try { loadLayout(); } catch (e) {} }
    loadModels();
    sheetLang = "";
    updateSheetLink();
    watermarkSection.hidden = false;
    watermarkStatus.textContent = "";
    watermarkDownload.hidden = true;

    fileStatus.textContent =
      `Complete. ${result.document.textCharacterCount} characters extracted. ` +
      `Saved as ${result.resultFile}.`;
  } catch (error) {
    fileStatus.textContent = `Upload failed: ${error.message}`;
  } finally {
    uploadButton.disabled = false;
  }
});
watermarkApply.addEventListener("click", async function () {
  if (!currentJobId) {
    watermarkStatus.textContent = "Upload a PDF first.";
    return;
  }

  const checked = document.querySelector("input[name=wm-position]:checked");
  const position = checked ? checked.value : "upper-right";

  watermarkApply.disabled = true;
  watermarkStatus.textContent = "Applying stamp (" + position + ")...";
  watermarkDownload.hidden = true;

  try {
    const response = await fetch("/api/jobs/" + currentJobId + "/watermark", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ position: position })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Stamp failed.");
    }

    watermarkStatus.textContent = "Stamp applied (" + result.position + ").";
    watermarkDownload.href = result.downloadUrl;
    watermarkDownload.hidden = false;
  } catch (error) {
    watermarkStatus.textContent = "Stamp failed: " + error.message;
  } finally {
    watermarkApply.disabled = false;
  }
});


// Company-format sheet (Goal 3b template render).
function updateSheetLink() {
  if (!currentJobId) {
    sheetDownload.hidden = true;
  sheetExcelDownload.hidden = true;
    return;
  }
  let url = "/api/jobs/" + currentJobId + "/company-sheet";
  const q = [];
  if (sheetLang) q.push("lang=" + sheetLang);
  if (sheetWatermark && sheetWatermark.checked) q.push("watermark=true");
  if (q.length) url += "?" + q.join("&");
  sheetDownload.href = url;
  sheetDownload.hidden = false;
  sheetExcelDownload.href = "/api/jobs/" + currentJobId + "/company-excel" + (sheetLang ? "?lang=" + sheetLang : "");
  sheetExcelDownload.hidden = false;
}

document.querySelectorAll("#company-format [data-sheet-lang]").forEach(function (button) {
  button.addEventListener("click", function () {
    sheetLang = button.getAttribute("data-sheet-lang") || "";
    updateSheetLink();
  });
});

sheetWatermark.addEventListener("change", updateSheetLink);






async function loadTrust() {
  if (!currentJobId || !trustSummary) return;
  trustSummary.textContent = "Computing trust...";
  try {
    const response = await fetch("/api/jobs/" + currentJobId + "/trust");
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Trust request failed.");
    renderTrust(result.trust);
  } catch (error) {
    trustSummary.textContent = "Trust unavailable: " + error.message;
  }
}

function trustGroup(status) {
  if (status === "supported") return "ok";
  if (status === "missing-required" || status === "missing-optional") return "missing";
  return "review";
}

function trustDelta(pre, post) {
  if (!pre || !post || !pre.counts || !post.counts) return "";
  const ds = post.score - pre.score;
  const okD = (post.counts.supported || 0) - (pre.counts.supported || 0);
  return " Trust " + pre.score + "% -> " + post.score + "% (" + (okD >= 0 ? "+" : "") + okD + " ok).";
}

function renderTrust(trust) {
  if (!trust) return;
  lastTrust = trust;
  const c = trust.counts || {};
  const total = c.total || 0;
  const ok = c.supported || 0;
  const review = c.review || 0;
  const missing = Math.max(0, total - (c.extracted || 0));
  trustSummary.replaceChildren();
  const head = document.createElement("div");
  head.className = "trust-head";
  const r = 36;
  const circ = 2 * Math.PI * r;
  function seg(value, cls, offset) {
    const len = total ? (value / total) * circ : 0;
    return "<circle cx=\"46\" cy=\"46\" r=\"" + r + "\" class=\"seg " + cls + "\" stroke-dasharray=\"" + len.toFixed(1) + " " + circ.toFixed(1) + "\" stroke-dashoffset=\"" + (-offset).toFixed(1) + "\" transform=\"rotate(-90 46 46)\"/>";
  }
  let acc = 0;
  const okSeg = seg(ok, "ok", acc); acc += total ? (ok / total) * circ : 0;
  const revSeg = seg(review, "review", acc); acc += total ? (review / total) * circ : 0;
  const missSeg = seg(missing, "missing", acc);
  head.innerHTML = "<svg class=\"donut\" width=\"92\" height=\"92\" viewBox=\"0 0 92 92\" role=\"img\" aria-label=\"Trust score " + trust.score + " percent\">" +
    "<circle cx=\"46\" cy=\"46\" r=\"" + r + "\" class=\"track\"/>" + okSeg + revSeg + missSeg +
    "<text x=\"46\" y=\"52\" text-anchor=\"middle\" class=\"donut-score\">" + trust.score + "%</text></svg>" +
    "<div class=\"trust-stats\"><div class=\"tstat\"><strong>" + total + "</strong><span>fields total</span></div>" +
    "<div class=\"tstat\"><strong>" + (c.extracted || 0) + "</strong><span>extracted</span></div>" +
    "<div class=\"tstat\"><strong>" + ok + "</strong><span>ok</span></div>" +
    "<div class=\"tstat\"><strong>" + review + "</strong><span>need review</span></div>" +
    "<div class=\"tstat\"><strong>" + missing + "</strong><span>missing</span></div></div>";
  trustSummary.append(head);
  trustList.replaceChildren();
  const rank = { ok: 0, review: 1, missing: 2 };
  const rows = (trust.fields || []).slice().sort(function (a, b) {
    const d = rank[trustGroup(a.status)] - rank[trustGroup(b.status)];
    if (d !== 0) return d;
    return a.label < b.label ? -1 : 1;
  });
  rows.forEach(function (f) {
    const g = trustGroup(f.status);
    const item = document.createElement("li");
    item.className = "trust-row " + g;
    const dot = document.createElement("span");
    dot.className = "dot " + g;
    const body = document.createElement("div");
    body.className = "trust-body";
    const label = document.createElement("div");
    label.className = "tlabel";
    label.textContent = f.label;
    const val = document.createElement("div");
    val.className = "tval";
    val.textContent = f.hasValue ? f.value + (f.page ? "  (p. " + f.page + ")" : "") : "missing";
    body.append(label);
    body.append(val);
    item.append(dot);
    item.append(body);
    trustList.append(item);
  });
}

async function loadModels() {
  if (!aiModelSelect) return;
  try {
    const response = await fetch("/api/models");
    const result = await response.json();
    aiModelSelect.replaceChildren();
    (result.models || []).forEach(function (id) {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = id + (id === result.default ? " (default)" : "");
      if (id === result.default) opt.selected = true;
      aiModelSelect.append(opt);
    });
    if (aiExtractStatus && result.configured === false) {
      aiExtractStatus.textContent = "AI-standard extraction ran on upload; this button re-runs it. " + (result.note || "");
    }
  } catch (error) {
    if (aiExtractStatus) aiExtractStatus.textContent = "Model list unavailable: " + error.message;
  }
}

const aiExtractRun = document.querySelector("#ai-extract-run");
const aiExtractStatus = document.querySelector("#ai-extract-status");

function renderAiExtractedRecord(record) {
  if (!record) return;
  analysisSummary.textContent = describeRecordEngine(record) + " See the Trust list for every field and its evidence status.";
}
async function runAiExtractNow() {
  if (!currentJobId) {
    if (aiExtractStatus) aiExtractStatus.textContent = "Upload a PDF first.";
    return;
  }
  const preEnhanceTrust = lastTrust;
  if (aiExtractStatus) aiExtractStatus.textContent = "Re-running AI extraction...";
  try {
    const response = await fetch("/api/jobs/" + currentJobId + "/ai-extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: aiModelSelect ? aiModelSelect.value : undefined })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "AI extraction failed.");
    const ai = result.ai || {};
    currentRecord = result.record || currentRecord;
    renderAiExtractedRecord(currentRecord);
    if (result.trust) renderTrust(result.trust);
    const applied = ai.applied || [];
    const skipped = ai.skipped || [];
    if (aiExtractStatus) {
      if (ai.note) {
        aiExtractStatus.textContent = ai.note;
      } else if (!applied.length) {
        aiExtractStatus.textContent = "AI found nothing new to add (" + skipped.length + " skipped). Deterministic results stand.";
      } else {
        const names = applied.map(function (a) { return a.key + " (" + a.kind + ")"; }).join(", ");
        aiExtractStatus.textContent = "AI enhanced " + applied.length + " field(s) via " + (ai.model || "model") + ": " + names + "." + trustDelta(preEnhanceTrust, result.trust);
      }
    }
  } catch (error) {
    if (aiExtractStatus) aiExtractStatus.textContent = "AI extraction failed: " + error.message;
  }
}

if (typeof aiExtractRun !== "undefined" && aiExtractRun) {
  aiExtractRun.addEventListener("click", runAiExtractNow);
}

// Option 1 visual prompt: sheet layout picker (no canvas).
var LAYOUT_LABELS = {
  productName: "Product name",
  manufacturer: "Manufacturer",
  modelOrReference: "Model / reference",
  categoryOrIntendedUse: "Category / intended use",
  description: "Description",
  materials: "Materials",
  dimensions: "Dimensions",
  sizesAvailable: "Sizes",
  colors: "Colors",
  standardsAndCertifications: "Norms",
  protectionLevelsOrPerformance: "Protection levels / performance",
  usageRestrictionsOrWarnings: "Usage restrictions / warnings",
  industriesOrApplications: "Industries / applications",
  categorization: "Categorization",
  ean: "EAN / barcode",
  orderInfo: "Order / pack quantities"
};
function layoutLabel(key) { return LAYOUT_LABELS[key] || key.charAt(0).toUpperCase() + key.slice(1); }
var layoutListEl = document.querySelector("#layout-list");
var layoutHeroEl = document.querySelector("#layout-hero");
var layoutStatusEl = document.querySelector("#layout-status");
var currentLayout = null;
async function loadLayout() {
  if (!currentJobId || !layoutListEl) return;
  layoutStatusEl.textContent = "Loading layout...";
  try {
    var r = await fetch("/api/jobs/" + currentJobId + "/layout");
    var j = await r.json();
    if (!r.ok) throw new Error(j.error || "Layout load failed.");
    currentLayout = j.layout;
    if (document.querySelector("#layout-evidence") && typeof currentLayout.showEvidence === "boolean") {
      document.querySelector("#layout-evidence").checked = currentLayout.showEvidence;
    }
    renderLayout();
    layoutStatusEl.textContent = "";
  } catch (e) { layoutStatusEl.textContent = "Layout unavailable: " + e.message; }
}
function renderLayout() {
  if (!currentLayout || !layoutListEl) return;
  layoutListEl.replaceChildren();
  if (layoutHeroEl) {
    var heroNames = (currentLayout.hero || []).map(layoutLabel);
    layoutHeroEl.textContent = heroNames.length ? "Hero: " + heroNames.join(", ") : "Hero: none";
  }
  (currentLayout.specOrder || []).forEach(function (key, idx) {
    var hid = currentLayout.hidden.indexOf(key) !== -1;
    var isHero = currentLayout.hero.indexOf(key) !== -1;
    var li = document.createElement("li");
    li.className = "layout-row" + (hid ? " is-hidden" : "") + (isHero ? " is-hero" : "");
    var name = document.createElement("span");
    name.className = "layout-name";
    name.textContent = layoutLabel(key);
    var actions = document.createElement("span");
    actions.className = "layout-actions";
    var up = document.createElement("button"); up.type = "button"; up.textContent = "Up"; up.className = "btn-move";
    up.addEventListener("click", function () { moveLayoutKey(idx, -1); });
    var dn = document.createElement("button"); dn.type = "button"; dn.textContent = "Down"; dn.className = "btn-move";
    dn.addEventListener("click", function () { moveLayoutKey(idx, 1); });
    var tg = document.createElement("button"); tg.type = "button"; tg.textContent = hid ? "Show" : "Hide"; tg.className = "btn-vis";
    tg.addEventListener("click", function () { toggleLayoutKey(key); });
    var hb = document.createElement("button"); hb.type = "button"; hb.textContent = isHero ? "Unhero" : "Hero"; hb.className = "btn-hero";
    hb.addEventListener("click", function () { toggleLayoutHero(key); });
    actions.append(up, dn, tg, hb);
    li.append(name, actions);
    layoutListEl.append(li);
  });
}
function moveLayoutKey(i, d) {
  var a = currentLayout.specOrder;
  var j = i + d;
  if (j < 0 || j >= a.length) return;
  var t = a[i]; a[i] = a[j]; a[j] = t;
  renderLayout();
}
function toggleLayoutKey(k) {
  var h = currentLayout.hidden;
  var i = h.indexOf(k);
  if (i === -1) h.push(k); else h.splice(i, 1);
  renderLayout();
}
function toggleLayoutHero(k) {
  var h = currentLayout.hero;
  var i = h.indexOf(k);
  if (i === -1) h.push(k); else h.splice(i, 1);
  renderLayout();
}
var layoutSaveBtn = document.querySelector("#layout-save");
if (layoutSaveBtn) {
  layoutSaveBtn.addEventListener("click", async function () {
    if (!currentJobId || !currentLayout) { layoutStatusEl.textContent = "Upload a PDF first."; return; }
    layoutStatusEl.textContent = "Saving...";
    var evBox = document.querySelector("#layout-evidence");
    if (evBox) currentLayout.showEvidence = evBox.checked;
    try {
      var r = await fetch("/api/jobs/" + currentJobId + "/layout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout: currentLayout })
      });
      var j = await r.json();
      if (!r.ok) throw new Error(j.error || "Save failed.");
      currentLayout = j.layout;
      renderLayout();
      if (typeof setLayoutVisible === "function") setLayoutVisible(true);
      layoutStatusEl.textContent = "Saved. Sheet downloads now use this layout.";
      if (typeof updateSheetLink === "function") updateSheetLink();
    } catch (e) { layoutStatusEl.textContent = "Save failed: " + e.message; }
  });
}
var layoutResetBtn = document.querySelector("#layout-reset");
if (layoutResetBtn) {
  layoutResetBtn.addEventListener("click", async function () {
    if (!currentJobId) return;
    layoutStatusEl.textContent = "Resetting...";
    try {
      var r = await fetch("/api/jobs/" + currentJobId + "/layout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout: {} })
      });
      var j = await r.json();
      currentLayout = j.layout;
      renderLayout();
      layoutStatusEl.textContent = "Reset to default.";
    } catch (e) { layoutStatusEl.textContent = "Reset failed: " + e.message; }
  });
}

// UI credentials: key + link above the upload, server memory only.
var apiKeyInput = document.querySelector("#api-key");
var apiBaseInput = document.querySelector("#api-base");
var apiSaveBtn = document.querySelector("#api-save");
var apiClearBtn = document.querySelector("#api-clear");
var apiStatusEl = document.querySelector("#api-status");
async function refreshApiStatus() {
  if (!apiStatusEl) return;
  try {
    var r = await fetch("/api/config");
    var j = await r.json();
    if (j.configured) apiStatusEl.textContent = "AI on via " + j.source + " (" + j.model + "). Empty the box to fall back.";
    else apiStatusEl.textContent = "No key set. Uploads use heuristic and deterministic fallback.";
    if (j.baseUrl && apiBaseInput && !apiBaseInput.value) apiBaseInput.placeholder = j.baseUrl;
  } catch (e) { apiStatusEl.textContent = "Key status unavailable."; }
}
if (apiSaveBtn) {
  apiSaveBtn.addEventListener("click", async function () {
    apiStatusEl.textContent = "Saving...";
    try {
      var r = await fetch("/api/config", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKeyInput ? apiKeyInput.value : "", baseUrl: apiBaseInput ? apiBaseInput.value : "" })
      });
      var j = await r.json();
      if (!r.ok) throw new Error(j.error || "Save failed.");
      if (apiKeyInput) apiKeyInput.value = "";
      await refreshApiStatus();
    } catch (e) { apiStatusEl.textContent = "Save failed: " + e.message; }
  });
}
if (apiClearBtn) {
  apiClearBtn.addEventListener("click", async function () {
    apiStatusEl.textContent = "Clearing...";
    try {
      await fetch("/api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clear: true }) });
      try { localStorage.removeItem(REM_KEY); localStorage.removeItem(REM_BASE); localStorage.setItem(REM_KEY + ".on", "0"); paintRemember(); } catch (e) {}
      if (apiKeyInput) apiKeyInput.value = "";
      await refreshApiStatus();
    } catch (e) { apiStatusEl.textContent = "Clear failed: " + e.message; }
  });
}
if (typeof refreshApiStatus === "function") { try { refreshApiStatus(); } catch (e) {} }

// Layout visibility: list stays hidden until Show layout is pressed.
var layoutShowBtn = document.querySelector("#layout-show");
function setLayoutVisible(v) {
  var hero = document.querySelector("#layout-hero");
  var list = document.querySelector("#layout-list");
  var evRow = document.querySelector("#layout-evidence-row");
  if (hero) hero.hidden = !v;
  if (list) list.hidden = !v;
  if (evRow) evRow.hidden = !v;
  if (layoutShowBtn) layoutShowBtn.textContent = v ? "Hide layout" : "Show layout";
}
function isLayoutVisible() {
  var list = document.querySelector("#layout-list");
  return list ? !list.hidden : false;
}
if (layoutShowBtn) {
  layoutShowBtn.addEventListener("click", async function () {
    if (isLayoutVisible()) { setLayoutVisible(false); return; }
    setLayoutVisible(true);
    if (typeof loadLayout === "function" && currentJobId) { try { await loadLayout(); } catch (e) {} }
    else if (typeof renderLayout === "function") { try { renderLayout(); } catch (e) {} }
  });
}

// Remember key: browser localStorage only, auto-restores to server memory on load.
var REM_KEY = "dataforge.apiKey";
var REM_BASE = "dataforge.apiBase";
var apiRememberBtn = document.querySelector("#api-remember");
function isRememberOn() { try { return localStorage.getItem(REM_KEY + ".on") === "1"; } catch (e) { return false; } }
function paintRemember() { if (apiRememberBtn) apiRememberBtn.textContent = "Remember key: " + (isRememberOn() ? "on" : "off"); if (apiRememberBtn) apiRememberBtn.classList.toggle("on", isRememberOn()); }
async function restoreRemembered() {
  paintRemember();
  var k = ""; var b = "";
  try { k = localStorage.getItem(REM_KEY) || ""; b = localStorage.getItem(REM_BASE) || ""; } catch (e) {}
  if (!isRememberOn() || !k) return;
  if (apiBaseInput && !apiBaseInput.value && b) apiBaseInput.value = b;
  try {
    await fetch("/api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey: k, baseUrl: b }) });
    if (apiStatusEl) apiStatusEl.textContent = "Restored remembered key. Uploads use AI.";
    if (typeof refreshApiStatus === "function") await refreshApiStatus();
  } catch (e) { /* status stays */ }
}
if (apiRememberBtn) {
  apiRememberBtn.addEventListener("click", async function () {
    var on = isRememberOn();
    try {
      if (on) { localStorage.removeItem(REM_KEY); localStorage.removeItem(REM_BASE); localStorage.setItem(REM_KEY + ".on", "0"); }
      else {
        var k = apiKeyInput && apiKeyInput.value ? apiKeyInput.value : "";
        var st = null;
        try { st = await (await fetch("/api/config")).json(); } catch (e) {}
        if (!k) { if (apiStatusEl) apiStatusEl.textContent = "Type the key first, then press Remember. (The server never shows a saved key.)"; return; }
        if (k) { localStorage.setItem(REM_KEY, k); localStorage.setItem(REM_BASE, apiBaseInput ? apiBaseInput.value : ""); }
        // key must be typed: server never returns a stored key, env keys need no remembering
        localStorage.setItem(REM_KEY + ".on", "1");
        if (apiKeyInput) apiKeyInput.value = "";
      }
    } catch (e) {}
    paintRemember();
  });
}
if (typeof restoreRemembered === "function") { try { restoreRemembered(); } catch (e) {} }
