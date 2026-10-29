import type {
  InspectionLinkSearch,
  InspectionUsage,
} from "./applicationFormInspection";

export type ApplicationQuestion = {
  label: string;
  type: string;
  required: boolean | null;
  options: string[];
  fileTypes: string[];
  multiple: boolean | null;
  instructions: string;
};

export type ApplicationQuestions = {
  status: "read" | "partial" | "unavailable";
  url: string;
  questions: ApplicationQuestion[];
  limitations: string[];
  execution?: QuestionsExecution;
  linkResolution?: {
    originalUrl: string;
    savedUrl: string | null;
    searches: Pick<InspectionLinkSearch, "query" | "selectedUrl" | "reason">[];
    usage: InspectionUsage;
    attempts: {
      url: string;
      status: ApplicationQuestions["status"];
      execution?: QuestionsExecution;
    }[];
  };
};

export const questionProviders = [
  "current",
  "browserbase",
  "browser-use",
] as const;
export type QuestionProvider = (typeof questionProviders)[number];
export const questionProviderLabels: Record<QuestionProvider, string> = {
  current: "옵션 1 · 기존 방식",
  browserbase: "옵션 2 · Browserbase Agents API",
  "browser-use": "옵션 3 · Browser Use Agents API",
};
export type QuestionsExecution = {
  provider: QuestionProvider;
  durationMs: number;
  runId?: string;
  sessionId?: string;
  model: string | null;
  reasoning?: string;
  inputTokens?: number;
  outputTokens?: number;
  runCostUsd?: string;
  sessionCost?: {
    llmCostUsd: string;
    searchCostUsd: string;
    browserCostUsd: string;
    proxyCostUsd: string;
    totalCostUsd: string;
  };
  warnings: string[];
};

export function inspectionOutcome(
  status: ApplicationQuestions["status"],
  count: number,
  noun = "항목"
) {
  if (status === "unavailable") return "지원 양식을 가져오지 못했습니다";
  if (status === "partial") return `일부만 가져왔습니다 · ${noun} ${count}개`;
  if (!count) return `지원 양식에서 ${noun}을 찾지 못했습니다`;
  return `지원 양식을 가져왔습니다 · ${noun} ${count}개`;
}
