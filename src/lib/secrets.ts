"use server";

import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";

type Secrets = {
  sessionSecret: string;
};

let cached: Secrets | null = null;

export function getSecrets(): Secrets {
  "use server";
  if (cached) return cached;

  // 1. Production: read from Podman-mounted secret files
  if (existsSync("/run/secrets/session_secret")) {
    cached = {
      sessionSecret: readFileSync("/run/secrets/session_secret", "utf8").trim(),
    };
    return cached;
  }

  // 2. Dev: decrypt individual sops files on-the-fly
  const secretsDir = "deploy/secrets";
  if (existsSync(secretsDir)) {
    try {
      const decrypt = (name: string) =>
        execSync(`sops -d ${secretsDir}/${name}.sops`, {
          encoding: "utf8",
        }).trim();
      cached = {
        sessionSecret: decrypt("session_secret"),
      };
      return cached;
    } catch (e) {
      console.warn("Failed to decrypt sops files:", e);
    }
  }

  // 3. Fallback: environment variables
  const sessionSecret = process.env.SESSION_SECRET || "";
  if (!sessionSecret) {
    throw new Error(
      "SESSION_SECRET is not set.\n" +
        "Add one to your .env file:\n\n" +
        '  echo \'SESSION_SECRET="\'$(openssl rand -base64 32)\'"\' >> .env\n',
    );
  }
  cached = { sessionSecret };
  return cached;
}

export const getSessionSecret = () => {
  "use server";
  return getSecrets().sessionSecret;
};
