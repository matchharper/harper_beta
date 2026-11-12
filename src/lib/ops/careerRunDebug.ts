export type CareerRunTool = {
  id: string;
  turn: number;
  name: string;
  input?: unknown;
  durationMs: number | null;
  status: "running" | "read" | "preview" | "skipped" | "failed";
};

export type CareerRunContact = {
  channel: "email" | "chat";
  subject?: string;
  text: string;
};

export type CareerRunUsage = {
  calls: number;
  unpriced: number;
  estimatedUsd: number | null;
  models: string[];
};

export type CareerRunStreamEvent =
  | { type: "started"; account: string; trigger: string }
  | {
      type: "turn";
      turn: number;
      phase: "started" | "returned" | "failed";
      model?: string;
      usage: CareerRunUsage;
    }
  | { type: "tool"; tool: CareerRunTool }
  | { type: "contact"; contact: CareerRunContact }
  | { type: "completed"; elapsedMs: number; outcome: string; usage: CareerRunUsage }
  | { type: "error"; message: string };
