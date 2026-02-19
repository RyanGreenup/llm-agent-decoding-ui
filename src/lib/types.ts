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
