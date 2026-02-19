import { useSession } from "vinxi/http";
import { findUserByUsername, getUserPasswordHash } from "./db";
import { verifyPassword } from "./hash";
import { getSessionSecret } from "../secrets";

("use server");

export async function login(username: string, password: string) {
  "use server";
  const user = await findUserByUsername(username);
  if (!user) throw new Error("Invalid login");

  const passwordHash = await getUserPasswordHash(username);
  if (!passwordHash) throw new Error("Invalid login");

  const isValid = await verifyPassword(password, passwordHash);
  if (!isValid) throw new Error("Invalid login");

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
