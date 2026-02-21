#!/usr/bin/env bun
/**
 * Initialise the SQLite database schema.
 *
 * Run directly to ensure tables exist and seed the default admin user
 * before using manage_users.ts.
 */
import { Database } from "bun:sqlite";
import { initDatabase } from "../src/lib/db/init";

const dbPath = process.env.DATABASE_PATH;
if (!dbPath) {
  console.error("Error: DATABASE_PATH environment variable is not set");
  process.exit(1);
}

const db = new Database(dbPath);
db.run("PRAGMA journal_mode = WAL");
db.run("PRAGMA foreign_keys = ON");

initDatabase(db);

db.close();
console.log("Database schema initialised.");
