#!/usr/bin/env bun
/**
 * Manage users in the SQLite auth database.
 *
 * Reads DATABASE_PATH from the environment (loaded by justfile's dotenv-load).
 *
 * Usage:
 *   bun run scripts/manage_users.ts create-user <username>
 *   bun run scripts/manage_users.ts update-password
 *   bun run scripts/manage_users.ts delete-user
 */
import { Database } from "bun:sqlite";
import { confirm, select } from "@inquirer/prompts";
import crypto from "node:crypto";
import { hashPassword } from "~/lib/auth/hash";

const DEFAULT_ROLE = "viewer";

function getDb(): Database {
  const dbPath = process.env.DATABASE_PATH;
  if (!dbPath) {
    console.error("Error: DATABASE_PATH environment variable is not set.");
    process.exit(1);
  }
  const db = new Database(dbPath);
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");
  return db;
}

const db = getDb();

function generatePassword(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function listUsernames(): string[] {
  return db
    .query("SELECT username FROM user_credentials")
    .all()
    .map((r) => (r as { username: string }).username);
}

function logAuditEvent(
  userId: string | null,
  username: string,
  eventType: string,
  details: string,
  meta?: Record<string, unknown>,
): void {
  db.run(
    "INSERT INTO audit_log (user_id, username, event_type, details, meta) VALUES (?, ?, ?, ?, ?)",
    [userId, username, eventType, details, meta ? JSON.stringify(meta) : null],
  );
}

async function createUser(username: string): Promise<void> {
  const existing = db
    .query("SELECT 1 FROM user_credentials WHERE username = ?")
    .get(username);
  if (existing) {
    console.error(`Error: Username '${username}' already exists!`);
    process.exit(1);
  }

  const userId = crypto.randomUUID();
  const password = generatePassword();
  const passwordHash = await hashPassword(password);

  db.run(
    "INSERT INTO user_credentials (user_id, username, password_hash, role) VALUES (?, ?, ?, ?)",
    [userId, username, passwordHash, DEFAULT_ROLE],
  );

  logAuditEvent(userId, username, "user_created", `Role: ${DEFAULT_ROLE}`, {
    source: "cli",
  });

  console.log("User created successfully!");
  console.log(`User ID: ${userId}`);
  console.log(`Username: ${username}`);
  console.log(`Generated Password: ${password}`);
  console.log("Save this password - it cannot be retrieved later!");
}

async function updatePassword(): Promise<void> {
  const users = listUsernames();
  if (users.length === 0) {
    console.log("No users found in the database!");
    process.exit(1);
  }

  const selectedUsername = await select({
    message: "Select user to update password:",
    choices: users.map((u) => ({ name: u, value: u })),
  });

  const row = db
    .query("SELECT user_id FROM user_credentials WHERE username = ?")
    .get(selectedUsername) as { user_id: string } | null;
  if (!row) {
    console.error(`Error: User '${selectedUsername}' not found!`);
    process.exit(1);
  }

  const newPassword = generatePassword();
  const passwordHash = await hashPassword(newPassword);

  db.run("UPDATE user_credentials SET password_hash = ? WHERE username = ?", [
    passwordHash,
    selectedUsername,
  ]);

  logAuditEvent(
    row.user_id,
    selectedUsername,
    "password_reset",
    "Password reset via CLI",
    { source: "cli" },
  );

  console.log(`Password updated successfully for user: ${selectedUsername}`);
  console.log(`New Password: ${newPassword}`);
  console.log("Save this password - it cannot be retrieved later!");
}

async function deleteUser(): Promise<void> {
  const users = listUsernames();
  if (users.length === 0) {
    console.log("No users found in the database!");
    process.exit(1);
  }

  const selectedUsername = await select({
    message: "Select user to delete:",
    choices: users.map((u) => ({ name: u, value: u })),
  });

  const confirmed = await confirm({
    message: `Are you sure you want to delete user '${selectedUsername}'?`,
    default: false,
  });

  if (!confirmed) {
    console.log("Deletion cancelled.");
    return;
  }

  const row = db
    .query("SELECT user_id FROM user_credentials WHERE username = ?")
    .get(selectedUsername) as { user_id: string } | null;
  if (!row) {
    console.error(`Error: User '${selectedUsername}' not found!`);
    process.exit(1);
  }

  db.run("DELETE FROM user_credentials WHERE username = ?", [selectedUsername]);

  logAuditEvent(
    row.user_id,
    selectedUsername,
    "user_deleted",
    "User deleted via CLI",
    { source: "cli" },
  );

  console.log(`User '${selectedUsername}' deleted successfully.`);
}

// --- Main ---

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case "create-user": {
    const username = args[0];
    if (!username) {
      console.error("Usage: manage_users.ts create-user <username>");
      process.exit(1);
    }
    await createUser(username);
    break;
  }
  case "update-password":
    await updatePassword();
    break;
  case "delete-user":
    await deleteUser();
    break;
  default:
    console.log("Usage: manage_users.ts <command>");
    console.log("");
    console.log("Commands:");
    console.log("  create-user <username>  Create a new user");
    console.log("  update-password         Update password for an existing user");
    console.log("  delete-user             Delete an existing user");
    process.exit(command ? 1 : 0);
}
