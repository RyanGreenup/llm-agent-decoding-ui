import { PriviligedRoles, requireUser } from "./index";
import { getClientIdByUserId, getRoleByUserId } from "../db/sqlite";

export async function lookupClientId(
  userId: string,
): Promise<string | undefined> {
  "use server";
  return getClientIdByUserId(userId);
}

export async function getUserRole(userId: string): Promise<string | undefined> {
  "use server";
  return getRoleByUserId(userId);
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
