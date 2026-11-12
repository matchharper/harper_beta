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
      action: { type: "string", enum: ["search", "read", "resume", "cancel"] },
      runId: str,
      matchingId: { ...str, description: "Optional saved criteria snapshot. Omit to search using the current Search Brief." },
      roleIds: strings,
      companyWorkspaceIds: {
        type: "array",
        items: { type: "string", format: "uuid" },
        minItems: 1,
        description: "Restrict roles to any of these company_workspace_id values returned by search_companies. Combine with a retrieval plan or exact roleIds.",
      },
      plan,
      evaluationLimit: num,
      targetSalaryKrw: {
        type: "number",
        description: "Annual pre-tax base salary benchmark in KRW, inferred from the candidate's career and local hiring market or explicitly requested by the candidate. A soft ranking signal for plan-based searches.",
      },
      profileId: str,
      profileRevision: num,
      cursor: str,
      limit: num,
    },
    [],
    async (i, c) => {
      // Older tool calls included a source discriminator.
      if (i.source !== undefined && i.source !== "external")
        throw new Error("search_opportunities reads external opportunities. Pass action, runId and cursor as top-level arguments.");
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

      return requestExternalMatchingSearch({
        ...args,
        matchingId: i.matchingId,
        roleIds: i.roleIds,
        companyWorkspaceIds: i.companyWorkspaceIds,
        plan: i.plan,
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
        enum: ["add", "update", "archive", "restore", "replace", "reset", "set_stage"],
      },
      matchingId: { ...str, description: "Exact ID of the opportunity list to change. Omit for the default list or with allLists." },
      allLists: { type: "boolean", description: "Target all opportunity lists for reset or archive." },
      expectedRevision: { ...str, description: "Opportunity list expectedRevision from the same target in list_matchings or read_matching. Required only for replace/reset. Optional for targeted changes; when supplied, it must match. Omit for add/restore unless the change depends on a particular list snapshot." },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            recommendationId: { ...str, description: "Exact existing recommendation ID. Every item needs this or roleId; an evaluation ID alone does not identify the membership." },
            roleId: { ...str, description: "Exact Role ID; required for a new publication." },
            evaluationId: { ...str, description: "Optional evaluation evidence for a new external recommendation. If included, use the exact evaluation ID for this user and role; no evaluation is required to save the role." },
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
