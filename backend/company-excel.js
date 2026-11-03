"use strict";
// Company Excel export - ERP import template format, genuine .xlsx, zero new deps.
// The column layout mirrors misc/XLXS_Template.xls (the company ERP import
// template, which stays untouched): 84 columns, header row + one filled data row.
// buildCompanyExcel(job, options) returns a Buffer ready to download.
// Only columns with real extracted values are filled; ERP list-bound columns
// (tipo, linha, classe, ...) and control flags stay empty for the ERP owner.
// The template example/placeholder row is NOT copied - the download is
// import-ready (headers + data only).
// lang option ("es"): desig_site_es + cor_es come from the Spanish translation
// slots when present; every other cell stays source-language.
// xlsx notes: ZIP container uses stored (uncompressed) entries, all text
// cells are inline strings, control chars illegal in XML are stripped.

var CRC_TABLE = null;

function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      CRC_TABLE[n] = c >>> 0;
    }
  }
  var crc = 0xFFFFFFFF;
  for (var i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function xmlEsc(value) {
  var s = value == null ? "" : String(value);
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function colLetter(index) {
  var s = "";
  var i = index + 1;
  while (i > 0) {
    var m = (i - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

function zipStoreFiles(files) {
  var chunks = [];
  var central = [];
  var offset = 0;
  files.forEach(function (f) {
    var nameBuf = Buffer.from(f.name, "utf8");
    var data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(String(f.data), "utf8");
    var crc = crc32(data);
    var local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034B50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0x6000, 10);
    local.writeUInt16LE(0x5D5F, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);
    chunks.push(local, data);
    var head = Buffer.alloc(46 + nameBuf.length);
    head.writeUInt32LE(0x02014B50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(20, 6);
    head.writeUInt16LE(0, 8);
    head.writeUInt16LE(0, 10);
    head.writeUInt16LE(0x6000, 12);
    head.writeUInt16LE(0x5D5F, 14);
    head.writeUInt32LE(crc, 16);
    head.writeUInt32LE(data.length, 20);
    head.writeUInt32LE(data.length, 24);
    head.writeUInt16LE(nameBuf.length, 28);
    head.writeUInt16LE(0, 30);
    head.writeUInt16LE(0, 32);
    head.writeUInt16LE(0, 34);
    head.writeUInt16LE(0, 36);
    head.writeUInt32LE(0, 38);
    head.writeUInt32LE(offset, 42);
    nameBuf.copy(head, 46);
    central.push(head);
    offset += local.length + data.length;
  });
  var centralStart = offset;
  var centralSize = 0;
  central.forEach(function (h) { chunks.push(h); centralSize += h.length; });
  var end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054B50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(central.length, 8);
  end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralStart, 16);
  end.writeUInt16LE(0, 20);
  chunks.push(end);
  return Buffer.concat(chunks);
}

function inlineCell(ref, text, styleId) {
  var attr = styleId ? ' s="' + styleId + '"' : "";
  return '<c r="' + ref + '"' + attr + ' t="inlineStr"><is><t xml:space="preserve">' + xmlEsc(text) + "</t></is></c>";
}

function sheetXml(name, widths, rows, headerRows) {
  var out = [];
  out.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  out.push('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews>');
  if (widths && widths.length) {
    out.push("<cols>");
    widths.forEach(function (w, i) {
      out.push('<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>');
    });
    out.push("</cols>");
  }
  out.push("<sheetData>");
  rows.forEach(function (cells, r) {
    var ref = r + 1;
    out.push('<row r="' + ref + '">');
    cells.forEach(function (text, c) {
      var style = (headerRows || 0) > r ? "1" : null;
      out.push(inlineCell(colLetter(c) + ref, text, style));
    });
    out.push("</row>");
  });
  out.push("</sheetData></worksheet>");
  return out.join("");
}

function stylesXml() {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    "<fonts><font><sz val=\"11\"/><name val=\"Calibri\"/></font>",
    "<font><b/><sz val=\"11\"/><name val=\"Calibri\"/></font></fonts>",
    "<fills><fill><patternFill patternType=\"none\"/></fill>",
    "<fill><patternFill patternType=\"gray125\"/></fill></fills>",
    "<borders><border><left/><right/><top/><bottom/><diagonal/></border></borders>",
    "<cellStyleXfs count=\"1\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\"/></cellStyleXfs>",
    "<cellXfs count=\"2\">",
    "<xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\" xfId=\"0\"/>",
    "<xf numFmtId=\"0\" fontId=\"1\" fillId=\"0\" borderId=\"0\" xfId=\"0\" applyFont=\"1\"/>",
    "</cellXfs></styleSheet>"
  ].join("");
}

function contentTypesXml(count) {
  var out = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
  ];
  for (var i = 1; i <= count; i++) {
    out.push('<Override PartName="/xl/worksheets/sheet' + i + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>');
  }
  out.push("</Types>");
  return out.join("");
}

function packageRelsXml() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    "</Relationships>";
}

function workbookXml(names) {
  var out = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
  ];
  names.forEach(function (name, i) {
    out.push('<sheet name="' + xmlEsc(name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>');
  });
  out.push("</sheets></workbook>");
  return out.join("");
}

function workbookRelsXml(count) {
  var out = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  ];
  for (var i = 1; i <= count; i++) {
    out.push('<Relationship Id="rId' + i + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + i + '.xml"/>');
  }
  out.push('<Relationship Id="rId' + (count + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>');
  out.push("</Relationships>");
  return out.join("");
}

var SCHEMA_MOD = require("./schema");
var TEMPLATE_MOD = require("./company-template");

// Sheet name kept from misc/XLXS_Template.xls so the export stays a drop-in
// replacement for the template file.
var TEMPLATE_SHEET_NAME = "exp32_32_3042026";

// Exact header row of misc/XLXS_Template.xls (row 0, 84 columns).
// Keep this ASCII-only in source: stock_maximo uses a unicode escape.
var TEMPLATE_HEADERS = [
  "inactivar", "bloq_entrada", "bloq_saida", "servicos", "usagrelhas",
  "site", "pai", "stock", "referencia", "designacao", "ref_site",
  "desig_site", "cor", "tamanho", "ref_fornecedor", "ref2_fornecedor",
  "ean", "ean2_1", "qnt_ean2_emb_1", "qnt_ean2_qtt_1", "ean2_2",
  "qnt_ean2_emb_2", "qnt_ean2_qtt_2", "tipo", "linha", "modelo", "marca",
  "classe", "tipo_at", "unidade", "familia", "no_fornecedor",
  "estab_fornecedor", "fornecedor_habitual", "preco_tabela", "desc_tp1",
  "desc_tp2", "custo_ponderado", "ultimo_custo", "preco_import", "moeda",
  "descricao_documentos", "descricao_tecnica", "desc_fornecedor",
  "cod_antigo", "observ", "preco_vd1", "preco_vd2", "preco_vd3",
  "preco_vd4", "preco_vd5", "qtvendas_2anos", "stock_minimo",
  "stock_m\u00E1ximo", "qtd_cx", "qtd_lote", "tx_iva", "cod_snc",
  "conta_inv", "conta_cev", "mes_tab", "ano_tab", "obs", "usalote",
  "dias_aviso", "art_pautal", "site_link", "cardex", "pentrega", "imagem",
  "volume", "peso_liquido", "peso_bruto", "anexos", "imagens_secundarias",
  "videos", "cor_es", "desig_site_es", "nao_ver_site", "recomendado",
  "site_modelo", "site_subfamilia", "site_familia", "categoria"
];

function fieldValue(record, key) {
  if (!record || !record.fields || !record.fields[key]) return "";
  var v = record.fields[key].value;
  return v == null ? "" : String(v);
}

function translatedValue(record, key, lang) {
  if (!record || !record.fields || !record.fields[key]) return "";
  var f = record.fields[key];
  if (lang && f.translation && f.translation.lang === lang && f.translation.translatedValue) {
    return String(f.translation.translatedValue);
  }
  return "";
}

function technicalText(record) {
  var parts = [];
  if (fieldValue(record, "materials")) parts.push("Materiais: " + fieldValue(record, "materials"));
  if (fieldValue(record, "dimensions")) parts.push("Dimensoes: " + fieldValue(record, "dimensions"));
  if (fieldValue(record, "sizesAvailable")) parts.push("Tamanhos: " + fieldValue(record, "sizesAvailable"));
  if (fieldValue(record, "standardsAndCertifications")) parts.push("Normas: " + fieldValue(record, "standardsAndCertifications"));
  if (fieldValue(record, "protectionLevelsOrPerformance")) parts.push("Desempenho: " + fieldValue(record, "protectionLevelsOrPerformance"));
  if (fieldValue(record, "industriesOrApplications")) parts.push("Aplicacoes: " + fieldValue(record, "industriesOrApplications"));
  if (fieldValue(record, "categoryOrIntendedUse")) parts.push("Categoria: " + fieldValue(record, "categoryOrIntendedUse"));
  return parts.length ? parts.join(". ") + "." : "";
}

// Maps the 16-field record onto the 84 template columns. Columns without a
// trustworthy source (ERP list-bound codes, prices, control flags, ref_site
// which the template marks LEAVE EMPTY) stay empty for the ERP owner.
function buildErpImportRow(record, findings, options) {
  var opts = options || {};
  var lang = (opts.lang || "").toLowerCase();
  var name = fieldValue(record, "productName");
  var model = fieldValue(record, "modelOrReference");
  var maker = fieldValue(record, "manufacturer");
  var ref = model || name;
  var designacao = name && model && model !== name ? name + " (" + model + ")" : (name || model);
  var restrictions = fieldValue(record, "usageRestrictionsOrWarnings");
  var order = fieldValue(record, "orderInfo");
  var observ = [restrictions, order ? "Encomenda: " + order : ""].filter(Boolean).join(" | ");
  var obs = "";
  try { obs = TEMPLATE_MOD.buildRecommendation(record.fields, lang) || ""; } catch (e) { obs = ""; }
  var now = opts.generatedAt ? new Date(opts.generatedAt) : new Date();
  var stampOk = !isNaN(now.getTime());
  var mes = stampOk ? String(now.getMonth() + 1).padStart(2, "0") : "";
  var ano = stampOk ? String(now.getFullYear()) : "";
  var byHeader = {
    referencia: ref,
    designacao: designacao,
    cor: fieldValue(record, "colors"),
    tamanho: fieldValue(record, "sizesAvailable"),
    ref_fornecedor: model,
    ean: fieldValue(record, "ean"),
    modelo: model,
    marca: maker,
    descricao_tecnica: technicalText(record),
    desc_fornecedor: fieldValue(record, "description"),
    observ: observ,
    mes_tab: mes,
    ano_tab: ano,
    obs: obs,
    cor_es: lang === "es" ? translatedValue(record, "colors", "es") : "",
    desig_site_es: lang === "es" ? translatedValue(record, "productName", "es") : "",
    categoria: fieldValue(record, "categorization")
  };
  return TEMPLATE_HEADERS.map(function (h) { return byHeader[h] || ""; });
}

function buildCompanyExcel(job, options) {
  var opts = options || {};
  if (!job || !job.record) throw new Error("Job has no record yet.");
  var record = SCHEMA_MOD.migrateRecord(job.record);
  var findings = Array.isArray(job.findings) ? job.findings : [];
  var lang = (opts.lang || "").toLowerCase();
  var dataRow = buildErpImportRow(record, findings, { lang: lang, generatedAt: opts.generatedAt });
  var widths = TEMPLATE_HEADERS.map(function (h) {
    if (h === "designacao" || h === "desig_site_es") return 42;
    if (h === "descricao_tecnica" || h === "desc_fornecedor") return 60;
    if (h === "observ" || h === "obs") return 44;
    if (h === "referencia" || h === "modelo" || h === "marca" || h === "ref_fornecedor") return 24;
    return 16;
  });
  var xml = sheetXml(TEMPLATE_SHEET_NAME, widths, [TEMPLATE_HEADERS, dataRow], 1);
  var files = [
    { name: "[Content_Types].xml", data: contentTypesXml(1) },
    { name: "_rels/.rels", data: packageRelsXml() },
    { name: "xl/workbook.xml", data: workbookXml([TEMPLATE_SHEET_NAME]) },
    { name: "xl/_rels/workbook.xml.rels", data: workbookRelsXml(1) },
    { name: "xl/styles.xml", data: stylesXml() },
    { name: "xl/worksheets/sheet1.xml", data: xml }
  ];
  return zipStoreFiles(files);
}

module.exports = {
  buildCompanyExcel: buildCompanyExcel,
  buildErpImportRow: buildErpImportRow,
  TEMPLATE_HEADERS: TEMPLATE_HEADERS,
  TEMPLATE_SHEET_NAME: TEMPLATE_SHEET_NAME,
  crc32: crc32,
  zipStoreFiles: zipStoreFiles
};

