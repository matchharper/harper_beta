import { ORG_AGENT_MAX_TOTAL_TOOL_RESULT_CHARS } from "@/lib/org/agent/toolResultBudget";
import { ORG_AGENT_TOOLS, type OrgAgentToolName } from "@/lib/org/agent/tools";

/**
 * Mutating and delivery tools are deliberately absent from the debugger. A
 * click in an inspection surface must never edit company data, move a
 * candidate, or schedule an outbound message.
 */
export const ORG_AGENT_DEBUG_TOOL_NAMES = [
  "get_talents",
  "read_talent",
  "read_role",
  "get_more_data",
  "read_conversation_history",
  "prepare_candidate_connection",
] as const satisfies readonly OrgAgentToolName[];

export type OrgAgentDebugToolName = (typeof ORG_AGENT_DEBUG_TOOL_NAMES)[number];

export type OrgAgentDebugSurface = "chat" | "slack";

export type OrgAgentToolJsonSchema = {
  additionalProperties?: boolean;
  description?: string;
  enum?: readonly string[];
  items?: OrgAgentToolJsonSchema;
  maxItems?: number;
  maxLength?: number;
  maximum?: number;
  minItems?: number;
  minLength?: number;
  minimum?: number;
  properties?: Record<string, OrgAgentToolJsonSchema>;
  required?: readonly string[];
  type?: string | readonly string[];
};

export type OrgAgentDebugToolDefinition = {
  description: string;
  name: OrgAgentDebugToolName;
  parameters: OrgAgentToolJsonSchema;
};

const DEBUG_TOOL_NAME_SET = new Set<string>(ORG_AGENT_DEBUG_TOOL_NAMES);

export function isOrgAgentDebugToolName(
  value: unknown
): value is OrgAgentDebugToolName {
  return typeof value === "string" && DEBUG_TOOL_NAME_SET.has(value);
}

export const ORG_AGENT_DEBUG_TOOLS = ORG_AGENT_TOOLS.flatMap(
  (tool): OrgAgentDebugToolDefinition[] => {
    if (!isOrgAgentDebugToolName(tool.function.name)) return [];
    return [
      {
        description: tool.function.description,
        name: tool.function.name,
        parameters: tool.function.parameters as OrgAgentToolJsonSchema,
      },
    ];
  }
);

export type OpsOrgAgentToolDebugWorkspace = {
  companyName: string;
  updatedAt: string;
  workspaceId: string;
};

export type OpsOrgAgentToolDebugActor = {
  authority: string;
  email: string | null;
  name: string | null;
  userId: string;
};

export type OpsOrgAgentToolDebugRole = {
  name: string;
  roleId: string;
  status: string | null;
};

export type OpsOrgAgentToolDebugOptionsResponse = {
  workspaces: OpsOrgAgentToolDebugWorkspace[];
};

export type OpsOrgAgentToolDebugActorsResponse = {
  actors: OpsOrgAgentToolDebugActor[];
  roles: OpsOrgAgentToolDebugRole[];
  workspaceId: string;
};

export type OpsOrgAgentToolDebugRunInput = {
  actorId?: string | null;
  currentUserMessageId?: number | null;
  input?: unknown;
  priorToolResultChars?: number | null;
  slackThreadId?: string | null;
  surface?: OrgAgentDebugSurface;
  toolName?: string;
  workspaceId?: string;
};

export type OpsOrgAgentToolDebugRunResponse = {
  actor: OpsOrgAgentToolDebugActor;
  budget: {
    complete: boolean;
    deliveredChars: number;
    maxTotalChars: number;
    priorToolResultChars: number;
    serializedChars: number;
  };
  context: {
    conversationId: string | null;
    currentUserMessageId: number;
    slackThreadId: string | null;
    surface: OrgAgentDebugSurface;
    workspaceId: string;
  };
  durationMs: number;
  error: string | null;
  llmText: string;
  ok: boolean;
  resultJson: string | null;
  toolName: OrgAgentDebugToolName;
};

export { ORG_AGENT_MAX_TOTAL_TOOL_RESULT_CHARS };
