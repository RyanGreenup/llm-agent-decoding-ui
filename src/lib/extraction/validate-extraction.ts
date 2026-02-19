"use server";

import type { PdsData } from "./pds-schema";

/**
 * A single grounding failure: the model extracted a value that
 * cannot be found anywhere in the source markdown.
 */
interface GroundingIssue {
  /** Dot-path to the field, e.g. "metadata.fundName" */
  field: string;
  /** The value the model returned */
  extracted: string;
  /** Human-readable explanation */
  reason: string;
}

// ── helpers ──────────────────────────────────────────────────────

/** Normalise whitespace for fuzzy matching (collapse runs, trim). */
function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Returns true when `value` can be located in `markdown`.
 *
 * Strategy:
 *  1. Bare integers (e.g. preservation age "55") use word-boundary matching
 *     so "55" doesn't false-positive inside "1955".
 *  2. Everything else uses a normalised case-insensitive substring match.
 *     For multi-character strings like "Balanced Growth" or "0.50% p.a.",
 *     a substring check is reliable — accidental collisions are unlikely.
 */
function isGrounded(value: string, markdownNorm: string, markdownRaw: string): boolean {
  const v = norm(value);
  if (!v) return true; // empty string is trivially present

  // bare integers: word-boundary match to avoid partial number collisions
  if (/^\d+$/.test(v)) {
    return new RegExp(`\\b${v}\\b`).test(markdownRaw);
  }

  // everything else: normalised substring
  return markdownNorm.includes(v);
}

function check(
  issues: GroundingIssue[],
  field: string,
  value: string | number | null | undefined,
  markdownNorm: string,
  markdownRaw: string,
  required: boolean,
) {
  if (value == null) {
    if (required) {
      issues.push({
        field,
        extracted: "(null)",
        reason: `"${field}" is a required field but the model returned null — this value must be present in the source document.`,
      });
    }
    return;
  }

  const str = String(value);
  if (!isGrounded(str, markdownNorm, markdownRaw)) {
    issues.push({
      field,
      extracted: str,
      reason: `The model extracted "${str}" for "${field}" but this value could not be found in the source markdown. The model may have hallucinated this value or paraphrased the original text.`,
    });
  }
}

// ── main validator ───────────────────────────────────────────────

/**
 * Validates that every critical field extracted by the LLM can be
 * traced back to the source markdown (a "grounding check").
 *
 * Returns `null` when all checks pass, or a human-readable report
 * describing every field that could not be located in the markdown.
 */
export function validateExtraction(
  data: PdsData,
  markdown: string,
): string | null {
  "use server";

  const markdownNorm = norm(markdown);
  const markdownRaw = markdown;
  const issues: GroundingIssue[] = [];

  const c = (
    field: string,
    value: string | number | null | undefined,
    required: boolean,
  ) => check(issues, field, value, markdownNorm, markdownRaw, required);

  // ── metadata ─────────────────────────────────────────────────
  c("metadata.fundName", data.metadata.fundName, true);
  c("metadata.effectiveDate", data.metadata.effectiveDate, false);
  c("metadata.version", data.metadata.version, false);
  c("metadata.fundType", data.metadata.fundType, false);

  // ── joining ──────────────────────────────────────────────────
  c(
    "joiningRequirements.residencyRequirement",
    data.joiningRequirements.residencyRequirement,
    false,
  );

  // ── current products ─────────────────────────────────────────
  data.currentProducts.investmentOptions.forEach((opt, i) => {
    const prefix = `currentProducts.investmentOptions[${i}]`;
    c(`${prefix}.name`, opt.name, true);
    c(`${prefix}.returnRate`, opt.returnRate, false);
    c(`${prefix}.riskLevel`, opt.riskLevel, false);
  });

  const cFees = data.currentProducts.fees;
  c("currentProducts.fees.investmentFee", cFees.investmentFee, false);
  c("currentProducts.fees.administrationFee", cFees.administrationFee, false);
  c("currentProducts.fees.buySellSpread", cFees.buySellSpread, false);
  c("currentProducts.fees.exitFee", cFees.exitFee, false);

  // ── legacy products ──────────────────────────────────────────
  if (data.legacyProducts) {
    c(
      "legacyProducts.eligibilityNote",
      data.legacyProducts.eligibilityNote,
      false,
    );

    data.legacyProducts.investmentOptions.forEach((opt, i) => {
      const prefix = `legacyProducts.investmentOptions[${i}]`;
      c(`${prefix}.name`, opt.name, true);
      c(`${prefix}.returnRate`, opt.returnRate, false);
    });

    const lFees = data.legacyProducts.fees;
    c("legacyProducts.fees.investmentFee", lFees.investmentFee, false);
    c("legacyProducts.fees.administrationFee", lFees.administrationFee, false);
    c("legacyProducts.fees.buySellSpread", lFees.buySellSpread, false);
    c("legacyProducts.fees.exitFee", lFees.exitFee, false);
  }

  // ── insurance ────────────────────────────────────────────────
  data.insurance.forEach((ins, i) => {
    c(`insurance[${i}].type`, ins.type, true);
    c(`insurance[${i}].premium`, ins.premium, false);
  });

  // ── preservation ages ────────────────────────────────────────
  data.preservationAges.forEach((pa, i) => {
    c(`preservationAges[${i}].dateOfBirthRange`, pa.dateOfBirthRange, true);
    c(`preservationAges[${i}].preservationAge`, pa.preservationAge, false);
  });

  // ── taxation ─────────────────────────────────────────────────
  data.taxation.forEach((tx, i) => {
    c(`taxation[${i}].category`, tx.category, true);
    c(`taxation[${i}].rate`, tx.rate, false);
  });

  // ── build report ─────────────────────────────────────────────
  if (issues.length === 0) return null;

  const lines = [
    `Grounding check failed: ${issues.length} field(s) could not be verified against the source markdown.\n`,
  ];

  for (const issue of issues) {
    lines.push(`• ${issue.field}`);
    lines.push(`  Extracted value: ${issue.extracted}`);
    lines.push(`  Problem: ${issue.reason}\n`);
  }

  lines.push(
    "Tip: Re-run extraction with a higher-capability model, or check that the markdown conversion captured all pages of the source document.",
  );

  return lines.join("\n");
}
