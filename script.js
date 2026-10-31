const form = document.querySelector("form");
const fileInput = document.querySelector("#pdf-file");
const fileStatus = document.querySelector("#file-status");
const uploadButton = document.querySelector("button");
const analysisResults = document.querySelector("#analysis-results");
const analysisSummary = document.querySelector("#analysis-summary");
const productName = document.querySelector("#product-name");
const standardsList = document.querySelector("#standards-list");
const measurementsList = document.querySelector("#measurements-list");
const analysisWarning = document.querySelector("#analysis-warning");
const watermarkSection = document.querySelector("#watermark");
const watermarkApply = document.querySelector("#watermark-apply");
const watermarkStatus = document.querySelector("#watermark-status");
const watermarkDownload = document.querySelector("#watermark-download");
const translationSection = document.querySelector("#translation");
const translationStatus = document.querySelector("#translation-status");
const translationResult = document.querySelector("#translation-result");
const translationDescription = document.querySelector("#translation-description");
const translationList = document.querySelector("#translation-list");
const reportDownload = document.querySelector("#report-download");
const csvDownload = document.querySelector("#csv-download");
const companyFormat = document.querySelector("#company-format");
const sheetDownload = document.querySelector("#sheet-download");
const sheetWatermark = document.querySelector("#sheet-watermark");
const sheetJsonDownload = document.querySelector("#sheet-json-download");
const sheetExcelDownload = document.querySelector("#sheet-excel-download");
const aiSection = document.querySelector("#ai-translation-beta");
const aiStatus = document.querySelector("#ai-translation-status");
const aiResult = document.querySelector("#ai-translation-result");
const aiPageImage = document.querySelector("#ai-page-image");
const aiModelsLine = document.querySelector("#ai-models-line");
const aiBlocksList = document.querySelector("#ai-blocks-list");
const trustSection = document.querySelector("#trust");
const trustSummary = document.querySelector("#trust-summary");
const trustList = document.querySelector("#trust-list");
const aiModelSelect = document.querySelector("#ai-model");
const aiReviewRun = document.querySelector("#ai-review-run");
const aiReviewStatus = document.querySelector("#ai-review-status");
const aiReviewList = document.querySelector("#ai-review-list");
let sheetLang = "";

let currentLang = null;

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
  translationSection.hidden = true;
  companyFormat.hidden = true;
  aiSection.hidden = true;
  aiResult.hidden = true;
  aiStatus.textContent = "";
  sheetDownload.hidden = true;
  sheetJsonDownload.hidden = true;
  sheetExcelDownload.hidden = true;
  translationResult.hidden = true;
  reportDownload.hidden = true;
  csvDownload.hidden = true;
  translationStatus.textContent = "";

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
  const name = candidateData.product.name;

  analysisResults.hidden = false;

  analysisSummary.textContent =
    `${result.document.textCharacterCount} characters extracted ` +
    `using ${candidateData.extractionMethod}.`;

  productName.textContent = name
    ? name.value
    : "No candidate product name found.";

  renderList(
    standardsList,
    candidateData.standards.map(function (standard) {
      return standard.value;
    }),
    "No standards found."
  );

  renderList(
    measurementsList,
    candidateData.unclassifiedMeasurements.map(function (measurement) {
      return measurement.originalValue;
    }),
    "No measurements found."
  );

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
    translationSection.hidden = false;
    companyFormat.hidden = false;
    aiSection.hidden = false;
    if (trustSection) { trustSection.hidden = false; }
    loadTrust();
    loadModels();
    sheetLang = "";
    updateSheetLink();
    translationResult.hidden = true;
  reportDownload.hidden = true;
  csvDownload.hidden = true;
    translationStatus.textContent = "";
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
  watermarkStatus.textContent = "Applying watermark (" + position + ")...";
  watermarkDownload.hidden = true;

  try {
    const response = await fetch("/api/jobs/" + currentJobId + "/watermark", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ position: position })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Watermark failed.");
    }

    watermarkStatus.textContent = "Watermark applied (" + result.position + ").";
    watermarkDownload.href = result.downloadUrl;
    watermarkDownload.hidden = false;
  } catch (error) {
    watermarkStatus.textContent = "Watermark failed: " + error.message;
  } finally {
    watermarkApply.disabled = false;
  }
});

const FIELD_LABELS = {
  productName: "Product name",
  manufacturer: "Manufacturer",
  modelOrReference: "Model / reference",
  categoryOrIntendedUse: "Category / intended use",
  materials: "Materials",
  dimensions: "Dimensions",
  sizesAvailable: "Sizes available",
  standardsAndCertifications: "Standards / certifications",
  protectionLevelsOrPerformance: "Protection levels / performance",
  usageRestrictionsOrWarnings: "Usage restrictions / warnings",
  industriesOrApplications: "Industries / applications"
};

const LANG_NAMES = { pt: "Portuguese", es: "Spanish", en: "English" };

function recordHasLang(record, lang) {
  if (!record || !record.fields) return false;
  const keys = Object.keys(FIELD_LABELS);
  for (let i = 0; i < keys.length; i++) {
    const f = record.fields[keys[i]];
    if (f && f.value) {
      if (!f.translation || f.translation.lang !== lang) return false;
    }
  }
  return true;
}

function renderTranslation(record, lang, description) {
  translationList.replaceChildren();

  Object.keys(FIELD_LABELS).forEach(function (key) {
    const f = record.fields[key];
    if (!f || !f.value) return;
    const item = document.createElement("li");
    const t = (f.translation && f.translation.lang === lang)
      ? f.translation.translatedValue
      : "â€”";
    item.textContent = FIELD_LABELS[key] + ": " + f.value + " â†’ " + t;
    translationList.append(item);
  });

  translationDescription.textContent = description || "";
  reportDownload.href = "/api/jobs/" + currentJobId + "/report?lang=" + lang;
  reportDownload.hidden = false;
  csvDownload.href = "/api/jobs/" + currentJobId + "/export?format=csv&lang=" + lang;
  csvDownload.hidden = false;
  currentLang = lang;
  translationResult.hidden = false;
}

async function requestTranslation(lang) {
  if (!currentJobId || !currentRecord) {
    translationStatus.textContent = "Upload a PDF first.";
    return;
  }

  const cachedDesc = (currentRecord.translatedDescriptions || {})[lang] || null;

  if (recordHasLang(currentRecord, lang)) {
    renderTranslation(currentRecord, lang, cachedDesc);
    translationStatus.textContent = "Showing saved " + LANG_NAMES[lang] + " translation.";
    return;
  }

  translationResult.hidden = true;
  reportDownload.hidden = true;
  csvDownload.hidden = true;
  translationStatus.textContent = "Translating to " + LANG_NAMES[lang] + "...";

  try {
    const response = await fetch("/api/jobs/" + currentJobId + "/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetLang: lang })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Translation failed.");
    }

    currentRecord = result.record;
    renderTranslation(currentRecord, lang, result.translatedDescription);

    translationStatus.textContent = result.note
      ? result.note
      : "Translated " + result.applied.length + " fields" + (result.model ? " with " + result.model : "") + ".";
  } catch (error) {
    translationStatus.textContent = "Translation failed: " + error.message;
  }
}

document.querySelectorAll("#translation [data-lang]").forEach(function (button) {
  button.addEventListener("click", function () {
    requestTranslation(button.getAttribute("data-lang"));
  });
});

// Company-format sheet (Goal 3b template render).
function updateSheetLink() {
  if (!currentJobId) {
    sheetDownload.hidden = true;
    sheetJsonDownload.hidden = true;
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
  sheetJsonDownload.href = "/api/jobs/" + currentJobId + "/company-json";
  sheetExcelDownload.href = "/api/jobs/" + currentJobId + "/company-excel" + (sheetLang ? "?lang=" + sheetLang : "");
  sheetExcelDownload.hidden = false;
  sheetJsonDownload.hidden = false;
}

document.querySelectorAll("#company-format [data-sheet-lang]").forEach(function (button) {
  button.addEventListener("click", function () {
    sheetLang = button.getAttribute("data-sheet-lang") || "";
    updateSheetLink();
  });
});

sheetWatermark.addEventListener("change", updateSheetLink);



async function requestAiTranslation(lang) {
  if (!currentJobId) {
    aiStatus.textContent = "Upload a PDF first.";
    return;
  }
  aiResult.hidden = true;
  aiStatus.textContent = "Analyzing page 1 with page vision...";
  try {
    const response = await fetch("/api/jobs/" + currentJobId + "/ai-translation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetLang: lang })
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "AI translation failed.");
    }
    renderAiBlocks(result);
    aiStatus.textContent = "Page 1: " + result.blocks.length + " blocks" + (result.cached ? " (cached)." : " (" + result.modelTranslate + ", SAM: " + result.samStatus + ").");
  } catch (error) {
    aiStatus.textContent = "AI translation failed: " + error.message;
  }
}

function renderAiBlocks(payload) {
  aiBlocksList.replaceChildren();
  aiPageImage.src = payload.imageUrl;
  aiModelsLine.textContent = "Translate: " + payload.modelTranslate + " | Segment: " + payload.samStatus;
  (payload.blocks || []).forEach(function (b) {
    const item = document.createElement("li");
    item.textContent = "[" + b.blockType + " " + b.confidence + "] " + b.sourceText + " -> " + b.translatedText + (b.warning ? " (! " + b.warning + ")" : "");
    aiBlocksList.append(item);
  });
  aiResult.hidden = false;
}

document.querySelectorAll("#ai-translation-beta [data-ai-lang]").forEach(function (button) {
  button.addEventListener("click", function () {
    requestAiTranslation(button.getAttribute("data-ai-lang"));
  });
});



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

function renderTrust(trust) {
  if (!trust) return;
  const c = trust.counts || {};
  trustSummary.textContent = "Score " + trust.score + "% - " + (c.extracted || 0) + " fields extracted, " + (c.supported || 0) + " source-supported, " + (c.missing || 0) + " missing, " + (c.review || 0) + " requiring review.";
  trustList.replaceChildren();
  (trust.fields || []).forEach(function (f) {
    const item = document.createElement("li");
    let extra = "[" + f.status + "] " + f.label + ": " + (f.hasValue ? f.value : "missing");
    if (f.page) extra += " (p. " + f.page + ")";
    item.textContent = extra;
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
    if (aiReviewStatus && result.configured === false) {
      aiReviewStatus.textContent = "Deterministic trust above is final until you run an AI review. " + (result.note || "");
    }
  } catch (error) {
    if (aiReviewStatus) aiReviewStatus.textContent = "Model list unavailable: " + error.message;
  }
}

async function runAiReviewNow() {
  if (!currentJobId) {
    if (aiReviewStatus) aiReviewStatus.textContent = "Upload a PDF first.";
    return;
  }
  if (aiReviewStatus) aiReviewStatus.textContent = "Running AI review...";
  if (aiReviewList) aiReviewList.replaceChildren();
  try {
    const response = await fetch("/api/jobs/" + currentJobId + "/ai-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: aiModelSelect ? aiModelSelect.value : undefined })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "AI review failed.");
    if (result.trust) renderTrust(result.trust);
    const ai = result.ai || {};
    if (aiReviewStatus) aiReviewStatus.textContent = "AI score " + (ai.aiScore == null ? "-" : ai.aiScore + "%") + " via " + (ai.rawModel || ai.model || "model") + (ai.notes ? " - " + ai.notes : "");
    (ai.aiFindings || []).forEach(function (f) {
      const item = document.createElement("li");
      item.textContent = "[" + f.severity + "] " + f.code + (f.field ? " (" + f.field + ")" : "") + ": " + f.message;
      aiReviewList.append(item);
    });
    if (!(ai.aiFindings || []).length && aiReviewList) {
      const item = document.createElement("li");
      item.textContent = "No extra AI findings.";
      aiReviewList.append(item);
    }
  } catch (error) {
    if (aiReviewStatus) aiReviewStatus.textContent = "AI review failed: " + error.message;
  }
}

if (typeof aiReviewRun !== "undefined" && aiReviewRun) {
  aiReviewRun.addEventListener("click", runAiReviewNow);
}
