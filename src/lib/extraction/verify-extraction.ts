"use server";

import { z } from "zod";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { PdsData } from "./pds-schema";
import { DEFAULT_MODEL_ID } from "../config";

// ── verification result schema ──────────────────────────────────

const VerificationIssue = z.object({
  field: z
    .string()
    .describe(
      "Dot-path to the field, e.g. 'metadata.fundName' or 'currentProducts.fees.investmentFee'",
    ),
  severity: z
    .enum(["error", "warning"])
    .describe(
      "error = value is wrong, misclassified, or fabricated; warning = minor concern (e.g. slight rewording)",
    ),
  extractedValue: z
    .string()
    .nullable()
    .describe("The value in the JSON for this field, or null if the field was null"),
  expectedValue: z
    .string()
    .nullable()
    .describe(
      "What the value should be based on the source document, or null if the field should be null",
    ),
  explanation: z
    .string()
    .describe("Concise explanation of what is wrong and why"),
});

const MissedData = z.object({
  description: z
    .string()
    .describe(
      "What data is present in the source but missing from the extraction",
    ),
  sourceQuote: z
    .string()
    .describe("Verbatim quote from the source markdown showing the missed data"),
  suggestedField: z
    .string()
    .nullable()
    .describe(
      "Which schema field this data should map to, or null if no field exists for it",
    ),
});

export const VerificationSchema = z.object({
  verdict: z
    .enum(["pass", "fail"])
    .describe(
      "pass = extraction is correct with no errors; fail = at least one error-severity issue found",
    ),
  issues: z
    .array(VerificationIssue)
    .describe(
      "Every incorrect, misclassified, or fabricated value found. Empty array if none.",
    ),
  missedData: z
    .array(MissedData)
    .describe(
      "Data present in the source document that was NOT captured in the extraction. Empty array if nothing was missed.",
    ),
  summary: z
    .string()
    .describe(
      "2-3 sentence overall assessment of the extraction quality",
    ),
});

export type VerificationResult = z.infer<typeof VerificationSchema>;

// ── system prompt ───────────────────────────────────────────────

export const VERIFY_SYSTEM_PROMPT = `You are an independent QA reviewer for data extracted from Australian superannuation Product Disclosure Statements (PDS).

You will receive two inputs:
1. SOURCE MARKDOWN — the original PDS document converted to markdown.
2. EXTRACTED JSON — structured data that another AI agent extracted from that markdown.

Your job is to compare them and report every discrepancy. You are a fresh reviewer with no prior knowledge of how the extraction was done.

CHECK EACH OF THESE:
- ACCURACY: Does every extracted value match the source document verbatim? Flag any paraphrasing, rounding, or fabrication.
- COMPLETENESS: Is there data in the source that should have been extracted but wasn't? Report it in missedData.
- CLASSIFICATION: Are current vs legacy products correctly separated? Current products (Section 7) are open to all members. Legacy products (Section 9) are closed/grandfathered. A fee or investment option assigned to the wrong category is an error.
- NULL CORRECTNESS: If a field is null in the JSON, verify the source genuinely does not contain that information. A null for data that IS present in the source is an error.
- NUMERIC VALUES: Check that numeric fields (e.g. preservationAge) match the source exactly. A preservation age of 56 when the document says 55 is an error.

RULES:
- Only flag issues you can substantiate with evidence from the source markdown.
- Do not speculate about what the document "might" contain.
- Use severity "error" for wrong/missing/fabricated values. Use "warning" for minor style differences that don't change meaning.
- Set verdict to "pass" only if there are zero error-severity issues.`;

// ── verify function ─────────────────────────────────────────────

export async function verifyExtraction(
  data: PdsData,
  markdown: string,
  model: string = DEFAULT_MODEL_ID,
): Promise<VerificationResult> {
  "use server";

  const client = new OpenAI();
  const userContent = `## SOURCE MARKDOWN\n\n${markdown}\n\n## EXTRACTED JSON\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;

  const completion = await client.chat.completions.parse({
    model,
    temperature: 0,
    messages: [
      { role: "system", content: VERIFY_SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    response_format: zodResponseFormat(VerificationSchema, "pds_verification"),
  });

  const parsed = completion.choices[0]?.message.parsed;
  if (!parsed) {
    throw new Error("Verification failed: no parsed response returned");
  }
  return parsed;
}
