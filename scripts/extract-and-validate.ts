#!/usr/bin/env -S deno run -A --no-check
//
// Dev script: extract PDS data from a document, save JSON, run grounding check.
//
// Usage:
//   deno run -A --no-check scripts/extract-and-validate.ts <pds-file> [--model gpt-4.1] [-o out.json]
//
// Reads OPENAI_API_KEY from env.

import { parseArgs } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { PdsSchema, type PdsData } from "../src/lib/extraction/pds-schema.ts";
import { validateExtraction } from "../src/lib/extraction/validate-extraction.ts";
import { readDocument } from "../src/lib/dataCleaning/convert_to_markdown.ts";
import { DEFAULT_MODEL_ID } from "../src/lib/config.ts";

const DEV = true;

// ── prompts (mirrored from extract-pds.ts) ──────────────────────

const SYSTEM_PROMPT = `You are a specialist data-extraction assistant for Australian superannuation Product Disclosure Statements (PDS).

Your task is to read the provided PDS markdown and extract structured data into the given JSON schema.

CRITICAL DISTINCTION — current vs legacy products:
- "currentProducts" contains products and fees that are OPEN to all members (typically described in Section 7 of the PDS). These apply to anyone who joins today.
- "legacyProducts" contains products and fees that are CLOSED and only available to grandfathered members who joined before a specific cutoff date (typically described in Section 9 of the PDS).
- Never mix current fees with legacy fees. If a fee only applies to legacy members, it belongs in legacyProducts.fees, not currentProducts.fees.

Extract values exactly as they appear in the document. For numeric fields (e.g. preservationAge), return the number. For string fields, return the text verbatim. If a field is not mentioned in the document, return null.`;

const REFLECTION_PROMPT = `A deterministic validator compared your extraction against the source markdown and found problems. For each issue listed below, re-read the relevant section of the document and correct the value.

Rules:
- If the validator says a value could not be found, search the document again carefully. Copy the value verbatim — do not paraphrase, round, or infer.
- If the document genuinely does not contain the value, return null for that field.
- Do not change fields that passed validation.

Validator report:`;

const MAX_REFLECTION_ROUNDS = 2;

// ── extraction ──────────────────────────────────────────────────

async function extract(markdown: string, model: string): Promise<{ data: PdsData; report: string | null }> {
  const client = new OpenAI();
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: markdown },
  ];

  if (DEV) {
    const tokenEst = Math.round(markdown.length / 4);
    console.log(`  system prompt: ${SYSTEM_PROMPT.length} chars`);
    console.log(`  input markdown: ${markdown.length} chars (~${tokenEst} tokens)`);
  }

  let lastParsed: PdsData | undefined;
  let lastReport: string | null = null;

  for (let attempt = 0; attempt <= MAX_REFLECTION_ROUNDS; attempt++) {
    const label = attempt === 0 ? "initial extraction" : `reflection ${attempt}/${MAX_REFLECTION_ROUNDS}`;
    console.log(`  [${label}] calling ${model}...`);
    const t0 = performance.now();

    const completion = await client.chat.completions.parse({
      model,
      temperature: 0,
      messages,
      response_format: zodResponseFormat(PdsSchema, "pds_extraction"),
    });

    const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
    const usage = completion.usage;

    if (DEV && usage) {
      console.log(`  [${label}] ${elapsed}s | prompt: ${usage.prompt_tokens} tok, completion: ${usage.completion_tokens} tok, total: ${usage.total_tokens} tok`);
    } else {
      console.log(`  [${label}] ${elapsed}s`);
    }

    const message = completion.choices[0]?.message;
    const parsed = message?.parsed;
    if (!parsed) throw new Error("Extraction failed: no parsed response");

    lastParsed = parsed;
    lastReport = validateExtraction(parsed, markdown);

    if (DEV) {
      if (lastReport) {
        console.log(`  [${label}] grounding check FAILED:`);
        for (const line of lastReport.split("\n").slice(0, 10)) {
          console.log(`    ${line}`);
        }
        if (lastReport.split("\n").length > 10) console.log(`    ... (truncated)`);
      } else {
        console.log(`  [${label}] grounding check passed`);
      }
    }

    if (!lastReport) return { data: parsed, report: null };

    if (attempt < MAX_REFLECTION_ROUNDS) {
      messages.push(
        { role: "assistant", content: message.content ?? "" },
        { role: "user", content: `${REFLECTION_PROMPT}\n\n${lastReport}` },
      );
      if (DEV) {
        const totalChars = messages.reduce((n, m) => n + (typeof m.content === "string" ? m.content.length : 0), 0);
        console.log(`  context so far: ${messages.length} messages, ~${totalChars} chars`);
      }
    }
  }

  return { data: lastParsed!, report: lastReport };
}

// ── CLI ─────────────────────────────────────────────────────────

const { positionals, values } = parseArgs({
  args: Deno.args,
  options: {
    model: { type: "string", short: "m" },
    out: { type: "string", short: "o" },
  },
  allowPositionals: true,
});

const inputPath = positionals[0];
if (!inputPath) {
  console.error("Usage: deno run -A --no-check scripts/extract-and-validate.ts <pds-file> [--model gpt-4.1] [-o out.json]");
  Deno.exit(1);
}

const model = values.model ?? DEFAULT_MODEL_ID;

const ARTIFACTS_DIR = join(import.meta.dirname!, "..", ".artifacts");
await mkdir(ARTIFACTS_DIR, { recursive: true });

const stem = basename(inputPath, extname(inputPath));
const outPath = values.out ?? join(ARTIFACTS_DIR, `${stem}.extracted.json`);

console.log(`Reading ${inputPath}...`);
const markdown = await readDocument(inputPath);
console.log(`  ${markdown.length} chars of markdown`);

console.log(`Extracting with ${model}...`);
const { data, report } = await extract(markdown, model);

await writeFile(outPath, JSON.stringify(data, null, 2));
console.log(`JSON written to ${outPath}`);

if (report) {
  console.error(`\n${report}`);
  Deno.exit(1);
} else {
  console.log("\nAll fields grounded. Extraction looks good.");
}
