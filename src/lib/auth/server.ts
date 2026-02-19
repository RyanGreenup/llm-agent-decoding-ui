import { useSession } from "vinxi/http";
import { findUserByUsername, getUserPasswordHash } from "./db";
import { verifyPassword } from "./hash";
import { getSessionSecret } from "../secrets";

("use server");

export type LoginFailureReason = "user_not_found" | "invalid_password";

export class LoginFailureError extends Error {
  reason: LoginFailureReason;

  constructor(reason: LoginFailureReason) {
    super("Invalid login");
    this.name = "LoginFailureError";
    this.reason = reason;
  }
}

export async function login(username: string, password: string) {
  "use server";
  const user = await findUserByUsername(username);
  if (!user) throw new LoginFailureError("user_not_found");

  const passwordHash = await getUserPasswordHash(username);
  if (!passwordHash) throw new LoginFailureError("invalid_password");

  const isValid = await verifyPassword(password, passwordHash);
  if (!isValid) throw new LoginFailureError("invalid_password");

  return { id: user.id, username: user.username };
}

export async function logout() {
  "use server";
  const session = await getSession();
  await session.clear();
}

export function getSession() {
  "use server";
  return useSession({
    password: getSessionSecret(),
  });
}
