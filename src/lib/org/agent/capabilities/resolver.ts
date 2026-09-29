import { getEnabledOrgAgentTools } from "../tools";
import { COMPANY_BASE_TOOLS, COMPANY_CAPABILITIES, COMPANY_DEFAULT_CAPABILITIES, capabilityForTool, type CompanyCapabilityId } from "./registry";
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

export const LOAD_CAPABILITIES_TOOL = {
  type: "function" as const,
  function: {
    name: "load_capabilities",
    description: "Load detailed policies and callable tools for one or more catalog capabilities. They become available in the NEXT response, not this batch. Local, idempotent and without external effects; loading neither needs nor grants user approval.",
    parameters: {
      type: "object", additionalProperties: false,
      properties: { capabilityIds: { type: "array", minItems: 1, maxItems: COMPANY_CAPABILITIES.length, items: { type: "string", enum: COMPANY_CAPABILITIES.map((c) => c.id) } } },
      required: ["capabilityIds"],
    },
  },
};

export function resolveCompanyCapabilities(args: { surface: "chat" | "slack"; mode: CompanyCapabilityMode; loaded: ReadonlySet<CompanyCapabilityId> }) {
  const enabled = getEnabledOrgAgentTools(args.surface);
  const supported = new Set(enabled.map((tool) => tool.function.name));
  const catalog = COMPANY_CAPABILITIES.filter((c) => c.toolIds.some((id) => supported.has(id)));
  const active = catalog.filter((c) => args.mode === "full" || args.loaded.has(c.id) || (COMPANY_DEFAULT_CAPABILITIES as readonly string[]).includes(c.id));
  const toolNames = new Set<string>(COMPANY_BASE_TOOLS);
  const policyIds = new Set<CompanyPolicyId>();
  for (const capability of active) {
    capability.toolIds.forEach((id) => toolNames.add(id));
    capability.policyIds.forEach((id) => policyIds.add(id));
  }
  // Stable global policy order, independent of the order capabilities were loaded.
  const orderedPolicies = [...new Set(COMPANY_CAPABILITIES.flatMap((c) => [...c.policyIds] as CompanyPolicyId[]))].filter((id) => policyIds.has(id));
  const domainTools = enabled.filter((t) => toolNames.has(t.function.name)).sort((a, b) => a.function.name.localeCompare(b.function.name));
  const tools = args.mode === "progressive" ? [...domainTools, LOAD_CAPABILITIES_TOOL] : domainTools;
  return {
    tools,
    offeredToolNames: new Set(tools.map((t) => t.function.name)),
    policyIds: orderedPolicies,
    policyText: orderedPolicies.map((id) => `<capability_policy id="${id}">\n${getCompanyPolicy(id, args.surface)}\n</capability_policy>`).join("\n\n"),
    catalogText: [
      "<capability_catalog>",
      "These abilities remain discoverable even before detailed tools are loaded. Offer relevant help when useful, without taking unauthorized action. Use load_capabilities before using a deferred tool; then continue the original request without asking permission merely to load tools.",
      ...catalog.map((c) => `${c.id}: ${c.summary}`),
      "</capability_catalog>",
    ].join("\n"),
    activeCapabilityIds: active.map((c) => c.id),
  };
}
