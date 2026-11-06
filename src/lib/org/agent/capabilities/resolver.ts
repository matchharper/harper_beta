import { getEnabledOrgAgentTools } from "../tools";
import { EXTERNAL_SOURCING_TOOL_NAMES, externalSourcingEnabledFor } from "../externalSourcing";
import { COMPANY_BASE_TOOLS, COMPANY_CAPABILITIES, COMPANY_DEFAULT_CAPABILITIES, COMPANY_AGENT_SERVICE_CAPABILITIES, capabilityForTool, type CompanyCapabilityId } from "./registry";
import type { OrgAgentConversationInput } from "../conversationInput";
import { getCompanyPolicy, type CompanyPolicyId } from "./policies";

export type CompanyCapabilityMode = "full" | "progressive";
export function getCompanyCapabilityMode(): CompanyCapabilityMode {
  return process.env.ORG_AGENT_CAPABILITY_MODE === "full" ? "full" : "progressive";
}

/** Keep only the immediately preceding Harper turn's working tools warm.
 * This is schema continuity, not inferred intent or renewed authorization.
 * Older turns do not accumulate capabilities; policies still accompany tools.
 */
export function continuationCapabilities(messages: readonly OrgAgentConversationInput[] = []) {
  const previous = messages.findLast((message) => message.role === "assistant" && message.source === "harper");
  const loaded = new Set<CompanyCapabilityId>();
  for (const name of previous?.toolNames ?? []) {
    const capability = capabilityForTool(name);
    if (capability) loaded.add(capability);
  }
  return loaded;
}

function loadCapabilitiesTool(ids: string[]) {
  return {
    type: "function" as const,
    function: {
      name: "load_capabilities",
      description: "Load detailed policies and callable tools for one or more catalog capabilities. They become available in the NEXT response, not this batch. Local, idempotent and without external effects; loading neither needs nor grants user approval.",
      parameters: {
        type: "object", additionalProperties: false,
        properties: { capabilityIds: { type: "array", minItems: 1, maxItems: ids.length, items: { type: "string", enum: ids } } },
        required: ["capabilityIds"],
      },
    },
  };
}

// external_sourcing is listed only where it is turned on, so other workspaces keep the same schema as before.
// criteria_proposal and todo_suggestion belong to runs Harper starts itself
// (trusted callers), never to a member's conversation.
const HARPER_RUN_CAPABILITY_IDS: readonly string[] = ["criteria_proposal", "todo_suggestion"];
const MEMBER_CAPABILITY_IDS = COMPANY_CAPABILITIES.map((c) => c.id).filter((id) => !HARPER_RUN_CAPABILITY_IDS.includes(id));
export const LOAD_CAPABILITIES_TOOL = loadCapabilitiesTool(MEMBER_CAPABILITY_IDS.filter((id) => id !== "external_sourcing"));
const LOAD_CAPABILITIES_TOOL_WITH_EXTERNAL_SOURCING = loadCapabilitiesTool(MEMBER_CAPABILITY_IDS);

export function resolveCompanyCapabilities(args: { surface: "chat" | "slack"; mode: CompanyCapabilityMode; emailReply?: boolean; loaded: ReadonlySet<CompanyCapabilityId>; allowedToolNames?: ReadonlySet<string>; workspaceId?: string; agentService?: boolean; harperInitiated?: boolean }) {
  // Trusted caller restriction. Loading a capability can never broaden it.
  // External sourcing is offered only to workspaces that have it turned on (it costs money per run).
  const externalSourcing = externalSourcingEnabledFor(args.workspaceId);
  const enabled = getEnabledOrgAgentTools(args.surface, {scheduledMatching: args.allowedToolNames?.has("recommend_talents"), agentService: args.agentService, harperInitiated: args.harperInitiated}).filter(tool =>
    (!args.allowedToolNames || args.allowedToolNames.has(tool.function.name))
    && (externalSourcing || !(EXTERNAL_SOURCING_TOOL_NAMES as readonly string[]).includes(tool.function.name)));
  const supported = new Set(enabled.map((tool) => tool.function.name));
  const catalog = COMPANY_CAPABILITIES.filter((c) => c.toolIds.some((id) => supported.has(id))
    && (!args.agentService || (COMPANY_AGENT_SERVICE_CAPABILITIES as readonly string[]).includes(c.id)));
  const active = catalog.filter((c) => args.mode === "full" || args.loaded.has(c.id) || (args.emailReply && c.id === "email_preferences") || (COMPANY_DEFAULT_CAPABILITIES as readonly string[]).includes(c.id));
  const toolNames = new Set<string>(COMPANY_BASE_TOOLS);
  const policyIds = new Set<CompanyPolicyId>();
  for (const capability of active) {
    capability.toolIds.forEach((id) => toolNames.add(id));
    capability.policyIds.forEach((id) => policyIds.add(id));
  }
  // Stable global policy order, independent of the order capabilities were loaded.
  const orderedPolicies = [...new Set(COMPANY_CAPABILITIES.flatMap((c) => [...c.policyIds] as CompanyPolicyId[]))].filter((id) => policyIds.has(id));
  const domainTools = enabled.filter((t) => toolNames.has(t.function.name)).sort((a, b) => a.function.name.localeCompare(b.function.name));
  const tools = args.mode === "progressive"
    ? [...domainTools, args.allowedToolNames ? loadCapabilitiesTool(catalog.map(capability => capability.id)) : externalSourcing ? LOAD_CAPABILITIES_TOOL_WITH_EXTERNAL_SOURCING : LOAD_CAPABILITIES_TOOL]
    : domainTools;
  return {
    tools,
    offeredToolNames: new Set(tools.map((t) => t.function.name)),
    policyIds: orderedPolicies,
    policyText: orderedPolicies.map((id) => `<capability_policy id="${id}">\n${getCompanyPolicy(id, args.surface)}\n</capability_policy>`).join("\n\n"),
    catalogText: [
      "<capability_catalog>",
      "These abilities remain discoverable even before detailed tools are loaded. Use them to advance the company's purpose within your delegation. Use load_capabilities before using a deferred tool; then continue the original request without asking permission merely to load tools.",
      ...catalog.map((c) => `${c.id}: ${c.summary}`),
      "</capability_catalog>",
    ].join("\n"),
    activeCapabilityIds: active.map((c) => c.id),
  };
}
