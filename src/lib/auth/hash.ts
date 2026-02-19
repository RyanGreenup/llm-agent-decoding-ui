import bcrypt from "bcrypt";

/**
 * Hash a password using bcrypt (12 rounds, matching the Python CLI script).
 */
export async function hashPassword(password: string): Promise<string> {
  "use server";
  return await bcrypt.hash(password, 12);
}

/**
 * Verify a password against a stored hash
 *
 * @param password - The plain text password to verify
 * @param hash - The stored bcrypt hash to compare against (must be bcrypt as salt is stored in hash output)
 * @returns Promise that resolves to true if password matches, false otherwise
 */
export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  "use server";
  return await bcrypt.compare(password, hash);
}

