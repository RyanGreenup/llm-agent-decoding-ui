/**
 * Idempotent database initialisation.
 *
 * Creates all tables (IF NOT EXISTS) and seeds a default admin when the
 * user_credentials table is empty.  Safe to call on every startup.
 */
import { Database } from "bun:sqlite";
import bcrypt from "bcrypt";
import crypto from "node:crypto";

export function initDatabase(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS user_credentials (
      user_id    TEXT PRIMARY KEY,
      username   TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      client_id  TEXT,
      role       TEXT
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS client_supplier_ids (
      client_id  TEXT PRIMARY KEY
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS suppliers (
      user_id    TEXT PRIMARY KEY,
      short_name TEXT,
      status     TEXT,
      role       TEXT
    );
  `);
  db.run(`
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
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS user_api_keys (
      user_id    TEXT PRIMARY KEY REFERENCES user_credentials(user_id),
      encrypted_key BLOB NOT NULL,
      iv         BLOB NOT NULL,
      auth_tag   BLOB NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  seedDefaultAdmin(db);
}

/**
 * If no users exist, create a default admin with a random password
 * and print the credentials to stdout exactly once.
 */
function seedDefaultAdmin(db: Database) {
  const row = db.query("SELECT COUNT(*) AS cnt FROM user_credentials").get() as {
    cnt: number;
  };
  if (row.cnt > 0) return;

  const userId = crypto.randomUUID();
  const username = "admin";
  const password = crypto.randomBytes(32).toString("base64url");
  const passwordHash = bcrypt.hashSync(password, 12);

  db.run(
    "INSERT INTO user_credentials (user_id, username, password_hash, role) VALUES (?, ?, ?, ?)",
    [userId, username, passwordHash, "admin"],
  );

  db.run(
    "INSERT INTO audit_log (user_id, username, event_type, details) VALUES (?, ?, ?, ?)",
    [userId, username, "user_created", "Auto-seeded admin user on first run"],
  );

  console.log(`
╔══════════════════════════════════════════════════╗
║  Default admin account created                   ║
║  Username: ${username.padEnd(38)}║
║  Password: ${password.padEnd(38)}║
║                                                  ║
║  Change this password after first login.         ║
╚══════════════════════════════════════════════════╝
`);
}
