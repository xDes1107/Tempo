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

let selectedFile = null;

uploadButton.disabled = true;

fileInput.addEventListener("change", function () {
  selectedFile = fileInput.files[0];
  analysisResults.hidden = true;

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
      "http://localhost:7500/api/documents",
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

    fileStatus.textContent =
      `Complete. ${result.document.textCharacterCount} characters extracted. ` +
      `Saved as ${result.resultFile}.`;
  } catch (error) {
    fileStatus.textContent = `Upload failed: ${error.message}`;
  } finally {
    uploadButton.disabled = false;
  }
});