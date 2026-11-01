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

function showCandidateResults(result) {
  const candidateData = result.candidateData;

  analysisResults.hidden = false;

  analysisSummary.textContent =
    `${result.document.textCharacterCount} characters extracted ` +
    `using ${candidateData.extractionMethod}. See the Trust list for every field and its evidence status.`;

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
      aiExtractStatus.textContent = "Deterministic trust above is final until you enhance with AI. " + (result.note || "");
    }
  } catch (error) {
    if (aiExtractStatus) aiExtractStatus.textContent = "Model list unavailable: " + error.message;
  }
}

const aiExtractRun = document.querySelector("#ai-extract-run");
const aiExtractStatus = document.querySelector("#ai-extract-status");

function renderAiExtractedRecord(record) {
  if (!record) return;
  analysisSummary.textContent =
    "Enhanced by " + (record.extractionEngine || "AI") + ". See the Trust list for every field and its evidence status.";
}
async function runAiExtractNow() {
  if (!currentJobId) {
    if (aiExtractStatus) aiExtractStatus.textContent = "Upload a PDF first.";
    return;
  }
  const preEnhanceTrust = lastTrust;
  if (aiExtractStatus) aiExtractStatus.textContent = "Running AI enhancement...";
  try {
    const response = await fetch("/api/jobs/" + currentJobId + "/ai-extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: aiModelSelect ? aiModelSelect.value : undefined })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "AI enhancement failed.");
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
    if (aiExtractStatus) aiExtractStatus.textContent = "AI enhancement failed: " + error.message;
  }
}

if (typeof aiExtractRun !== "undefined" && aiExtractRun) {
  aiExtractRun.addEventListener("click", runAiExtractNow);
}
