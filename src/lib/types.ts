export type TraceStep = {
  type: "thought" | "action" | "observation" | "review";
  content: string;
};

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  trace?: TraceStep[];
  reviewStatus?: "pass" | "warning";
  reviewNote?: string;
};

// ── Extraction pipeline tracing ─────────────────────────────────

export type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type ExtractionRound = {
  round: number;
  role:
    | "initial_extraction"
    | "reflection"
    | "critic"
    | "tool_call"
    | "agent";
  /** What the model was told (validator feedback for reflection, null for initial). */
  input: string | null;
  /** The model's raw message.content. */
  rawOutput: string;
  /** Parsed structured output for this round. */
  snapshot: import("./extraction/pds-schema").PdsData | null;
  /** Validator report for this round (null = passed). */
  validationFeedback: string | null;
  passed: boolean;
  usage: TokenUsage | null;
  durationMs: number;
  model: string;
};

export type ExtractionTrace = {
  rounds: ExtractionRound[];
  totalDurationMs: number;
  totalUsage: TokenUsage;
  finalPassed: boolean;
  reflectionCount: number;
  model: string;
};

export type ExtractionResult = {
  data: import("./extraction/pds-schema").PdsData;
  trace: ExtractionTrace;
};
