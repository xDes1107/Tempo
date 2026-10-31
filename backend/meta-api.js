"use strict";
// Meta Model API adapter (OpenAI-compatible chat completions).
// Config: MODEL_API_KEY (required), MODEL_API_BASE (optional,
// defaults to https://api.llama.com/v1). The key is read only from
// the environment and never logged or persisted.
// Usage Oct 28+: verify with `npm run verify:meta` (cheap GET /models,
// no tokens spent). Oct 29/30: use chatJson() for AI extraction and
// translation into the locked 10-field shape.
var DEFAULT_BASE_URL = "https://api.meta.ai/v1";
var DEFAULT_MODEL = "muse-spark-1.3"; // operator-tested Oct 28 on api.meta.ai

function getConfig() {
  var apiKey = process.env.MODEL_API_KEY || "";
  var baseUrl = (process.env.MODEL_API_BASE || DEFAULT_BASE_URL).replace(/\/+$/, "");
  return { apiKey: apiKey, baseUrl: baseUrl, model: process.env.MODEL_API_MODEL || DEFAULT_MODEL };
}

function assertConfigured() {
  var cfg = getConfig();
  if (!cfg.apiKey) {
    throw new Error("MODEL_API_KEY is not set. Export it locally, then retry (it is never stored in the repo).");
  }
  return cfg;
}

async function verifyConnection() {
  var cfg = assertConfigured();
  var res = await fetch(cfg.baseUrl + "/models", {
    headers: { Authorization: "Bearer " + cfg.apiKey }
  });
  if (!res.ok) {
    throw new Error("Model API check failed: HTTP " + res.status + " " + (await res.text()).slice(0, 200));
  }
  var data = await res.json();
  var count = Array.isArray(data.data) ? data.data.length : 0;
  return { baseUrl: cfg.baseUrl, modelsVisible: count };
}

async function chatJson(systemPrompt, userContent, options) {
  var cfg = assertConfigured();
  var opts = options || {};
  var res = await fetch(cfg.baseUrl + "/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer " + cfg.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts.model || cfg.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ],
      response_format: { type: "json_object" },
      temperature: opts.temperature == null ? 0 : opts.temperature
    })
  });
  if (!res.ok) {
    const errBody = await res.text();
    let hint = "";
    if (res.status === 404 && errBody.indexOf("model_not_found") !== -1) {
      hint = " The configured model is unknown at this endpoint. Run `npm run list-models` and set MODEL_API_MODEL to a listed ID.";
    if (res.status === 401) {
      hint = " Key rejected at " + cfg.baseUrl + " (key present: " + (cfg.apiKey ? "yes, " + cfg.apiKey.length + " chars" : "no") + "). Set MODEL_API_KEY + MODEL_API_BASE in the SAME terminal before starting the server, then restart.";
    }
    }
    throw new Error("Model API call failed: HTTP " + res.status + " " + errBody.slice(0, 300) + hint);
  }
  var data = await res.json();
  var content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  return { raw: content, json: JSON.parse(content), model: data.model || (opts.model || cfg.model) };
}


async function chatVision(systemPrompt, userText, imageBase64, options) {
  var cfg = assertConfigured();
  var opts = options || {};
  var res = await fetch(cfg.baseUrl + "/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer " + cfg.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts.model || cfg.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: [
          { type: "text", text: userText },
          { type: "image_url", image_url: { url: "data:image/png;base64," + imageBase64 } }
        ] }
      ],
      response_format: { type: "json_object" },
      temperature: opts.temperature == null ? 0 : opts.temperature
    })
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error("Vision call failed: HTTP " + res.status + " " + errBody.slice(0, 300));
  }
  var data = await res.json();
  var content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  return { raw: content, json: JSON.parse(content), model: data.model || (opts.model || cfg.model) };
}
module.exports = { getConfig: getConfig, verifyConnection: verifyConnection, chatJson: chatJson, chatVision: chatVision };

