# LLM Tracing

This document covers tracing for the PDS extraction pipeline: what data to capture, how the industry structures it, and the approach chosen for this project.

## Why trace

The extraction pipeline makes multiple LLM calls with a reflection loop. Without tracing, failures are invisible: you cannot tell whether the model hallucinated on the first attempt and self-corrected, or whether the validator flagged something the model could never fix. Tracing answers:

- How many reflection rounds did this extraction need?
- What did the model get wrong, and did it fix it?
- How many tokens and how much wall-clock time did each call consume?
- Did validation pass or fail, and on which fields?

## Industry conventions

### The standard hierarchy

The dominant model across Langfuse, OpenTelemetry, and Datadog uses nested spans:

```
Session (optional — groups multi-turn interactions)
└── Trace (one end-to-end operation)
    ├── Span: preprocessing       (I/O, duration)
    ├── Span: LLM call            (model, tokens, cost, duration)
    │   └── Event: prompt/response content
    ├── Span: validation          (pass/fail, issues)
    └── Span: LLM call (retry)   (model, tokens, cost, duration)
```

### OpenTelemetry GenAI semantic conventions

OpenTelemetry defines `gen_ai.*` attributes for LLM spans:

| Attribute | Example |
|---|---|
| `gen_ai.request.model` | `gpt-4.1-nano` |
| `gen_ai.usage.input_tokens` | `4230` |
| `gen_ai.usage.output_tokens` | `812` |
| `startTime` / `endTime` | high-precision timestamps |
| `status` | `success` / `error` |

Prompt and response payloads attach as **events on spans**, not as span attributes. Many backends struggle with large attribute payloads, so the OpenTelemetry LLM Working Group recommends this separation.

### Three tiers of implementation

| Tier | Approach | Trade-off |
|---|---|---|
| **1. In-process** | Plain data structures (arrays/objects) returned with the result | No infra, no UI for free, simplest |
| **2. Self-hosted** | Langfuse or OpenLLMetry — batches traces locally, ships in background | Free UI, needs a running service |
| **3. Full OTel** | CNCF-standard spans exported to Jaeger/Zipkin/Datadog/Grafana | Most portable, most infrastructure |

## Chosen approach: tier 1 (in-process)

The extraction pipeline is a single server function, not a distributed system. The codebase already has `TraceStep` and a `ReasoningTrace` UI component for the chat path. The extraction path uses the same pattern: build a structured trace array in `extractPdsData`, return it alongside the result, and render it in the UI.

### Data model

Each extraction produces an `ExtractionTrace` — an array of `ExtractionTraceStep` objects, one per event in the pipeline:

```ts
type ExtractionTraceStep =
  | { type: "llm_call"; model: string; inputTokens: number; outputTokens: number; durationMs: number }
  | { type: "validation"; passed: boolean; issues: string | null }
  | { type: "reflection"; round: number; feedback: string };
```

This maps to the OpenTelemetry hierarchy, flattened:

- `llm_call` = a Generation span
- `validation` = a Span with pass/fail status
- `reflection` = an Event recording the feedback sent back to the model

### Why not Langfuse or OpenTelemetry now

- The project runs on a single server with one user. Distributed tracing adds complexity without benefit.
- The `ReasoningTrace` component already renders step arrays. Reusing the pattern keeps the UI consistent.
- Migrating to tier 2 or 3 later requires only changing where the trace array is emitted (push to an OTel collector instead of returning it), not restructuring the data.

## Current implementation status

| Component | Status |
|---|---|
| `validate-extraction.ts` — deterministic grounding check | Done |
| `extract-pds.ts` — reflection loop with validator feedback | Done |
| `ExtractionTraceStep` type and trace collection in `extractPdsData` | TODO |
| UI rendering of extraction trace on `/extract` page | TODO |

## References

- [OpenTelemetry: Introduction to Observability for LLM-based Applications](https://opentelemetry.io/blog/2024/llm-observability/)
- [Langfuse: Tracing Data Model](https://langfuse.com/docs/observability/data-model)
- [Langfuse: Observability Overview](https://langfuse.com/docs/observability/overview)
- [Langfuse: OpenTelemetry Integration](https://langfuse.com/integrations/native/opentelemetry)
- [Langfuse: Trace IDs and Distributed Tracing](https://langfuse.com/docs/observability/features/trace-ids-and-distributed-tracing)
- [OpenLLMetry: Open-source Observability for GenAI (GitHub)](https://github.com/traceloop/openllmetry)
- [Portkey: The Complete Guide to LLM Observability](https://portkey.ai/blog/the-complete-guide-to-llm-observability/)
- [lakeFS: LLM Observability Tools Comparison](https://lakefs.io/blog/llm-observability-tools/)
- [Datadog: LLM Observability — Chain Tracing](https://www.datadoghq.com/blog/llm-observability-chain-tracing/)
- [Datadog: LLM Observability Product](https://www.datadoghq.com/product/llm-observability/)
- [Confident AI: Top 7 LLM Observability Tools](https://www.confident-ai.com/knowledge-base/top-7-llm-observability-tools)
- [Neptune.ai: LLM Observability Fundamentals](https://neptune.ai/blog/llm-observability)
- [LangWatch: Top LLM Observability Tools Guide](https://langwatch.ai/blog/top-10-llm-observability-tools-complete-guide-for-2025)
- [Grafana: Complete Guide to LLM Observability with OpenTelemetry](https://grafana.com/blog/a-complete-guide-to-llm-observability-with-opentelemetry-and-grafana-cloud/)
