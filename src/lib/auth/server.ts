import { useSession } from "vinxi/http";
import { findUserByUsername, getUserPasswordHash } from "./db";
import { verifyPassword } from "./hash";
import { getSessionSecret } from "../secrets";

("use server");

const SESSION_SECRET = getSessionSecret();

export async function login(username: string, password: string) {
  const user = await findUserByUsername(username);
  if (!user) throw new Error("Invalid login");

  const passwordHash = await getUserPasswordHash(username);
  if (!passwordHash) throw new Error("Invalid login");

  const isValid = await verifyPassword(password, passwordHash);
  if (!isValid) throw new Error("Invalid login");

  return { id: user.id, username: user.username };
}

export async function logout() {
  const session = await getSession();
  await session.clear();
}

export function getSession() {
  return useSession({
    password: SESSION_SECRET,
  });
}
