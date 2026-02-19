export interface ChunkResult {
  text: string;
  _distance: number;
}

function assertFiniteNumber(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number.`);
  }
}

function estimateChunkTokens(text: string): number {
  if (text.length === 0) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

function isValidChunkResult(value: unknown): value is ChunkResult {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const row = value as Record<string, unknown>;
  // TODO: Enforce expected distance bounds once upstream metric is guaranteed
  // (for cosine distance this should typically be within [0, 2]).
  return typeof row.text === "string" &&
    typeof row._distance === "number" &&
    Number.isFinite(row._distance);
}

/**
 * Selects top relevant chunks within a token budget.
 *
 * @param _query Query text (reserved for future reranking strategies).
 * @param results Candidate chunks with LanceDB-style distance values.
 * @param options Selection options.
 * @param options.max_distance Maximum allowed distance. Default: `0.8`.
 * @param options.context_budget Fraction of context window to use. Default: `0.25`.
 * @param options.context_window Total context window size in tokens. Default: `128_000`.
 * @param options.rerank_top_k Number of closest candidates to consider. Default: `20`.
 * @returns Selected chunks, truncated only when the first chunk exceeds budget.
 * @throws {RangeError} If options are non-finite/out of bounds, non-integer where required,
 * or if `results` includes invalid chunk rows.
 */
export function select_chunks(
  _query: string,
  results: ChunkResult[],
  {
    max_distance = 0.8,
    context_budget = 0.25,
    context_window = 128_000,
    rerank_top_k = 20,
  }: {
    max_distance?: number;
    context_budget?: number;
    context_window?: number;
    rerank_top_k?: number;
  } = {},
): ChunkResult[] {
  assertFiniteNumber("max_distance", max_distance);
  assertFiniteNumber("context_budget", context_budget);
  assertFiniteNumber("context_window", context_window);
  assertFiniteNumber("rerank_top_k", rerank_top_k);
  if (max_distance < 0) {
    throw new RangeError("max_distance must be greater than or equal to 0.");
  }
  if (context_budget < 0 || context_budget > 1) {
    throw new RangeError("context_budget must be between 0 and 1.");
  }
  if (context_window <= 0) {
    throw new RangeError("context_window must be greater than 0.");
  }
  if (!Number.isInteger(context_window)) {
    throw new RangeError("context_window must be an integer.");
  }
  if (rerank_top_k < 1) {
    throw new RangeError("rerank_top_k must be greater than or equal to 1.");
  }
  if (!Number.isInteger(rerank_top_k)) {
    throw new RangeError("rerank_top_k must be an integer.");
  }
  if (!results.every((row) => isValidChunkResult(row))) {
    throw new RangeError(
      "results must contain objects with string text and finite numeric _distance.",
    );
  }

  const relevant = results.filter((r) => r._distance <= max_distance);
  if (relevant.length === 0) return [];

  // Python implementation reranks with flashrank cross-encoder.
  // Here we rank by vector distance.
  const ranked = [...relevant]
    .sort((a, b) => a._distance - b._distance)
    .slice(0, rerank_top_k);

  const budgetTokens = Math.floor(context_window * context_budget);
  if (budgetTokens <= 0) return [];
  const selected: ChunkResult[] = [];
  let tokensUsed = 0;
  for (const chunk of ranked) {
    const chunkTokens = estimateChunkTokens(chunk.text);
    if (tokensUsed + chunkTokens > budgetTokens) {
      if (selected.length === 0) {
        selected.push({
          ...chunk,
          text: chunk.text.slice(0, budgetTokens * 4),
        });
      }
      break;
    }
    selected.push(chunk);
    tokensUsed += chunkTokens;
  }

  return selected;
}
