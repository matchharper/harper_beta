import {
  createChatCompletionWithFallback,
  getLlmErrorMessage,
} from "@/lib/llm/llm";
import {
  DEFAULT_ORG_AGENT_MODEL,
  getOrgAgentFallbackModel,
  ORG_AGENT_GROK_MODEL,
  isOrgAgentModelId,
  type OrgAgentModelId,
} from "@/lib/org/agent/modelConfig";
import {
  fetchRecentOrgAgentSummaries,
  type OrgAgentConversationRow,
  type OrgAgentMessageRow,
  type OrgAgentPromptMessageScope,
  type OrgAgentSummaryRow,
} from "@/lib/org/agent/store";
import {
  formatOrgAgentSummarySource,
  RECENT_RAW_MESSAGE_LIMIT,
} from "@/lib/org/agent/summarySource";
import type { Json } from "@/types/database.types";

const MIN_MESSAGE_COUNT = 14;
const MAX_SOURCE_MESSAGES = 80;
const MAX_PREVIOUS_SUMMARY_CHARS = 4_000;

type SupabaseAdminClient = {
  from: (table: string) => any;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function extractChatContent(response: any) {
  return normalizeText(response?.choices?.[0]?.message?.content);
}

async function summarizeOrgAgentSource(args: {
  model: OrgAgentModelId;
  previousSummary: string | null;
  source: string;
}) {
  const { model, response } = await createChatCompletionWithFallback({
    anthropicOverloadFallbackModel: ORG_AGENT_GROK_MODEL,
    buildRequest: () => ({
      max_tokens: 900,
      messages: [
        {
          content:
            "You maintain one rolling summary for one company recruiting conversation scope. Preserve durable hiring criteria, accepted or rejected calibration, company or role edits, unresolved questions, decisions, and the people or Roles needed to interpret them. Merge the previous rolling summary with the new segment, applying explicit later corrections. Omit small talk. Write Korean unless the source is primarily English.",
          role: "system",
        },
        {
          content: [
            "Update the rolling conversation summary.",
            "The previous summary is historical context, not proof that a requested data change remains applied.",
            "The new segment is ordered oldest to newest.",
            "",
            "<previous_summary>",
            args.previousSummary || "-",
            "</previous_summary>",
            "",
            "<new_conversation_segment>",
            args.source,
            "</new_conversation_segment>",
          ].join("\n"),
          role: "user",
        },
      ],
      temperature: 0.1,
    }),
    debugLabel: "org/agent:summary",
    deepSeekThinking: { reasoningEffort: "high" },
    fallbackModel: getOrgAgentFallbackModel(args.model),
    model: args.model,
  });

  return {
    model: isOrgAgentModelId(model) ? model : DEFAULT_ORG_AGENT_MODEL,
    text: extractChatContent(response).slice(0, 4_000),
  };
}

function summaryScope(slackThreadId: unknown): OrgAgentPromptMessageScope {
  const normalized = normalizeText(slackThreadId);
  return normalized
    ? { kind: "slack", slackThreadId: normalized }
    : { kind: "chat" };
}

function summaryMetadata(args: {
  last: OrgAgentMessageRow;
  previous: OrgAgentSummaryRow | null;
  scope: OrgAgentPromptMessageScope;
}) {
  return {
    previousSummaryId: args.previous?.id ?? null,
    scope: args.scope.kind,
    source: "org_agent_rolling_summary",
    sourceEndAt: args.last.created_at,
    ...(args.scope.kind === "slack"
      ? { slackThreadId: args.scope.slackThreadId }
      : {}),
  } satisfies Record<string, unknown> as Json;
}

export async function maybeSummarizeOrgAgentConversation(args: {
  admin: SupabaseAdminClient;
  conversation: OrgAgentConversationRow;
  model?: OrgAgentModelId | null;
  slackThreadId?: string | null;
}) {
  const scope = summaryScope(args.slackThreadId);
  try {
    const previousSummaries = await fetchRecentOrgAgentSummaries({
      admin: args.admin as any,
      conversationId: args.conversation.id,
      limit: 1,
      scope,
    });
    const previous = previousSummaries.at(-1) ?? null;
    const cursor = previous?.source_end_message_id ?? 0;
    let query = args.admin
      .from("company_messages")
      .select(
        "id, conversation_id, company_workspace_id, role_id, company_user_id, role, content, message_type, model, status, mentions, thinking_logs, metadata, slack_thread_id, slack_user_id, created_at"
      )
      .eq("conversation_id", args.conversation.id)
      .gt("id", cursor)
      .order("id", { ascending: true });
    query =
      scope.kind === "slack"
        ? query
            .eq("message_type", "slack")
            .eq("slack_thread_id", scope.slackThreadId)
        : query.eq("message_type", "chat");
    const { data, error } = await query.limit(
      MAX_SOURCE_MESSAGES + RECENT_RAW_MESSAGE_LIMIT
    );

    if (error) throw error;
    const rows = (data ?? []) as OrgAgentMessageRow[];
    if (rows.length <= RECENT_RAW_MESSAGE_LIMIT) return null;

    const sourceRows = rows.slice(0, -RECENT_RAW_MESSAGE_LIMIT);
    if (sourceRows.length < MIN_MESSAGE_COUNT) return null;

    const { includedRows, source } = formatOrgAgentSummarySource(sourceRows);
    if (!source || includedRows.length === 0) return null;

    const summary = await summarizeOrgAgentSource({
      model: args.model ?? DEFAULT_ORG_AGENT_MODEL,
      previousSummary: previous
        ? normalizeText(previous.content).slice(0, MAX_PREVIOUS_SUMMARY_CHARS)
        : null,
      source,
    });
    if (!summary.text) return null;

    const first = includedRows[0];
    const last = includedRows[includedRows.length - 1];
    if (!first || !last) return null;

    const { error: insertError } = await args.admin
      .from("company_conversation_summaries")
      .insert({
        company_workspace_id: args.conversation.company_workspace_id,
        content: summary.text,
        conversation_id: args.conversation.id,
        message_count: (previous?.message_count ?? 0) + includedRows.length,
        metadata: summaryMetadata({ last, previous, scope }),
        model: summary.model,
        role_id: args.conversation.role_id,
        slack_thread_id: scope.kind === "slack" ? scope.slackThreadId : null,
        source_end_message_id: last.id,
        source_start_message_id: previous?.source_start_message_id ?? first.id,
      });

    if (insertError && (insertError as { code?: string }).code !== "23505") {
      throw insertError;
    }
    return summary;
  } catch (error) {
    console.error("[org/agent/summary]", getLlmErrorMessage(error));
    return null;
  }
}
