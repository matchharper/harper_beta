import {
  CLAUDE_HAIKU_MODEL, CLAUDE_MODEL, GPT_6_LUNA_MODEL, GPT_61_SOL_MODEL, GPT_61_SOL_ULTRAFAST_MODEL,
  GPT_61_TERRA_MODEL, OPENAI_CHAT_PRESETS, OPENROUTER_GLM_53_FLASH_MODEL, OPENROUTER_MUSE_SPARK_13_MODEL,
} from "@/lib/llm/modelConfig";

const claudeEfforts = ["low", "medium", "high", "xhigh", "max"] as const;
const openAIEfforts = (model: string) =>
  OPENAI_CHAT_PRESETS.filter(preset => preset.tierModel === model).map(preset => preset.effort);

/**
 * Models an operator can run the scheduled-run preview with. "default" leaves
 * effort to the provider (Claude) or the adapter's own setting.
 */
export const careerRunModels = [
  { id: CLAUDE_HAIKU_MODEL, label: "Haiku 5.5", provider: "anthropic", efforts: claudeEfforts },
  { id: CLAUDE_MODEL, label: "Sonnet 5.5", provider: "anthropic", efforts: claudeEfforts },
  { id: GPT_61_TERRA_MODEL, label: "GPT-6.1 Terra", provider: "openai", efforts: openAIEfforts(GPT_61_TERRA_MODEL) },
  { id: GPT_61_SOL_MODEL, label: "GPT-6.1 Sol", provider: "openai", efforts: openAIEfforts(GPT_61_SOL_MODEL) },
  { id: GPT_61_SOL_ULTRAFAST_MODEL, label: "GPT-6.1 Sol · Ultrafast", provider: "openai", efforts: openAIEfforts(GPT_61_SOL_ULTRAFAST_MODEL) },
  { id: GPT_6_LUNA_MODEL, label: "GPT-6 Luna", provider: "openai", efforts: openAIEfforts(GPT_6_LUNA_MODEL) },
  { id: OPENROUTER_GLM_53_FLASH_MODEL, label: "GLM 5.3 Flash", provider: "openrouter", efforts: ["low", "medium", "high", "xhigh"] },
  { id: OPENROUTER_MUSE_SPARK_13_MODEL, label: "Muse Spark 1.3", provider: "openrouter", efforts: ["low", "medium", "high", "xhigh"] },
] as const satisfies readonly { id: string; label: string; provider: string; efforts: readonly string[] }[];

export type CareerRunModelId = (typeof careerRunModels)[number]["id"];
export type CareerRunEffort = (typeof careerRunModels)[number]["efforts"][number] | "default";
export const defaultCareerRunModel: CareerRunModelId = CLAUDE_HAIKU_MODEL;

export function findCareerRunModel(id: string) {
  return careerRunModels.find(model => model.id === id);
}

/** Claude decides its own effort by default, as scheduled runs on Haiku do. */
export function defaultCareerRunEffort(id: CareerRunModelId): CareerRunEffort {
  return findCareerRunModel(id)?.provider === "anthropic" ? "default" : "high";
}

export type CareerRunModelSelection = { model: CareerRunModelId; effort: CareerRunEffort };

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
  | { type: "started"; account: string; trigger: string; model: string; effort: string }
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
