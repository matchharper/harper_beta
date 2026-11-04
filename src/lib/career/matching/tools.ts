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
const plan = {
  type: "object",
  properties: {
    searchIntentSummary: str,
    roleTitles: strings,
    ftsKeywords: {
      type: "array",
      items: {
        type: "object",
        properties: { terms: strings, weight: { type: "number" } },
        required: ["terms", "weight"],
      },
    },
    countries: {
      type: "array",
      items: {
        type: "object",
        properties: {
          countryCode: str,
          weight: { type: "number" },
          remoteOnly: { type: "boolean" },
        },
        required: ["countryCode", "weight", "remoteOnly"],
      },
    },
    includeContract: { type: "boolean" },
    includeParttime: { type: "boolean" },
    includeIntern: { type: "boolean" },
    includeRemote: { type: "boolean" },
    remoteOnly: { type: "boolean" },
    isPreferEntry: { type: "integer", enum: [-1, 0, 1] },
    postingRecency: {
      type: ["object", "null"],
      properties: {
        maxAgeDays: { type: ["number", "null"] },
        recentDays: { type: "number" },
        recentWeight: { type: "number" },
        olderWeight: { type: "number" },
      },
    },
  },
  required: [
    "searchIntentSummary",
    "roleTitles",
    "ftsKeywords",
    "countries",
    "includeContract",
    "includeParttime",
    "includeIntern",
    "includeRemote",
    "remoteOnly",
    "isPreferEntry",
    "postingRecency",
  ],
};
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
      })
  ),
  read_matching: tool(
    "read_matching",
    TOOL_DESCRIPTIONS.read_matching,
    {
      matchingId: str,
      cursor: str,
      evaluationCursor: str,
      runCursor: str,
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
      source: { type: "string", enum: ["external"] },
      action: { type: "string", enum: ["search", "read", "resume", "cancel"] },
      runId: str,
      matchingId: str,
      roleIds: strings,
      plan,
      evaluationLimit: num,
      targetSalaryKrw: { type: "number" },
      profileId: str,
      profileRevision: num,
      cursor: str,
      limit: num,
    },
    ["source"],
    async (i, c) => {
      if (i.source !== "external") throw new Error("Use get_internal_roles to read Harper-connected roles and apply_to_internal_role to save an opportunity.");
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

      if (i.source === "external")
        return requestExternalMatchingSearch({
          ...args,
          matchingId: i.matchingId,
          roleIds: i.roleIds,
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
        enum: ["add", "update", "archive", "restore", "replace", "reset"],
      },
      matchingId: str,
      allLists: { type: "boolean" },
      expectedRevision: str,
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            recommendationId: { ...str, description: "Exact existing recommendation ID. Every item needs this or roleId; an evaluation ID alone does not identify the membership." },
            roleId: { ...str, description: "Exact Role ID; required for a new publication." },
            evaluationId: { ...str, description: "Required for a new external recommendation: the exact selected evaluation ID for this role. A roleId or historical fit score alone cannot publish it." },
            explanation: str,
            rank: num,
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
      })
  ),
};
