/**
 * Authentication database module using PostgreSQL
 *
 * This module provides user lookup functions for authentication.
 * User management (create, update, delete) is handled via Python scripts
 * in the scripts/ directory that connect directly to PostgreSQL.
 *
 * Security notes:
 * - Passwords are stored as bcrypt hashes (never plain text)
 * - All functions use parameterized queries to prevent SQL injection
 * - Uses a restricted database user with minimal permissions
 */

"use server";

import { User } from ".";
import { executeAuthQueryOne } from "../db/postgres/auth-pool";

/**
 * Find a user by their username
 *
 * @param username - The username to search for
 * @returns User object with id, username, and pass_hash if found, undefined otherwise
 */
export async function findUserByUsername(
  username: string,
): Promise<User | undefined> {
  return executeAuthQueryOne<User>(
    `SELECT user_id AS id, username, client_id AS "clientId", role
     FROM auth.user_credentials
     WHERE username = $1`,
    [username],
  );
}

/**
 * Find a user by their ID
 *
 * @param id - The user ID to search for
 * @returns User object with id, username, and pass_hash if found, undefined otherwise
 */
export async function findUserById(id: string): Promise<User | undefined> {
  return executeAuthQueryOne<User>(
    `SELECT user_id AS id, username, client_id AS "clientId", role
     FROM auth.user_credentials
     WHERE user_id = $1`,
    [id],
  );
}

/**
 * Get a user's password hash by username
 * This is a separate function for security - it only retrieves the password hash
 * when specifically needed for authentication
 *
 * @param username - The username to get the password hash for
 * @returns The password hash if user found, undefined otherwise
 */
export async function getUserPasswordHash(
  username: string,
): Promise<string | undefined> {
  const result = await executeAuthQueryOne<{ password_hash: string }>(
    `SELECT password_hash FROM auth.user_credentials WHERE username = $1`,
    [username],
  );
  return result?.password_hash;
}

