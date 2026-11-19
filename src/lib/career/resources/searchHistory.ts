import { randomUUID } from "node:crypto";
import { formatLlmDateTime, PROMPT_TIME_ZONE } from "@/lib/llm/promptDateTime";
import { formatPromptText } from "@/lib/llm/promptText";
import type { TalentToolExecutionContext } from "@/lib/talentOnboarding/tools";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { careerExecutionEnvironment } from "../executionEnvironment";
import {
  databaseError,
  pageInput,
  record,
  resourceDb,
  rows,
  text,
  type ResourceContext,
} from "./types";

const searchTools = new Set([
  "search_resources",
  "web_search",
  "search_connected_gmail",
  // Opportunity searches join the same history, so earlier ones can be found by words and date.
  "search_opportunities",
]);

export const matchingResearchField = { type: "string", description: "Optional matchingId this step belongs to; its receipt joins that matching's history and exploration. Omit to use the matching this request is working on." };
export const careerSearchMatching = { matchingId: matchingResearchField };

export async function requireResearchMatching(owner: ResourceContext, id: unknown) {
  const { readOwnedMatchingId } = await import("../matching/focus");
  const verified = await readOwnedMatchingId(owner, id);
  if (!verified) throw new Error("Research matching unavailable.");
  return verified;
}

export async function resolveSearchReceiptMatching(name: string, input: Record<string, unknown>, context?: TalentToolExecutionContext) {
  const target = input.matchingId ?? context?.researchMatchingId;
  if (target == null || !(searchTools.has(name) || name === "open_url" || name === "get_role_context")) return;
  if (!context?.userId || !context.admin) throw new Error("Research matching requires an authenticated owner.");
  return requireResearchMatching({ admin: context.admin as TalentAdminClient, userId: context.userId }, target);
}

/** A receipt contains the checked scope, counts and references, never excerpts or message bodies. */
export async function recordSearchExecution(
  name: string,
  input: Record<string, unknown>,
  context: TalentToolExecutionContext | undefined,
  observation: { result: unknown } | { error: unknown },
  matchingId?: string
) {
  const directRead = name === "open_url" || name === "get_role_context";
  const opportunities = name === "search_opportunities";
  // Reading, resuming or cancelling an opportunity search is not a new search.
  if (opportunities && (input.action ?? "search") !== "search") return;
  if (
    !(searchTools.has(name) || (directRead && matchingId)) ||
    !context?.userId ||
    !context.admin ||
    !context.conversationId ||
    context.preview
  )
    return;
  const data = "result" in observation ? record(observation.result) : {};
  const manifest = record(data.manifest);
  const gmail = name === "search_connected_gmail";
  const mailboxGeneration = text(data.mailboxGeneration);
  const failed = "error" in observation || data.ok === false || (gmail && data.status !== "ok");
  const source =
    directRead ? name : name === "search_resources" ? text(input.source) : gmail ? "gmail" : opportunities ? "opportunities" : "web";
  const items = name === "open_url" ? rows(data.pages ?? [data]).filter(page => page.ok === true)
    : name === "get_role_context" ? rows(data.roles).filter(item => item.found === true)
    : opportunities ? []
    : rows(data.items ?? data.results ?? data.emails);
  const sourceRefs = items.flatMap((item) => {
    if (name === "open_url") return item.sourceScope === "public" && item.documentId && item.observationId
      ? [{ kind: "web_resource", id: String(item.documentId), revision: item.observationId }] : [];
    if (name === "get_role_context") return [{ kind: "role", id: item.roleId }];
    const ref = item.ref ?? item.resourceRef;
    return ref ? [ref] : [];
  });
  const coverage = manifest.coverage ?? data.coverage;
  const nextCursor = manifest.nextCursor ?? data.nextPageToken;
  const partial =
    manifest.partial === true || data.status === "partial" || data.truncated === true || Boolean(nextCursor);
  const status = failed ? "failed" : partial ? "partial" : "completed";
  const retainScope = !gmail || Boolean(mailboxGeneration);
  const scope = directRead ? {
    detail: name === "get_role_context" ? input.jd ?? "summary" : "page",
    requested: (name === "open_url" ? [input.url].flat() : [input.roleIds].flat()).length,
  } : retainScope ? input : {};
  const request = {
    source,
    tool: name,
    ...(matchingId ? { matchingId } : {}),
    searchReceipt: true,
    // A failed or revoked Gmail connection conveyed no authorized mailbox data.
    scope,
    sourceRefs,
    mailboxGeneration: mailboxGeneration || null,
    sourceMessageId: context.userMessageId ?? null,
    backgroundRunId: context.backgroundInvocation?.runId ?? null,
    execution_environment: careerExecutionEnvironment(),
  };
  const result = {
    count: failed ? null : opportunities ? (typeof data.evaluationCount === "number" ? data.evaluationCount : null) : items.length,
    coverage,
    nextCursor: nextCursor ?? null,
    resultSet: data.set,
    status: gmail ? data.status : undefined,
    failure:
      "error" in observation
        ? observation.error instanceof Error && !(gmail && !mailboxGeneration)
          ? observation.error.message
          : "Search failed"
        : undefined,
  };
  const call = context.toolCallId ?? context.voiceEventId ?? randomUUID();
  const db = resourceDb(context.admin as TalentAdminClient);
  const saved = await db.rpc("career_record_search_receipt_v1", {
    p_user: context.userId,
    p_conversation: context.conversationId,
    p_key: [
      context.conversationId,
      context.resumeRequestId ?? context.userMessageId ?? "",
      name,
      call,
    ].join(":"),
    p_request: request,
    p_status: status,
    p_result: result,
  });
  databaseError(saved.error);
}

export function formatLatestCareerSearch(row: {
  id: string;
  created_at: string;
  status: string;
  request: unknown;
  result: unknown;
}) {
  const request = record(row.request);
  const scope = record(request.scope);
  const query = scope.query ?? (Array.isArray(scope.queries) ? scope.queries.join("; ") : scope.thread_id ?? request.purpose ?? scope.purpose);
  const count = record(row.result).count ?? "unknown";
  return `Last search: ${formatLlmDateTime(row.created_at)} (${PROMPT_TIME_ZONE}), ${request.source}, ${query ?? "see execution scope"}, ${row.status}, ${count} results. Earlier searches: read_talent_activity_events(scope=searches).`;
}

export async function readSearchHistory(
  context: ResourceContext,
  input: {
    query?: string;
    since?: string;
    cursor?: string;
    limit?: number;
  }
) {
  const { offset, limit } = pageInput(input.cursor, input.limit ?? 5);
  const result = await context.admin.rpc("career_search_history_v1", {
    p_user: context.userId,
    p_query: input.query ?? "",
    p_since: input.since ?? null,
    p_offset: offset,
    p_limit: limit + 1,
  });
  databaseError(result.error);
  const found = result.data ?? [];
  const searches = found.slice(0, limit);
  const nextCursor = found.length > limit ? String(offset + limit) : null;
  const summaries = searches.map((row) => {
    const request = record(row.request),
      outcome = record(row.result);
    const { purpose, note, revisitWhen, ...scope } = record(request.scope);
    const reason = request.purpose ?? note ?? purpose;
    return [
      `${formatLlmDateTime(row.created_at)} (Asia/Seoul) · ${request.source} · ${row.status} · returned ${outcome.count ?? "unknown"}`,
      `Checked scope: ${formatPromptText(scope)}`,
      outcome.coverage ? formatPromptText(outcome.coverage) : "",
      outcome.failure ? `Failure: ${outcome.failure}` : "",
      outcome.status ? `Source status: ${outcome.status}` : "",
      outcome.nextCursor
        ? `More results at that time; next cursor: ${outcome.nextCursor}`
        : "",
      outcome.resultSet
        ? `Saved selection: ${formatPromptText(outcome.resultSet)}`
        : "",
      reason ? `Reason for the search: ${reason}` : "",
      revisitWhen ? `Revisit when: ${revisitWhen}` : "",
      request.sourceMessageId
        ? `Original message: message:${request.sourceMessageId}`
        : "",
      `Execution reference: operation:${row.id}`,
    ]
      .filter(Boolean)
      .join("\n");
  });
  return {
    searches,
    nextCursor,
    modelOutput: [
      ...summaries,
      !searches.length ? "No matching past searches." : "",
      nextCursor ? `More past searches: cursor ${nextCursor}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}
