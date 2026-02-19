import { PriviligedRoles, requireUser } from "./index";
import { executeAuthQueryOne } from "../db/sqlite";

export async function lookupClientId(
  userId: string,
): Promise<string | undefined> {
  "use server";

  const result = await executeAuthQueryOne<{ client_id: string }>(
    `SELECT client_id FROM user_credentials WHERE user_id = ?`,
    [userId],
  );

  return result?.client_id;
}

export async function getUserRole(userId: string): Promise<string | undefined> {
  "use server";

  const result = await executeAuthQueryOne<{ role: string }>(
    `SELECT role FROM user_credentials WHERE user_id = ?`,
    [userId],
  );

  return result?.role;
}

export async function isAuthorizedToSeeAdmin(): Promise<boolean> {
  "use server";

  try {
    const user = await requireUser();
    const role = await getUserRole(user.id);
    return role ? PriviligedRoles.includes(role) : false;
  } catch {
    return false;
  }
}
