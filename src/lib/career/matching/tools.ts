import { externalSearchPlanSchema as plan } from "./searchPlan";
import { TOOL_DESCRIPTIONS } from "@/lib/llm/toolDescriptions";
import type {
  TalentToolDefinition,
  TalentToolExecutionContext,
} from "@/lib/talentOnboarding/tools";
import { profileToolContext } from "../profiles/tools";
import {
  listMatchings,
  readMatching,
  upsertMatching,
  upsertOpportunities,
  readExternalEvaluation,
} from "./store";
import {
  requestExternalMatchingSearch,
  controlExternalMatchingSearch,
} from "./externalSearch";
const str = { type: "string" },
  num = { type: "integer" },
  strings = { type: "array", items: str };
function tool(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
  execute: (
    input: any,
    context?: TalentToolExecutionContext
  ) => Promise<unknown>
): TalentToolDefinition {
  return {
    name,
    description,
    parameters: {
      type: "object",
      properties,
      required,
      additionalProperties: false,
    },
    channels: ["chat", "voice"],
    execute,
  };
}
export const CAREER_MATCHING_TOOLS: Record<string, TalentToolDefinition> = {
  list_matchings: tool(
    "list_matchings",
    TOOL_DESCRIPTIONS.list_matchings,
    { archived: { type: "boolean" }, cursor: str, limit: num },
    [],
    async (i, c) =>
      listMatchings({
        ...i,
        ...profileToolContext(c, "list_matchings", i, { readOnly: true }),
        includeOpportunityRevisions: true,
      })
  ),
  read_matching: tool(
    "read_matching",
    TOOL_DESCRIPTIONS.read_matching,
    {
      matchingId: str,
      cursor: { ...str, description: "Membership page: exact nextCursor from read_matching." },
      evaluationCursor: { ...str, description: "Evaluation page: exact evaluationCursor from read_matching, when present." },
      runCursor: { ...str, description: "Run history page: exact nextRunCursor from read_matching." },
      limit: num,
      runId: str,
    },
    ["matchingId"],
    async (i, c) =>
      readMatching({
        ...i,
        ...profileToolContext(c, "read_matching", i, { readOnly: true }),
      })
  ),
  upsert_matching: tool(
    "upsert_matching",
    TOOL_DESCRIPTIONS.upsert_matching,
    {
      action: {
        type: "string",
        enum: ["create", "update", "archive", "restore"],
      },
      matchingId: str,
      expectedRevision: num,
      title: str,
      description: str,
      criteria: {
        type: "object",
        properties: {
          brief: {
            type: "array",
            items: {
              type: "object",
              properties: { ref: num, label: str, content: str },
              required: ["label", "content"],
            },
          },
          scope: str,
        },
        required: ["brief"],
      },
      previousMatchingId: str,
    },
    ["action"],
    async (i, c) =>
      upsertMatching({ ...i, ...profileToolContext(c, "upsert_matching", i) })
  ),
  search_opportunities: tool(
    "search_opportunities",
    TOOL_DESCRIPTIONS.search_opportunities,
    {
      action: { type: "string", enum: ["search", "read", "resume", "cancel"], description: "search uses the retrieval fields below (roleTitles, countries, employment/remote flags), or exact roleIds. read/resume/cancel require runId returned by a search. Use read_matching to read a saved opportunity list." },
      runId: { ...str, description: "Exact search runId for read/resume/cancel; a matchingId is a different identifier." },
      matchingId: { ...str, description: "Optional saved criteria snapshot for evaluation. Omit to use the current Search Brief. A new search still needs retrieval fields or roleIds." },
      roleIds: strings,
      companyWorkspaceIds: {
        type: "array",
        items: { type: "string", format: "uuid" },
        description: "Restrict roles to any of these company_workspace_id values returned by search_companies. Omit or use [] for no company restriction. Combine with retrieval fields or exact roleIds.",
      },
      ...plan.properties,
      evaluationLimit: num,
      targetSalaryKrw: {
        type: ["number", "null"],
        description: "Annual pre-tax base salary benchmark in KRW, inferred from the candidate's career and local hiring market or explicitly requested by the candidate. A soft ranking signal for plan-based searches.",
      },
      profileId: str,
      profileRevision: num,
      cursor: str,
      limit: num,
    },
    ["action"],
    async (i, c) => {
      // Older tool calls included a source discriminator.
      if (i.source !== undefined && i.source !== "external")
        throw new Error("search_opportunities reads external opportunities. Pass action, runId and cursor as top-level arguments.");
      const action = i.action ?? (i.runId ? "read" : "search");
      if (!["search", "read", "resume", "cancel"].includes(action))
        throw new Error("action must be search, read, resume or cancel.");
      if (action !== "search" && !i.runId)
        throw new Error(`${action} requires the runId returned by search_opportunities. Read a matching with read_matching(matchingId).`);
      if (action === "search" && i.runId)
        throw new Error("Use read or resume with an existing runId; a new search uses retrieval fields or roleIds.");
      const args = profileToolContext(c, "search_opportunities", i, {
        readOnly: Boolean(
          i.runId && i.action !== "resume" && i.action !== "cancel"
        ),
      });
      if (i.runId) {
        if (i.action === "resume" || i.action === "cancel")
          return controlExternalMatchingSearch({
            ...args,
            runId: i.runId,
            action: i.action,
            signal: c?.abortSignal,
            deadlineAt: c?.deadlineAt,
          });
        return readExternalEvaluation({
          ...args,
          runId: i.runId,
          cursor: i.cursor,
          limit: i.limit,
        });
      }

      const retrievalFields = Object.fromEntries(Object.keys(plan.properties)
        .filter(key => i[key] !== undefined).map(key => [key, i[key]]));
      // Continue old in-flight calls without changing their stored search contract.
      const retrievalPlan = i.plan ?? (Object.keys(retrievalFields).length ? retrievalFields : undefined);
      if (!i.roleIds?.length && !retrievalPlan)
        throw new Error("A new search needs roleTitles, countries and employment/remote conditions, or exact roleIds. matchingId only selects evaluation criteria.");
      return requestExternalMatchingSearch({
        ...args,
        matchingId: i.matchingId,
        roleIds: i.roleIds,
        companyWorkspaceIds: i.companyWorkspaceIds,
        plan: retrievalPlan,
        evaluationLimit: i.evaluationLimit,
        profileId: i.profileId,
        profileRevision: i.profileRevision,
        targetSalaryKrw: i.targetSalaryKrw,
        conversationId: c?.conversationId,
        replyId: c?.resumeRequestId ?? undefined,
        locale: c?.responseLocale ?? undefined,
        signal: c?.abortSignal,
        deadlineAt: c?.deadlineAt,
      });
    }
  ),
  upsert_opportunities: tool(
    "upsert_opportunities",
    TOOL_DESCRIPTIONS.upsert_opportunities,
    {
      action: {
        type: "string",
        enum: ["add", "archive", "restore", "replace", "reset", "set_stage"],
        description: "add saves new roles and updates the explanation/order of roles already in the list, in one call. archive/restore changes visibility; replace/reset changes the complete set and requires expectedRevision.",
      },
      matchingId: { ...str, description: "Exact ID of the opportunity list to change. Omit for the default list or with allLists." },
      allLists: { type: "boolean", description: "Target all opportunity lists for reset or archive." },
      expectedRevision: { ...str, description: "Opportunity list expectedRevision from the same target in list_matchings or read_matching. Required only for replace/reset. Optional for targeted changes; when supplied, it must match. Omit for add/restore unless the change depends on a particular list snapshot." },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            recommendationId: { ...str, description: "Exact existing recommendation ID. Every item needs this or roleId." },
            roleId: { ...str, format: "uuid", description: "Exact roleId returned by search/read; required for a new publication." },
            explanation: str,
            rank: num,
            savedStage: { type: "string", enum: ["saved", "applied", "connected", "offer", "closed", "hidden"], description: "For set_stage: organize an existing saved opportunity using its actual progress. This records state; it does not submit or contact anyone." },
          },
          additionalProperties: false,
        },
      },
    },
    ["action"],
    async (i, c) =>
      upsertOpportunities({
        ...i,
        ...profileToolContext(c, "upsert_opportunities", i),
        backgroundRunId: c?.backgroundInvocation?.runId,
        returnRoleIds: c?.backgroundInvocation?.scheduledWork,
      })
  ),
};
