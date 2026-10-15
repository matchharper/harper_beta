import "server-only";
import { runOrgAgentCompletion, runOrgAgentToolLoop, type OrgAgentLoopDependencies } from "./chat";
import { executeOrgAgentTool } from "./toolExecution";
import { executeSharedOpenUrl, executeSharedWebSearch } from "@/lib/agentTools/web";
import { createMemoryDocumentCache } from "@/lib/tools/memoryDocumentCache";
import { buildRoleSearchResearchPrompt } from "./roleSearchResearch";
import { ORG_AGENT_SOL_MODEL } from "./modelConfig";

export const ROLE_SEARCH_RESEARCH_MODEL = ORG_AGENT_SOL_MODEL;
export const ROLE_SEARCH_RESEARCH_REASONING_EFFORT = "medium" as const;
// Research returns evidence, the full preserved Brief, and two message drafts.
// The ordinary conversation reply budget is too small for that document.
export const ROLE_SEARCH_RESEARCH_MAX_TOKENS = 16_384;

export const ROLE_SEARCH_RESEARCH_TOOLS = [
  "web_search", "open_url", "read_role", "get_more_data", "get_talents",
  "read_talent", "read_conversation_history", "list_contacts", "read_contact",
] as const;

type LoopArgs = Parameters<typeof runOrgAgentToolLoop>[0];
export type RoleSearchResearchArgs = Pick<LoopArgs,
  "admin" | "context" | "conversation" | "user" | "currentUserMessageId" |
  "responseLocale" | "signal" | "onToolStatus"
> & { roleId: string };

/** Deliberately has no route, queue registration, activation hook or send step. */
export async function runRoleSearchResearchPreview(
  args: RoleSearchResearchArgs,
  dependencies: OrgAgentLoopDependencies = {},
) {
  const role = args.context.roles.find(item => item.roleId === args.roleId);
  if (!role || args.conversation.company_workspace_id !== args.context.workspace.workspaceId ||
    (args.conversation.role_id && args.conversation.role_id !== args.roleId)) {
    throw new Error("Research target must belong to the provided authorized company context");
  }
  const allowed = new Set<string>(ROLE_SEARCH_RESEARCH_TOOLS);
  const cache = createMemoryDocumentCache();
  const signal = args.signal ?? AbortSignal.timeout(240_000);
  const result = await runOrgAgentToolLoop({
    ...args,
    model: ROLE_SEARCH_RESEARCH_MODEL,
    reasoningEffort: ROLE_SEARCH_RESEARCH_REASONING_EFFORT,
    actorId: args.user.id, actorLabel: "수동 조사 미리보기",
    source: "chat", slackThreadId: null, readAudience: "company_safe",
    scopeKey: `research-preview:${args.roleId}`, mentions: [],
    userLabel: "수동 조사 요청", userMessage: buildRoleSearchResearchPrompt(args.roleId),
    initialCapabilities: ["web_research"], capabilityMode: "progressive",
    allowedToolNames: allowed, allowSilentCompletion: false, signal,
  }, {
    ...dependencies,
    complete: input => (dependencies.complete ?? runOrgAgentCompletion)({
      ...input, maxTokens: ROLE_SEARCH_RESEARCH_MAX_TOKENS,
    }),
    executeTool: async input => {
      if (!allowed.has(input.name)) throw new Error("Research preview cannot execute mutations or delivery");
      signal.throwIfAborted();
      // Default public reads cache only in this session, never in production.
      // Evaluations may replace reads with frozen evidence, never authorize writes.
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
  if (result.completionError || !result.reply.trim()) throw new Error(result.completionError || "Research returned no draft");
  return { text: result.reply, model: result.model, usage: result.usage, toolResults: result.state.toolResults, publicDocuments: cache.snapshot() };
}
