import {
  CLAUDE_MODEL,
  GPT_6_LUNA_MODEL,
  GPT_56_TERRA_MODEL,
  OPENROUTER_DEEPSEEK_V4_1_FLASH_MODEL,
  OPENROUTER_GLM_53_FLASH_MODEL,
} from "@/lib/llm/modelConfig";

export const ORG_AGENT_CLAUDE_MODEL = CLAUDE_MODEL;
export const ORG_AGENT_GEMINI_FLASH_MODEL = "google/gemini-3.8-flash" as const;
export const ORG_AGENT_TEMPERATURE = 0.5;
export const ORG_AGENT_LUNA_MODEL = GPT_6_LUNA_MODEL;
export const ORG_AGENT_TERRA_MODEL = GPT_56_TERRA_MODEL;
export const ORG_AGENT_GLM_53_FLASH_MODEL = OPENROUTER_GLM_53_FLASH_MODEL;

export const ORG_AGENT_MODEL_IDS = [
  ORG_AGENT_GEMINI_FLASH_MODEL,
  ORG_AGENT_GLM_53_FLASH_MODEL,
  ORG_AGENT_LUNA_MODEL,
  ORG_AGENT_TERRA_MODEL,
  ORG_AGENT_CLAUDE_MODEL,
] as const;

export type OrgAgentModelId = (typeof ORG_AGENT_MODEL_IDS)[number];

export const DEFAULT_ORG_AGENT_MODEL: OrgAgentModelId = ORG_AGENT_GEMINI_FLASH_MODEL;
export const DEFAULT_SLACK_ORG_AGENT_MODEL: OrgAgentModelId =
  ORG_AGENT_GEMINI_FLASH_MODEL;
export const DEFAULT_ORG_AGENT_REASONING_EFFORT = "medium" as const;
export type OrgAgentReasoningEffort = "medium" | "high" | "xhigh" | "max";

export function getOrgAgentReasoningEffort(
  model: OrgAgentModelId
): OrgAgentReasoningEffort {
  return model === ORG_AGENT_GLM_53_FLASH_MODEL
    ? "high"
    : DEFAULT_ORG_AGENT_REASONING_EFFORT;
}

export function getOrgAgentFallbackModel(
  model: OrgAgentModelId
): OrgAgentModelId | null {
  return model === ORG_AGENT_LUNA_MODEL || model === ORG_AGENT_GEMINI_FLASH_MODEL
    ? null : ORG_AGENT_LUNA_MODEL;
}

export function isOrgAgentModelId(value: unknown): value is OrgAgentModelId {
  return (
    typeof value === "string" &&
    ORG_AGENT_MODEL_IDS.includes(value as OrgAgentModelId)
  );
}

export function migrateOrgAgentModel(value: unknown): OrgAgentModelId | null {
  if (value === OPENROUTER_DEEPSEEK_V4_1_FLASH_MODEL)
    return ORG_AGENT_GLM_53_FLASH_MODEL;
  return isOrgAgentModelId(value) ? value : null;
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
  return migrateOrgAgentModel(configuredModel) ?? DEFAULT_SLACK_ORG_AGENT_MODEL;
}

export function resolveOrgAgentModel(value: unknown): {
  model: OrgAgentModelId;
  requestedModel: string | null;
  resolvedBy: "requested" | "default";
} {
  const requestedModel = typeof value === "string" ? value.trim() : "";
  const resolvedRequestedModel = migrateOrgAgentModel(requestedModel);
  if (resolvedRequestedModel) {
    return { model: resolvedRequestedModel, requestedModel, resolvedBy: "requested" };
  }
  const configuredModel = process.env.ORG_AGENT_MODEL?.trim();
  const resolvedConfiguredModel = migrateOrgAgentModel(configuredModel);
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
