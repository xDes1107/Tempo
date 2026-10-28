"use strict";
// Cheap connectivity check: GET /models only, spends no tokens.
// Run: npm run verify:meta (needs MODEL_API_KEY in your shell).
var api = require("./meta-api");
api.verifyConnection().then(function (info) {
  console.log("Model API reachable at " + info.baseUrl + " (" + info.modelsVisible + " models visible).");
}).catch(function (e) {
  console.error("verify:meta FAILED: " + e.message);
  process.exit(1);
});
