"use server";

import { logger } from "../lib/logger";
import { definePlugin } from "nitro";

function describe(reason: unknown) {
  return {
    reasonType: reason === null ? "null" : typeof reason,
    reason: reason instanceof Error ? reason.stack ?? reason.message : String(reason),
  };
}

export default definePlugin(() => {
  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled promise rejection", describe(reason));
    process.exit(1);
  });

  process.on("uncaughtException", (reason) => {
    logger.error("Uncaught exception", describe(reason));
    process.exit(1);
  });
});
