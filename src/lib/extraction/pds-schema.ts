import { z } from "zod";

const FeeSchedule = z.object({
  investmentFee: z
    .string()
    .nullable()
    .describe("Investment fee as a percentage or dollar amount, e.g. '0.50% p.a.'"),
  administrationFee: z
    .string()
    .nullable()
    .describe("Administration fee as a percentage or dollar amount"),
  buySellSpread: z
    .string()
    .nullable()
    .describe("Buy/sell spread as a percentage, e.g. '0.05% / 0.05%'"),
  exitFee: z
    .string()
    .nullable()
    .describe("Exit fee amount, or null if not mentioned"),
});

const InvestmentOption = z.object({
  name: z.string().describe("Name of the investment option, e.g. 'Balanced Growth'"),
  returnRate: z
    .string()
    .nullable()
    .describe("Target or historical return rate, e.g. 'CPI + 3.5% p.a.'"),
  riskLevel: z
    .string()
    .nullable()
    .describe("Risk level classification, e.g. 'Medium', 'High', 'Low'"),
});

const LegacyInvestmentOption = z.object({
  name: z.string().describe("Name of the legacy investment option"),
  returnRate: z
    .string()
    .nullable()
    .describe("Target or historical return rate for this legacy option"),
});

export const PdsSchema = z.object({
  metadata: z.object({
    version: z
      .string()
      .nullable()
      .describe("PDS version or issue number, e.g. 'Issue 12'"),
    effectiveDate: z
      .string()
      .nullable()
      .describe("Date the PDS takes effect, e.g. '1 July 2024'"),
    fundName: z.string().describe("Full legal name of the superannuation fund"),
    fundType: z
      .string()
      .nullable()
      .describe("Type of fund, e.g. 'Industry fund', 'Retail fund'"),
    sectors: z
      .string()
      .nullable()
      .describe("Industry sectors the fund primarily serves"),
  }),

  joiningRequirements: z.object({
    residencyRequirement: z
      .string()
      .nullable()
      .describe(
        "Residency or eligibility requirement to join the fund, e.g. 'Australian resident or working in Australia'",
      ),
  }),

  currentProducts: z
    .object({
      description: z
        .string()
        .nullable()
        .describe(
          "Brief description of who these products are for, e.g. 'Open to all current and new members'",
        ),
      investmentOptions: z
        .array(InvestmentOption)
        .describe("Investment options currently available to all members"),
      fees: FeeSchedule.describe(
        "Current fee schedule (Section 7) — applies to members who joined after the legacy cutoff date",
      ),
    })
    .describe(
      "Products and fees currently open to all members (Section 7 of a typical PDS)",
    ),

  legacyProducts: z
    .object({
      eligibilityNote: z
        .string()
        .nullable()
        .describe(
          "Who is eligible for legacy products, e.g. 'Only members who joined before 1 January 2020'",
        ),
      investmentOptions: z
        .array(LegacyInvestmentOption)
        .describe("Investment options only available to legacy/grandfathered members"),
      fees: FeeSchedule.describe(
        "Legacy fee schedule (Section 9) — applies only to grandfathered members",
      ),
    })
    .nullable()
    .describe(
      "Closed/legacy products and fees for grandfathered members only (Section 9 of a typical PDS). Null if the PDS has no legacy section.",
    ),

  insurance: z
    .array(
      z.object({
        type: z
          .string()
          .describe("Type of insurance cover, e.g. 'Death', 'TPD', 'Income Protection'"),
        premium: z
          .string()
          .nullable()
          .describe("Premium amount or calculation method"),
      }),
    )
    .describe("Insurance options available through the fund"),

  preservationAges: z
    .array(
      z.object({
        dateOfBirthRange: z
          .string()
          .describe("Date of birth range, e.g. 'Before 1 July 1960'"),
        preservationAge: z
          .number()
          .int()
          .nullable()
          .describe("Preservation age for this cohort as an integer, e.g. 55"),
      }),
    )
    .describe("Preservation age table mapping date-of-birth ranges to ages"),

  taxation: z
    .array(
      z.object({
        category: z
          .string()
          .describe(
            "Tax category, e.g. 'Concessional contributions', 'Investment earnings'",
          ),
        rate: z
          .string()
          .nullable()
          .describe("Applicable tax rate, e.g. '15%'"),
      }),
    )
    .describe("Key taxation rates applicable to the fund"),
});

export type PdsData = z.infer<typeof PdsSchema>;
