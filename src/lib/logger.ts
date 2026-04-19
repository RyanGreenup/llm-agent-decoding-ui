"use server";

import { createConsola } from "consola";

const isProd = process.env.NODE_ENV === "production";

function makeJsonReporter() {
  return {
    log(logObj: {
      date: Date;
      type: string;
      tag: string;
      args: unknown[];
    }) {
      const { date, type, tag, args } = logObj;
      const [first, second] = args;

      let msg: string | undefined;
      let meta: Record<string, unknown> = {};

      if (first instanceof Error) {
        msg = first.message;
        meta = { err: { message: first.message, stack: first.stack } };
        if (second !== null && typeof second === "object" && !Array.isArray(second)) {
          meta = { ...meta, ...(second as Record<string, unknown>) };
        }
      } else if (typeof first === "string") {
        msg = first;
        if (second !== null && typeof second === "object" && !Array.isArray(second)) {
          meta = second as Record<string, unknown>;
        }
      } else if (first !== null && typeof first === "object" && !Array.isArray(first)) {
        meta = first as Record<string, unknown>;
      }

      const entry: Record<string, unknown> = {
        ts: date.toISOString(),
        lvl: type,
        ...(tag ? { tag } : {}),
        ...(msg !== undefined ? { msg } : {}),
        ...meta,
      };

      process.stdout.write(JSON.stringify(entry) + "\n");
    },
  };
}

export const logger = createConsola({
  level: isProd ? 3 : 5,
  ...(isProd ? { reporters: [makeJsonReporter()] } : {}),
});

export const authLog = logger.withTag("auth");
export const extractLog = logger.withTag("extract");
export const chatLog = logger.withTag("chat");
export const ragLog = logger.withTag("rag");
export const dbLog = logger.withTag("db");
export const docLog = logger.withTag("doc");
export const secretsLog = logger.withTag("secrets");
export const auditLog = logger.withTag("audit");
