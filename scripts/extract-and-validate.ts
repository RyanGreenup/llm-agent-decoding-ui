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
import {
  VerificationSchema,
  VERIFY_SYSTEM_PROMPT,
  type VerificationResult,
} from "../src/lib/extraction/verify-extraction.ts";
import { readDocument } from "../src/lib/dataCleaning/convert_to_markdown.ts";
import { DEFAULT_MODEL_ID } from "../src/lib/config.ts";

// ── Prompts & config ────────────────────────────────────────────
// Duplicated from extract-pds.ts (can't import due to SolidStart path aliases).

const MAX_REFLECTION_ROUNDS = 2;

const EXTRACTION_SYSTEM_PROMPT = `You are a specialist data-extraction assistant for Australian superannuation Product Disclosure Statements (PDS).

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

// ── Step 1: Extract with reflection loop ────────────────────────

/** Run extraction → validate → reflect loop, returning best-effort data and any remaining report. */
async function extract(markdown: string, model: string): Promise<{ data: PdsData; report: string | null }> {
  const client = new OpenAI();
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
    { role: "user", content: markdown },
  ];

  console.log(`  input markdown: ${markdown.length} chars (~${Math.round(markdown.length / 4)} tokens)`);

  let lastParsed: PdsData | undefined;
  let lastReport: string | null = null;

  for (let attempt = 0; attempt <= MAX_REFLECTION_ROUNDS; attempt++) {
    const label = attempt === 0 ? "extract" : `reflect ${attempt}/${MAX_REFLECTION_ROUNDS}`;
    console.log(`  [${label}] calling ${model}...`);
    const t0 = performance.now();

    const completion = await client.chat.completions.parse({
      model,
      temperature: 0,
      messages,
      response_format: zodResponseFormat(PdsSchema, "pds_extraction"),
    });

    logUsage(label, t0, completion.usage);

    const message = completion.choices[0]?.message;
    const parsed = message?.parsed;
    if (!parsed) throw new Error("Extraction failed: no parsed response");

    lastParsed = parsed;
    lastReport = validateExtraction(parsed, markdown);
    logValidation(label, lastReport);

    if (!lastReport) return { data: parsed, report: null };

    // Append assistant reply + validator feedback for the next reflection round
    if (attempt < MAX_REFLECTION_ROUNDS) {
      messages.push(
        { role: "assistant", content: message.content ?? "" },
        { role: "user", content: `${REFLECTION_PROMPT}\n\n${lastReport}` },
      );
      const totalChars = messages.reduce((n, m) => n + (typeof m.content === "string" ? m.content.length : 0), 0);
      console.log(`  context so far: ${messages.length} messages, ~${totalChars} chars`);
    }
  }

  return { data: lastParsed!, report: lastReport };
}

// ── Step 2: Independent LLM verification ────────────────────────

/** Fresh-agent verification: compare extracted JSON against source markdown for errors. */
async function verify(data: PdsData, markdown: string, model: string): Promise<VerificationResult> {
  const client = new OpenAI();
  const userContent = `## SOURCE MARKDOWN\n\n${markdown}\n\n## EXTRACTED JSON\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;

  console.log(`  verification input: ${userContent.length} chars (~${Math.round(userContent.length / 4)} tokens)`);
  console.log(`  [verify] calling ${model}...`);
  const t0 = performance.now();

  const completion = await client.chat.completions.parse({
    model,
    temperature: 0,
    messages: [
      { role: "system", content: VERIFY_SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    response_format: zodResponseFormat(VerificationSchema, "pds_verification"),
  });

  logUsage("verify", t0, completion.usage);

  const parsed = completion.choices[0]?.message.parsed;
  if (!parsed) throw new Error("Verification failed: no parsed response");

  logVerification(parsed);
  return parsed;
}

// ── Logging helpers ─────────────────────────────────────────────

function logUsage(label: string, t0: number, usage: OpenAI.Completions.CompletionUsage | undefined) {
  const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
  if (usage) {
    console.log(`  [${label}] ${elapsed}s | prompt: ${usage.prompt_tokens} tok, completion: ${usage.completion_tokens} tok, total: ${usage.total_tokens} tok`);
  } else {
    console.log(`  [${label}] ${elapsed}s`);
  }
}

function logValidation(label: string, report: string | null) {
  if (!report) {
    console.log(`  [${label}] grounding check passed`);
    return;
  }
  console.log(`  [${label}] grounding check FAILED:`);
  const lines = report.split("\n");
  for (const line of lines.slice(0, 10)) console.log(`    ${line}`);
  if (lines.length > 10) console.log(`    ... (truncated)`);
}

function logVerification(result: VerificationResult) {
  console.log(`  [verify] verdict: ${result.verdict}`);
  if (result.issues.length > 0) {
    console.log(`  [verify] ${result.issues.length} issue(s):`);
    for (const issue of result.issues) {
      const icon = issue.severity === "error" ? "x" : "!";
      console.log(`    [${icon}] ${issue.field} (${issue.severity})`);
      console.log(`        extracted: ${issue.extractedValue ?? "(null)"}`);
      console.log(`        expected:  ${issue.expectedValue ?? "(null)"}`);
      console.log(`        reason:    ${issue.explanation}`);
    }
  }
  if (result.missedData.length > 0) {
    console.log(`  [verify] ${result.missedData.length} missed data point(s):`);
    for (const m of result.missedData) {
      console.log(`    - ${m.description}`);
      console.log(`      quote: "${m.sourceQuote}"`);
      if (m.suggestedField) console.log(`      suggested field: ${m.suggestedField}`);
    }
  }
  console.log(`  [verify] summary: ${result.summary}`);
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
const verifyPath = join(ARTIFACTS_DIR, `${stem}.verification.json`);

console.log(`Reading ${inputPath}...`);
const markdown = await readDocument(inputPath);
console.log(`  ${markdown.length} chars of markdown`);

// Step 1: Extract + deterministic grounding
console.log(`\n== Step 1: Extract (with ${model}) ==`);
const { data, report } = await extract(markdown, model);

await writeFile(outPath, JSON.stringify(data, null, 2));
console.log(`JSON written to ${outPath}`);

if (report) {
  console.error(`\nGrounding check still failing after reflection:`);
  console.error(report);
}

// Step 2: Independent LLM verification
console.log(`\n== Step 2: Verify (fresh agent, ${model}) ==`);
const verification = await verify(data, markdown, model);

await writeFile(verifyPath, JSON.stringify(verification, null, 2));
console.log(`Verification written to ${verifyPath}`);

// Results summary
const errorIssues = verification.issues.filter((i) => i.severity === "error");
const warnIssues = verification.issues.filter((i) => i.severity === "warning");

console.log(`\n== Results ==`);
console.log(`  Deterministic grounding: ${report ? "FAIL" : "PASS"}`);
console.log(`  LLM verification:       ${verification.verdict.toUpperCase()}`);
console.log(`    errors:   ${errorIssues.length}`);
console.log(`    warnings: ${warnIssues.length}`);
console.log(`    missed:   ${verification.missedData.length}`);
console.log(`  Summary: ${verification.summary}`);

if (report || verification.verdict === "fail") {
  Deno.exit(1);
}
