"use server";

import { Database } from "bun:sqlite";
import { initDatabase } from "./init";

let _db: Database | null = null;

function getDb(): Database {
  if (!_db) {
    const dbPath = process.env.DATABASE_PATH;
    if (!dbPath) {
      throw new Error("DATABASE_PATH environment variable is not set");
    }
    _db = new Database(dbPath);
    _db.run("PRAGMA journal_mode = WAL;");
    _db.run("PRAGMA foreign_keys = ON;");
    initDatabase(_db);
  }
  return _db;
}

// ── User credential queries ────────────────────────────────────────

type UserRow = {
  id: string;
  username: string;
  clientId: string;
  role: string | null;
};

export function findUserCredentialsByUsername(
  username: string,
): UserRow | undefined {
  "use server";
  const db = getDb();
  return db
    .query(
      `SELECT user_id AS id, username, client_id AS clientId, role
       FROM user_credentials WHERE username = ?`,
    )
    .get(username) as UserRow | undefined;
}

export function findUserCredentialsById(id: string): UserRow | undefined {
  "use server";
  const db = getDb();
  return db
    .query(
      `SELECT user_id AS id, username, client_id AS clientId, role
       FROM user_credentials WHERE user_id = ?`,
    )
    .get(id) as UserRow | undefined;
}

export function getPasswordHashByUsername(
  username: string,
): string | undefined {
  "use server";
  const db = getDb();
  const row = db
    .query(`SELECT password_hash FROM user_credentials WHERE username = ?`)
    .get(username) as { password_hash: string } | undefined;
  return row?.password_hash;
}

export function getClientIdByUserId(userId: string): string | undefined {
  "use server";
  const db = getDb();
  const row = db
    .query(`SELECT client_id FROM user_credentials WHERE user_id = ?`)
    .get(userId) as { client_id: string } | undefined;
  return row?.client_id;
}

export function getRoleByUserId(userId: string): string | undefined {
  "use server";
  const db = getDb();
  const row = db
    .query(`SELECT role FROM user_credentials WHERE user_id = ?`)
    .get(userId) as { role: string } | undefined;
  return row?.role;
}

// ── Audit log ──────────────────────────────────────────────────────

export function insertAuditLog(entry: {
  userId: string | null;
  username: string;
  eventType: string;
  details: string;
  ipAddress: string | null;
  meta: string | null;
}): void {
  "use server";
  const db = getDb();
  db.query(
    `INSERT INTO audit_log (user_id, username, event_type, details, ip_address, meta)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    entry.userId,
    entry.username,
    entry.eventType,
    entry.details,
    entry.ipAddress,
    entry.meta,
  );
}
