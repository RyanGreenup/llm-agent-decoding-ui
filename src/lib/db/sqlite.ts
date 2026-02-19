"use server";

import Database from "better-sqlite3";

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    const dbPath = process.env.DATABASE_PATH;
    if (!dbPath) {
      throw new Error("DATABASE_PATH environment variable is not set");
    }
    _db = new Database(dbPath);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
    initSchema(_db);
  }
  return _db;
}

/**
 * Create tables if they don't already exist.
 * This is the SQLite equivalent of the PostgreSQL schema that was
 * previously spread across auth.*, bunnings.*, and field_ops.* schemas.
 */
function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_credentials (
      user_id    TEXT PRIMARY KEY,
      username   TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      client_id  TEXT,
      role       TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    TEXT,
      username   TEXT NOT NULL,
      event_type TEXT NOT NULL,
      details    TEXT,
      ip_address TEXT,
      meta       TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_api_keys (
      user_id    TEXT PRIMARY KEY REFERENCES user_credentials(user_id),
      encrypted_key BLOB NOT NULL,
      iv         BLOB NOT NULL,
      auth_tag   BLOB NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

/**
 * Execute a query and return all matching rows.
 */
export function executeAuthQuery<T>(
  sql: string,
  params: unknown[] = [],
): T[] {
  "use server";
  const db = getDb();
  const stmt = db.prepare(sql);
  return stmt.all(...params) as T[];
}

/**
 * Execute a query and return the first matching row, or undefined.
 */
export function executeAuthQueryOne<T>(
  sql: string,
  params: unknown[] = [],
): T | undefined {
  "use server";
  const db = getDb();
  const stmt = db.prepare(sql);
  return stmt.get(...params) as T | undefined;
}

/**
 * Execute a write statement (INSERT, UPDATE, DELETE) and return run info.
 */
export function executeRun(
  sql: string,
  params: unknown[] = [],
): Database.RunResult {
  "use server";
  const db = getDb();
  const stmt = db.prepare(sql);
  return stmt.run(...params);
}
