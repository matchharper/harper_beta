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
]);

export const careerSearchNotes = {
  purpose: { type: "string", description: "Optional private reason for checking this source." },
  revisitWhen: { type: "string", description: "Optional change or date that would make it useful to check again. This note does not schedule work." },
};

/** A receipt contains the checked scope, counts and references, never excerpts or message bodies. */
export async function recordSearchExecution(
  name: string,
  input: Record<string, unknown>,
  context: TalentToolExecutionContext | undefined,
  observation: { result: unknown } | { error: unknown }
) {
  if (
    !searchTools.has(name) ||
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
  const failed = "error" in observation || (gmail && data.status !== "ok");
  const source =
    name === "search_resources" ? text(input.source) : gmail ? "gmail" : "web";
  const items = rows(data.items ?? data.results ?? data.emails);
  const sourceRefs = items.flatMap((item) => {
    const ref = item.ref ?? item.resourceRef;
    return ref ? [ref] : [];
  });
  const coverage = manifest.coverage ?? data.coverage;
  const nextCursor = manifest.nextCursor ?? data.nextPageToken;
  const partial =
    manifest.partial === true || data.truncated === true || Boolean(nextCursor);
  const status = failed ? "failed" : partial ? "partial" : "completed";
  const retainScope = !gmail || Boolean(mailboxGeneration);
  const request = {
    source,
    tool: name,
    searchReceipt: true,
    // A failed or revoked Gmail connection conveyed no authorized mailbox data.
    scope: retainScope ? input : {},
    sourceRefs,
    mailboxGeneration: mailboxGeneration || null,
    sourceMessageId: context.userMessageId ?? null,
    backgroundRunId: context.backgroundInvocation?.runId ?? null,
    execution_environment: careerExecutionEnvironment(),
  };
  const result = {
    count: failed ? null : items.length,
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
  return `Last search: ${formatLlmDateTime(row.created_at)} (${PROMPT_TIME_ZONE}), ${request.source}, ${query ?? "see execution scope"}, ${row.status}, ${count} results. Saved receipt: operation:${row.id} (read_resources). Earlier searches: read_talent_activity_events(scope=searches).`;
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
    const { purpose, revisitWhen, ...scope } = record(request.scope);
    const reason = request.purpose ?? purpose;
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
