import "server-only";
import { runOrgAgentCompletion, runOrgAgentToolLoop, type OrgAgentLoopDependencies } from "./chat";
import { executeOrgAgentTool } from "./toolExecution";
import { executeSharedOpenUrl, executeSharedWebSearch } from "@/lib/agentTools/web";
import { createMemoryDocumentCache } from "@/lib/tools/memoryDocumentCache";
import { buildRoleSearchResearchPrompt } from "./roleSearchResearch";
import { parseCompanyMessages, type CompanyMessageAudience } from "./companyMessaging";
import { OrgAgentToolInputError } from "./toolAvailability";
import { ORG_AGENT_SOL_MODEL } from "./modelConfig";

export const ROLE_SEARCH_RESEARCH_MODEL = ORG_AGENT_SOL_MODEL;
export const ROLE_SEARCH_RESEARCH_REASONING_EFFORT = "medium" as const;
// Research returns evidence, the full preserved Brief, and two message drafts.
// The ordinary conversation reply budget is too small for that document.
export const ROLE_SEARCH_RESEARCH_MAX_TOKENS = 40_000;

export const ROLE_SEARCH_RESEARCH_TOOLS = [
  "web_search", "open_url", "read_role", "get_more_data", "get_talents",
  "read_talent", "read_conversation_history", "list_contacts", "read_contact",
] as const;

type LoopArgs = Parameters<typeof runOrgAgentToolLoop>[0];
export type RoleSearchResearchArgs = Pick<LoopArgs,
  "admin" | "context" | "conversation" | "user" | "currentUserMessageId" |
  "responseLocale" | "signal" | "onToolStatus"
> & { roleId: string };

/** Read-only preview stays independent of the explicitly requested delivery path. */
export async function runRoleSearchResearchPreview(
  args: RoleSearchResearchArgs,
  dependencies: OrgAgentLoopDependencies = {},
) {
  const { result, cache } = await runResearch(args, dependencies);
  if (result.completionError || !result.reply.trim()) throw new Error(result.completionError || "Research returned no draft");
  return { text: result.reply, model: result.model, usage: result.usage, toolResults: result.state.toolResults, publicDocuments: cache.snapshot() };
}

export async function runRoleSearchResearchDelivery(
  args: RoleSearchResearchArgs & { companyMessageAudience: CompanyMessageAudience; assertCanContinue: () => Promise<void> },
  dependencies: OrgAgentLoopDependencies = {},
) {
  const { result, cache } = await runResearch(args, dependencies, args);
  if (result.completionError) throw new Error(result.completionError);
  if (!result.state.companyMessageBatch) throw new Error("Research did not commit a company message batch");
  return { batch: result.state.companyMessageBatch, model: result.model, usage: result.usage,
    toolResults: result.state.toolResults, publicDocuments: cache.snapshot() };
}

/** Limits side effects to the requested Brief and a single new Role thread. */
export function assertRoleResearchMutationScope(name: string, input: Record<string, unknown>, roleId: string) {
  if (name === "update_data") {
    if (input.proposalId || input.proposalAction || input.baseProposalId || !Array.isArray(input.changes) ||
      !input.changes.length || input.changes.some(change => !change || change.key !== "role_request" || change.roleId !== roleId))
      throw new OrgAgentToolInputError("This assignment only authorizes direct changes to the target Role Hiring Brief");
  }
  if (name === "send_company_message") {
    const messages = parseCompanyMessages(input);
    const root = messages[0];
    if (messages.length < 2 || root.replyTo || messages.some((part, index) =>
      part.roleId !== roleId || part.threadRef || (index > 0 && part.replyTo !== root.ref)))
      throw new OrgAgentToolInputError("Send one new target Role thread with its explanation replies");
  }
}

async function runResearch(
  args: RoleSearchResearchArgs,
  dependencies: OrgAgentLoopDependencies,
  delivery?: { companyMessageAudience: CompanyMessageAudience; assertCanContinue: () => Promise<void> },
) {
  const role = args.context.roles.find(item => item.roleId === args.roleId);
  if (!role || args.conversation.company_workspace_id !== args.context.workspace.workspaceId ||
    (args.conversation.role_id && args.conversation.role_id !== args.roleId)) {
    throw new Error("Research target must belong to the provided authorized company context");
  }
  const allowed = new Set<string>([...ROLE_SEARCH_RESEARCH_TOOLS, ...(delivery ? ["update_data", "send_company_message"] : [])]);
  const cache = createMemoryDocumentCache();
  const signal = args.signal ?? AbortSignal.timeout(240_000);
  const result = await runOrgAgentToolLoop({
    ...args,
    model: ROLE_SEARCH_RESEARCH_MODEL,
    reasoningEffort: ROLE_SEARCH_RESEARCH_REASONING_EFFORT,
    actorId: args.user.id, actorLabel: delivery ? "Harper recruiting assignment" : "수동 조사 미리보기",
    ...(delivery ? { companyMessageAudience: delivery.companyMessageAudience, assertCanContinue: delivery.assertCanContinue } : {}),
    source: delivery ? "slack" : "chat", slackThreadId: null, readAudience: "company_safe",
    scopeKey: `${delivery ? "research-delivery" : "research-preview"}:${args.roleId}`, mentions: [],
    userLabel: "수동 조사 요청", userMessage: buildRoleSearchResearchPrompt(args.roleId, !!delivery),
    initialCapabilities: ["web_research"], capabilityMode: delivery ? "full" : "progressive",
    allowedToolNames: allowed, allowSilentCompletion: false, signal,
  }, {
    ...dependencies,
    complete: input => (dependencies.complete ?? runOrgAgentCompletion)({
      ...input, maxTokens: ROLE_SEARCH_RESEARCH_MAX_TOKENS, strictModel: true,
    }),
    executeTool: async input => {
      if (!allowed.has(input.name)) throw new Error("Research preview cannot execute mutations or delivery");
      signal.throwIfAborted();
      if (delivery) {
        await delivery.assertCanContinue();
        assertRoleResearchMutationScope(input.name, input.input as Record<string, unknown>, args.roleId);
      }
      // Default public reads cache only in this session, never in production.
      // Evaluations replace tools with isolated in-memory fixtures, never production effects.
      if (dependencies.executeTool) return dependencies.executeTool(input);
      if (input.name === "web_search" || input.name === "open_url") {
        const value = input.name === "web_search"
          ? await executeSharedWebSearch(input.input as Record<string, unknown>, { admin: cache.admin })
          : await executeSharedOpenUrl({ admin: cache.admin, input: input.input as Record<string, unknown> });
        signal.throwIfAborted();
        input.state.toolResults.push({ callId: input.callId, name: input.name, status: "success", summary: "공개 자료 조회" });
        return value;
      }
      return executeOrgAgentTool(input);
    },
  });
  return { result, cache };
}
