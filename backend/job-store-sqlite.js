"use strict";
// SQLite job store (built-in node:sqlite, zero new dependencies).
// Same interface as the root src/backend/job-store.js JSON store:
// all(), get(id), create(job), update(id, changes).
// DB file: Production/data/visual-translator.db (gitignored, single-file deploy).

const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const DEFAULT_DB_PATH = path.resolve(__dirname, "..", "data", "visual-translator.db");

const CREATE_JOBS_TABLE = [
  "CREATE TABLE IF NOT EXISTS jobs (",
  "  id TEXT PRIMARY KEY,",
  "  fileName TEXT NOT NULL,",
  "  createdAt TEXT NOT NULL,",
  "  completedAt TEXT,",
  "  status TEXT NOT NULL DEFAULT 'processing',",
  "  pageCount INTEGER,",
  "  recordJson TEXT,",
  "  findingsJson TEXT,",
  "  resultFile TEXT",
  ")",
  "CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(createdAt DESC)"
].join("\n");

function rowToJob(row) {
  if (!row) return null;
  const job = {
    id: row.id,
    fileName: row.fileName,
    createdAt: row.createdAt,
    status: row.status
  };
  if (row.completedAt) job.completedAt = row.completedAt;
  if (row.pageCount !== null && row.pageCount !== undefined) job.pageCount = row.pageCount;
  if (row.resultFile) job.resultFile = row.resultFile;
  if (row.filePath) job.filePath = row.filePath;
  if (row.watermarkFile) job.watermarkFile = row.watermarkFile;
  if (row.watermarkOptions) { try { job.watermarkOptions = JSON.parse(row.watermarkOptions); } catch (e) { job.watermarkOptions = null; } }
  try { if (row.recordJson) job.record = JSON.parse(row.recordJson); } catch (e) { job.record = null; }
  try { if (row.findingsJson) job.findings = JSON.parse(row.findingsJson); } catch (e) { job.findings = []; }
  return job;
}

class SqliteJobStore {
  constructor(dbPath) {
    this.dbPath = dbPath || DEFAULT_DB_PATH;
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec("CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, fileName TEXT NOT NULL, createdAt TEXT NOT NULL, completedAt TEXT, status TEXT NOT NULL DEFAULT 'processing', pageCount INTEGER, recordJson TEXT, findingsJson TEXT, resultFile TEXT)");
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(createdAt DESC)");
    ["filePath TEXT", "watermarkFile TEXT", "watermarkOptions TEXT"].forEach(function (col) {
      try { this.db.exec("ALTER TABLE jobs ADD COLUMN " + col); } catch (e) { /* column already exists */ }
    }, this);
    this._allStmt = this.db.prepare("SELECT * FROM jobs ORDER BY createdAt DESC");
    this._getStmt = this.db.prepare("SELECT * FROM jobs WHERE id = ?");
    this._insertStmt = this.db.prepare(
      "INSERT INTO jobs (id, fileName, createdAt, completedAt, status, pageCount, recordJson, findingsJson, resultFile, filePath, watermarkFile, watermarkOptions) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
  }

  all() {
    return this._allStmt.all().map(rowToJob);
  }

  get(id) {
    return rowToJob(this._getStmt.get(String(id)));
  }

  create(job) {
    this._insertStmt.run(
      job.id,
      job.fileName,
      job.createdAt,
      job.completedAt || null,
      job.status || "processing",
      job.pageCount == null ? null : job.pageCount,
      job.record ? JSON.stringify(job.record) : null,
      job.findings ? JSON.stringify(job.findings) : null,
      job.resultFile || null,
      job.filePath || null,
      job.watermarkFile || null,
      job.watermarkOptions ? JSON.stringify(job.watermarkOptions) : null
    );
    return this.get(job.id);
  }

  update(id, changes) {
    const current = this.get(id);
    if (!current) return null;
    const next = Object.assign({}, current, changes);
    this.db.prepare(
      "UPDATE jobs SET fileName = ?, completedAt = ?, status = ?, pageCount = ?, recordJson = ?, findingsJson = ?, resultFile = ?, filePath = ?, watermarkFile = ?, watermarkOptions = ? WHERE id = ?"
    ).run(
      next.fileName,
      next.completedAt || null,
      next.status || "processing",
      next.pageCount == null ? null : next.pageCount,
      next.record ? JSON.stringify(next.record) : null,
      next.findings ? JSON.stringify(next.findings) : null,
      next.resultFile || null,
      next.filePath || null,
      next.watermarkFile || null,
      next.watermarkOptions ? JSON.stringify(next.watermarkOptions) : null,
      String(id)
    );
    return this.get(id);
  }

  close() {
    this.db.close();
  }
}

module.exports = { SqliteJobStore: SqliteJobStore, DEFAULT_DB_PATH: DEFAULT_DB_PATH };


