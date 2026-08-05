import { CLAUDE_MODEL, GPT_56_LUNA_MODEL } from "@/lib/llm/modelConfig";

export const ORG_AGENT_GROK_MODEL = "grok-4.3" as const;
export const ORG_AGENT_CLAUDE_MODEL = CLAUDE_MODEL;
export const ORG_AGENT_LUNA_MODEL = GPT_56_LUNA_MODEL;

export const ORG_AGENT_MODEL_IDS = [
  ORG_AGENT_CLAUDE_MODEL,
  ORG_AGENT_GROK_MODEL,
  ORG_AGENT_LUNA_MODEL,
] as const;

export type OrgAgentModelId = (typeof ORG_AGENT_MODEL_IDS)[number];

export const DEFAULT_ORG_AGENT_MODEL: OrgAgentModelId = ORG_AGENT_LUNA_MODEL;
export const DEFAULT_SLACK_ORG_AGENT_MODEL: OrgAgentModelId =
  ORG_AGENT_LUNA_MODEL;

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
 * Slack turns are configured independently of the in-product agent selector.
 * Set SLACK_ORG_AGENT_MODEL to any value in ORG_AGENT_MODEL_IDS to switch it.
 */
export function getSlackOrgAgentModel(): OrgAgentModelId {
  const configuredModel = process.env.SLACK_ORG_AGENT_MODEL?.trim();
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
  return {
    model: DEFAULT_ORG_AGENT_MODEL,
    requestedModel: requestedModel || null,
    resolvedBy: "default",
  };
}
