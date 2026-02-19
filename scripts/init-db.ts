#!/usr/bin/env bun
/**
 * Initialise the SQLite database schema.
 *
 * Called by manage_users.py (via subprocess) to ensure tables exist
 * before the Python script tries to query them.
 */
import Database from "better-sqlite3";

const dbPath = process.env.DATABASE_PATH;
if (!dbPath) {
  console.error("Error: DATABASE_PATH environment variable is not set");
  process.exit(1);
}

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS user_credentials (
    user_id    TEXT PRIMARY KEY,
    username   TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    client_id  TEXT,
    role       TEXT
  );

  CREATE TABLE IF NOT EXISTS client_supplier_ids (
    client_id  TEXT PRIMARY KEY
  );

  CREATE TABLE IF NOT EXISTS suppliers (
    user_id    TEXT PRIMARY KEY,
    short_name TEXT,
    status     TEXT,
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

db.close();
console.log("Database schema initialised.");
