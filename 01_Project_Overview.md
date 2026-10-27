Current Idea:

A Visual Translator Tool, that leverages AI to analyse PDF files for data extraction, analysis and quality checks, with a future translation feature.

In plain terms:

01

Frontend

User uploads a technical PDF

02

Backend API

Validates the upload and creates an analysis job

03

PDF Processing

MuPDF renders pages and extracts available text and layout

04

AI Analysis

Interprets product information, tables, diagrams and context

05

Extraction & Normalization

Maps findings into a defined JSON schema

06

Data Quality Validation

Checks required fields, units, consistency and evidence

07

Storage

SQLite stores records, findings and processing status

08

Results & Reporting

Frontend presents findings and generates a downloadable PDF report


Future extension: Translation

Translate extracted content or reports while preserving source values and evidence.

