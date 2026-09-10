import {
  CLAUDE_MODEL,
  DEEPSEEK_V4_FLASH_MODEL,
  DEEPSEEK_V4_PRO_MODEL,
  GPT_56_LUNA_MODEL,
  GPT_56_TERRA_MODEL,
} from "@/lib/llm/modelConfig";

export const ORG_AGENT_GROK_MODEL = "grok-4.3" as const;
export const ORG_AGENT_CLAUDE_MODEL = CLAUDE_MODEL;
export const ORG_AGENT_LUNA_MODEL = GPT_56_LUNA_MODEL;
export const ORG_AGENT_TERRA_MODEL = GPT_56_TERRA_MODEL;
export const ORG_AGENT_DEEPSEEK_FLASH_MODEL = DEEPSEEK_V4_FLASH_MODEL;
export const ORG_AGENT_DEEPSEEK_PRO_MODEL = DEEPSEEK_V4_PRO_MODEL;

export const ORG_AGENT_MODEL_IDS = [
  ORG_AGENT_DEEPSEEK_FLASH_MODEL,
  ORG_AGENT_DEEPSEEK_PRO_MODEL,
  ORG_AGENT_LUNA_MODEL,
  ORG_AGENT_TERRA_MODEL,
  ORG_AGENT_CLAUDE_MODEL,
  ORG_AGENT_GROK_MODEL,
] as const;

export type OrgAgentModelId = (typeof ORG_AGENT_MODEL_IDS)[number];

export const DEFAULT_ORG_AGENT_MODEL: OrgAgentModelId = ORG_AGENT_TERRA_MODEL;
export const DEFAULT_SLACK_ORG_AGENT_MODEL: OrgAgentModelId =
  ORG_AGENT_TERRA_MODEL;
export const DEFAULT_ORG_AGENT_REASONING_EFFORT = "xhigh" as const;
export type OrgAgentReasoningEffort = "high" | "xhigh" | "max";

export function getOrgAgentFallbackModel(
  model: OrgAgentModelId
): OrgAgentModelId {
  return model === ORG_AGENT_GROK_MODEL
    ? ORG_AGENT_CLAUDE_MODEL
    : ORG_AGENT_GROK_MODEL;
}

export function isOrgAgentModelId(value: unknown): value is OrgAgentModelId {
  return (
    typeof value === "string" &&
    ORG_AGENT_MODEL_IDS.includes(value as OrgAgentModelId)
  );
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
  return isOrgAgentModelId(configuredModel)
    ? configuredModel
    : DEFAULT_SLACK_ORG_AGENT_MODEL;
}

export function resolveOrgAgentModel(value: unknown): {
  model: OrgAgentModelId;
  requestedModel: string | null;
  resolvedBy: "requested" | "default";
} {
  const requestedModel = typeof value === "string" ? value.trim() : "";
  if (isOrgAgentModelId(requestedModel)) {
    return { model: requestedModel, requestedModel, resolvedBy: "requested" };
  }
  const configuredModel = process.env.ORG_AGENT_MODEL?.trim();
  if (isOrgAgentModelId(configuredModel)) {
    return {
      model: configuredModel,
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
