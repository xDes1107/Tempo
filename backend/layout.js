"use strict";
// Option 1 visual prompt: user-defined sheet layout, no canvas.
// Layout shape: { hero: [keys], specOrder: [keys], hidden: [keys], showEvidence: bool, updatedAt }
// All keys validated against schema FIELD_KEYS. Unknown keys dropped.
var FIELD_KEYS = [];
try { FIELD_KEYS = require("./schema").FIELD_KEYS || []; } catch (e) { FIELD_KEYS = []; }
var DEFAULT_HERO = ["manufacturer", "description", "standardsAndCertifications", "sizesAvailable", "colors", "categorization"];
function cleanList(list) {
  var out = [];
  (list || []).forEach(function (k) {
    if (FIELD_KEYS.indexOf(k) !== -1 && out.indexOf(k) === -1) out.push(k);
  });
  return out;
}
function defaultLayout() {
  return { hero: DEFAULT_HERO.slice(), specOrder: FIELD_KEYS.slice(), hidden: [], showEvidence: true, updatedAt: new Date().toISOString() };
}
function normalizeLayout(input) {
  var base = defaultLayout();
  if (!input || typeof input !== "object") return base;
  var hero = cleanList(input.hero);
  var order = cleanList(input.specOrder);
  var hidden = cleanList(input.hidden);
  FIELD_KEYS.forEach(function (k) { if (order.indexOf(k) === -1) order.push(k); });
  if (!hero.length) hero = base.hero.slice();
  return { hero: hero, specOrder: order, hidden: hidden, showEvidence: input.showEvidence === false ? false : true, updatedAt: new Date().toISOString() };
}
function visibleSpecKeys(layout) {
  var l = normalizeLayout(layout);
  var hid = {};
  l.hidden.forEach(function (k) { hid[k] = true; });
  return l.specOrder.filter(function (k) { return !hid[k]; });
}
function buildLayoutPrompt(record, layout) {
  var system = [
    "You are a datasheet layout assistant.",
    "Given extracted fields and a user layout (hero fields, spec order, hidden fields),",
    "return STRICT JSON only: {\"suggestedHero\": [keys], \"suggestedOrder\": [keys], \"notes\": \"short string\"}.",
    "Rules: only use keys from the input lists. Never invent fields. Prefer valued, evidenced fields in hero."
  ].join(" ");
  var user = JSON.stringify({ fields: Object.keys((record && record.fields) || {}), layout: normalizeLayout(layout) });
  return { system: system, user: user };
}
module.exports = { defaultLayout: defaultLayout, normalizeLayout: normalizeLayout, visibleSpecKeys: visibleSpecKeys, buildLayoutPrompt: buildLayoutPrompt };