import type { ExtractionResult, ExtractionRound, ExtractionTrace } from "~/lib/types";

export type ExtractionPipelineEvent =
  | {
      type: "pipeline_started";
      maxReflectionRounds: number;
    }
  | {
      type: "round_completed";
      round: ExtractionRound;
      trace: ExtractionTrace;
    }
  | {
      type: "pipeline_completed";
      result: ExtractionResult;
    }
  | {
      type: "pipeline_failed";
      error: string;
    };

export type ExtractStreamRequest = {
  runId?: number;
};

export type ExtractStreamWireEvent =
  | {
      type: "pipeline_started";
      runId: number;
      maxReflectionRounds: number;
    }
  | {
      type: "round_completed";
      runId: number;
      round: ExtractionRound;
      trace: ExtractionTrace;
    }
  | {
      type: "pipeline_completed";
      runId: number;
      path: string;
      data: ExtractionResult["data"];
      trace: ExtractionResult["trace"];
    }
  | {
      type: "pipeline_failed";
      runId: number;
      error: string;
    };
