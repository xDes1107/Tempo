# Visual Translator — System Architecture

**Status:** Initial proposal  
**Version:** 0.1  
**Project:** Meta Global AI Developer Hackathon

## 1. Purpose

Visual Translator is an AI-powered document understanding and data quality application designed initially for construction product technical datasheets.

The system processes PDF documents, interprets their technical content, extracts structured product information, validates the extracted data, and generates a report containing findings and source evidence.

The architecture is modular so individual components can be improved or replaced without redesigning the entire application.

## 2. High-Level Architecture

The system consists of the following components:

1. Frontend
2. Backend API
3. PDF Processing
4. AI Analysis
5. Data Extraction and Normalization
6. Data Quality Validation
7. Data Persistence
8. Results and Report Generation

Future functionality may include document translation.

## 3. Component Responsibilities

### 3.1 Frontend

The frontend provides the user interface.

Responsibilities:
- Allow users to upload PDF documents.
- Display document processing status.
- Present extracted product information.
- Display data quality findings.
- Link extracted fields and findings to their source evidence.
- Allow users to review and correct extracted values.
- Provide access to the generated report.

### 3.2 Backend API

The backend coordinates the application's components.

Responsibilities:
- Receive and validate document uploads.
- Create and track analysis jobs.
- Coordinate document processing and AI analysis.
- Store and retrieve analysis results.
- Handle errors and incomplete processing.
- Provide results to the frontend.

### 3.3 PDF Processing

The PDF processing component prepares documents for analysis.

Initial tool candidate: MuPDF, through an appropriate library or binding.

Responsibilities:
- Inspect PDF metadata and page count.
- Extract available text and document structure.
- Render pages for visual analysis.
- Preserve page numbers and source coordinates where possible.
- Support both digital PDFs and scanned PDFs, using visual processing or OCR when necessary.

PDF processing does not independently determine the semantic meaning of technical content.

### 3.4 AI Analysis

The AI analysis component interprets document content.

Initial model candidate: Meta Model API, subject to access and testing.

Responsibilities:
- Interpret technical text and visual information.
- Identify product properties, values, units and classifications.
- Interpret tables, diagrams, footnotes and usage restrictions.
- Resolve relationships between relevant document sections.
- Associate candidate facts with source evidence.
- Flag ambiguous or conflicting interpretations.

Model output is treated as candidate information, not automatically verified truth.

### 3.5 Data Extraction and Normalization

This component converts analysis results into structured data.

Responsibilities:
- Map extracted facts to a predefined product schema.
- Normalize supported units and data formats.
- Preserve original wording and values.
- Distinguish missing, unknown, inapplicable and conflicting information.
- Preserve references to the original document and relevant source regions.
- Produce schema-valid JSON.

### 3.6 Data Quality Validation

This component applies explicit validation rules.

Initial checks include:
- Required-field completeness.
- Data type and unit validity.
- Product identifier consistency.
- Duplicate or conflicting values.
- Cross-page and cross-section consistency.
- Evidence completeness.
- Unverified standards or certification claims.

Validation findings must include an explanation, severity, and supporting evidence where available.

Deterministic checks should be implemented in application code wherever practical. AI may assist with contextual interpretation, but it must not silently replace explicit validation rules.

### 3.7 Data Persistence

Initial database: SQLite.

Responsibilities:
- Store document metadata and processing status.
- Store structured product records.
- Store source references and extracted facts.
- Store quality findings.
- Preserve user review decisions and corrections.
- Record relevant analysis and model versions.

JSON is used as a structured data interchange and export format. SQLite provides persistent storage.

### 3.8 Results and Report Generation

The reporting component produces a human-readable PDF report.

The report may contain:
- Product identification and extracted specifications.
- Data quality findings.
- Missing or conflicting values.
- Evidence references to the source document.
- Review status and unresolved issues.

The original uploaded PDF must remain separate from the generated report.

## 4. Processing Flow

1. The user uploads a PDF through the frontend.
2. The backend validates the file and creates an analysis job.
3. PDF Processing extracts available text and renders relevant pages.
4. AI Analysis interprets the content and identifies candidate facts.
5. Data Extraction maps those facts into the product schema.
6. Data Quality Validation checks the structured record.
7. The backend persists the record, evidence, findings and job status.
8. The frontend presents the results for human review.
9. The user may correct values and review the final findings.
10. The reporting component generates a downloadable PDF report.

## 5. Initial Technology Candidates

- Frontend: React and TypeScript.
- Backend: Node.js and TypeScript.
- PDF processing: MuPDF.
- AI analysis: Meta Model API, subject to access and evaluation.
- Structured data: JSON.
- Persistent storage: SQLite.
- Output report: PDF.

The final technology choices may change during implementation based on compatibility, performance, model availability and development time.

## 6. Future Extensions

Translation is outside the initial MVP scope.

Future versions may support:
- Translation of extracted technical content.
- Multilingual document analysis.
- Additional technical document categories.
- Comparison of multiple product documents.
- Export to spreadsheet or ERP-compatible formats.
- More advanced visual-region detection.

## 7. Architectural Principles

1. Separate document processing, AI interpretation, validation, storage and presentation.
2. Preserve source evidence for extracted information.
3. Keep original values separate from normalized values and user corrections.
4. Never treat model-generated output as automatically verified.
5. Make uncertainty and conflicting information visible.
6. Keep AI model integration replaceable.
7. Prioritize a complete, measurable MVP over unnecessary infrastructure.