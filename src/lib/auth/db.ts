"use server";

import { User } from ".";
import {
  findUserCredentialsByUsername,
  findUserCredentialsById,
  getPasswordHashByUsername,
} from "../db/sqlite";

export async function findUserByUsername(
  username: string,
): Promise<User | undefined> {
  return findUserCredentialsByUsername(username) as User | undefined;
}

export async function findUserById(id: string): Promise<User | undefined> {
  return findUserCredentialsById(id) as User | undefined;
}

export async function getUserPasswordHash(
  username: string,
): Promise<string | undefined> {
  return getPasswordHashByUsername(username);
}
