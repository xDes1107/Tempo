"use strict";
var m = require("../../node_modules/pdf-parse");
console.log("exports: " + Object.keys(m).join(","));
var P = m.PDFParse;
console.log("proto: " + Object.getOwnPropertyNames(P.prototype).join(","));
