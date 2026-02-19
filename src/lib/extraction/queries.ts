"use server";

import { action } from "@solidjs/router";
import { getRawDocPath } from "~/lib/dataCleaning/convert_to_markdown";
import { extractPdsFromFile } from "./extract-pds";
import type { PdsData } from "./pds-schema";
import type { ExtractionTrace } from "../types";

export const extractPds = action(async () => {
  "use server";
  const path = await getRawDocPath();
  const { data, trace } = await extractPdsFromFile(path);
  return { path, data, trace } as {
    path: string;
    data: PdsData;
    trace: ExtractionTrace;
  };
}, "extractPds");
