import type { AnswerExampleLookupResult } from "@/lib/serviceAnswerExamples";

export type OpsCompanyAnswerExampleDebugConfiguration = {
  audience: "company";
  embeddingModel: string;
  minScore: number;
  timeoutMs: number;
  topK: number;
};

export type OpsCompanyAnswerExampleDebugInput = {
  message?: unknown;
  minScore?: unknown;
  topK?: unknown;
};

export type OpsCompanyAnswerExampleDebugResponse = {
  configuration: OpsCompanyAnswerExampleDebugConfiguration;
  durationMs: number;
  lookupInstruction: string;
  matches: AnswerExampleLookupResult[];
  normalizedInput: string;
  promptBlock: string | null;
};
