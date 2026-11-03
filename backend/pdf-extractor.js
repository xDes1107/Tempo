const { PDFParse } = require("pdf-parse");

async function extractPdfText(fileBuffer) {
  const parser = new PDFParse({
    data: fileBuffer
  });

  try {
    const result = await parser.getText();

    return result.text.trim();
  } finally {
    await parser.destroy();
  }
}

module.exports = {
  extractPdfText
};
