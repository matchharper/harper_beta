import {
  SOL_CHAT_PRESETS,
  getSolChatPreset,
  CLAUDE_MODEL,
  GPT_6_LUNA_MODEL,
  GPT_61_SOL_MODEL,
  GPT_61_SOL_ULTRAFAST_MODEL,
  OPENROUTER_DEEPSEEK_V4_1_FLASH_MODEL,
  OPENROUTER_GLM_53_FLASH_MODEL,
} from "@/lib/llm/modelConfig";

export const ORG_AGENT_CLAUDE_MODEL = CLAUDE_MODEL;
export const ORG_AGENT_GEMINI_FLASH_MODEL = "google/gemini-3.8-flash" as const;
export const ORG_AGENT_HAIKU_MODEL = "anthropic/claude-haiku-5.5" as const;
export const ORG_AGENT_SOL_MODEL = GPT_61_SOL_MODEL;
export const ORG_AGENT_SOL_ULTRAFAST_MODEL = GPT_61_SOL_ULTRAFAST_MODEL;
export const ORG_AGENT_TEMPERATURE = 0.5;
export const ORG_AGENT_LUNA_MODEL = GPT_6_LUNA_MODEL;
export const ORG_AGENT_GLM_53_FLASH_MODEL = OPENROUTER_GLM_53_FLASH_MODEL;

export const ORG_AGENT_MODEL_IDS = [
  ORG_AGENT_GEMINI_FLASH_MODEL,
  ORG_AGENT_GLM_53_FLASH_MODEL,
  ORG_AGENT_LUNA_MODEL,
  ORG_AGENT_CLAUDE_MODEL,
  ORG_AGENT_HAIKU_MODEL,
  ...SOL_CHAT_PRESETS.map((preset) => preset.id),
] as const;

// Explicit environment overrides remain unchanged during the Terra retirement.
const LEGACY_ORG_AGENT_ENV_MODEL = "gpt-5.6-terra" as const;
export type OrgAgentModelId =
  | (typeof ORG_AGENT_MODEL_IDS)[number]
  | typeof LEGACY_ORG_AGENT_ENV_MODEL;

export const DEFAULT_ORG_AGENT_MODEL: OrgAgentModelId =
  ORG_AGENT_GEMINI_FLASH_MODEL;
export const DEFAULT_SLACK_ORG_AGENT_MODEL: OrgAgentModelId =
  ORG_AGENT_GEMINI_FLASH_MODEL;
export const DEFAULT_ORG_AGENT_REASONING_EFFORT = "medium" as const;
export type OrgAgentReasoningEffort = "low" | "medium" | "high" | "xhigh" | "max";

export function getOrgAgentReasoningEffort(
  model: OrgAgentModelId
): OrgAgentReasoningEffort {
  const preset = getSolChatPreset(model);
  if (preset) return preset.effort;
  return model === ORG_AGENT_GLM_53_FLASH_MODEL ||
    model === ORG_AGENT_HAIKU_MODEL
    ? "high"
    : DEFAULT_ORG_AGENT_REASONING_EFFORT;
}

export function getOrgAgentFallbackModel(
  model: OrgAgentModelId
): OrgAgentModelId | null {
  return model === ORG_AGENT_LUNA_MODEL ||
    model === ORG_AGENT_GEMINI_FLASH_MODEL ||
    getSolChatPreset(model) ||
    model === ORG_AGENT_HAIKU_MODEL
    ? null
    : ORG_AGENT_LUNA_MODEL;
}

export function isOrgAgentModelId(value: unknown): value is OrgAgentModelId {
  return (
    typeof value === "string" &&
    (ORG_AGENT_MODEL_IDS as readonly string[]).includes(value)
  );
}

export function migrateOrgAgentModel(value: unknown): OrgAgentModelId | null {
  if (value === LEGACY_ORG_AGENT_ENV_MODEL) {
    // Internal callers resolve the model again after reading the environment.
    // Keep an explicitly configured legacy model intact across those calls.
    return process.env.SLACK_ORG_AGENT_MODEL?.trim() === value ||
      process.env.ORG_AGENT_MODEL?.trim() === value
      ? LEGACY_ORG_AGENT_ENV_MODEL
      : ORG_AGENT_SOL_MODEL;
  }
  if (value === OPENROUTER_DEEPSEEK_V4_1_FLASH_MODEL)
    return ORG_AGENT_GLM_53_FLASH_MODEL;
  return isOrgAgentModelId(value) ? value : null;
}

function resolveConfiguredOrgAgentModel(value: unknown): OrgAgentModelId | null {
  if (typeof value === "string") {
    // Accept explicit effort in environment settings while preserving the
    // existing canonical IDs used by saved turns (high has no suffix).
    const normalized = value.trim().replace(/\s+/g, "-");
    const preset = SOL_CHAT_PRESETS.find(
      ({ tierModel, effort }) => normalized === `${tierModel}-${effort}`
    );
    if (preset) return preset.id;
  }
  return value === LEGACY_ORG_AGENT_ENV_MODEL
    ? LEGACY_ORG_AGENT_ENV_MODEL
    : migrateOrgAgentModel(value);
}

/**
 * ORG_AGENT_MODEL changes the shared server default. Slack can be overridden
 * independently with SLACK_ORG_AGENT_MODEL; the in-product selector sends a
 * per-turn model and therefore takes precedence for web chat.
 */
export function getSlackOrgAgentModel(): OrgAgentModelId {
  const configuredModel =
    process.env.SLACK_ORG_AGENT_MODEL?.trim() ||
    process.env.ORG_AGENT_MODEL?.trim();
  return resolveConfiguredOrgAgentModel(configuredModel) ?? DEFAULT_SLACK_ORG_AGENT_MODEL;
}

export function resolveOrgAgentModel(value: unknown): {
  model: OrgAgentModelId;
  requestedModel: string | null;
  resolvedBy: "requested" | "default";
} {
  const requestedModel = typeof value === "string" ? value.trim() : "";
  const resolvedRequestedModel = migrateOrgAgentModel(requestedModel);
  if (resolvedRequestedModel) {
    return {
      model: resolvedRequestedModel,
      requestedModel,
      resolvedBy: "requested",
    };
  }
  const configuredModel = process.env.ORG_AGENT_MODEL?.trim();
  const resolvedConfiguredModel = resolveConfiguredOrgAgentModel(configuredModel);
  if (resolvedConfiguredModel) {
    return {
      model: resolvedConfiguredModel,
      requestedModel: requestedModel || null,
      resolvedBy: "default",
    };
  }
  return {
    model: DEFAULT_ORG_AGENT_MODEL,
    requestedModel: requestedModel || null,
    resolvedBy: "default",
  };
}
