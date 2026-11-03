"use strict";
// Lists model IDs visible to your key so you can pick a working one.
// Run: npm run list-models (needs MODEL_API_KEY, optional MODEL_API_BASE).
// Then set it, e.g. PowerShell: $env:MODEL_API_MODEL = "<id>"
// and restart the server before translating.
var api = require("./meta-api");

async function main() {
  const cfg = api.getConfig();
  if (!cfg.apiKey) {
    console.error("MODEL_API_KEY is not set. Export it first (it is never stored in the repo).");
    process.exit(1);
  }
  const res = await fetch(cfg.baseUrl + "/models", {
    headers: { Authorization: "Bearer " + cfg.apiKey }
  });
  if (!res.ok) {
    console.error("List failed: HTTP " + res.status + " " + (await res.text()).slice(0, 200));
    process.exit(1);
  }
  const data = await res.json();
  const ids = (Array.isArray(data.data) ? data.data : []).map(function (m) { return m.id || m.name || JSON.stringify(m); });
  ids.forEach(function (id) { console.log(id); });
  console.log("(" + ids.length + " models at " + cfg.baseUrl + ", current default: " + cfg.model + ")");
}

main().catch(function (e) { console.error("list-models FAILED: " + e.message); process.exit(1); });

