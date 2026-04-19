"use server";

import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { secretsLog } from "./logger";

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
    secretsLog.debug("secrets.loaded", { source: "podman" });
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
      secretsLog.debug("secrets.loaded", { source: "sops" });
      return cached;
    } catch (e) {
      secretsLog.warn("secrets.sops_failed", { err: e instanceof Error ? e.message : String(e) });
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
  secretsLog.debug("secrets.loaded", { source: "env" });
  return cached;
}

export const getSessionSecret = () => {
  "use server";
  return getSecrets().sessionSecret;
};
