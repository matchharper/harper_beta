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
import type {
  OrgAgentConversationRow,
  OrgAgentMessageRow,
} from "@/lib/org/agent/store";
import type { Json } from "@/types/database.types";

const MIN_MESSAGE_COUNT = 14;
const MIN_SOURCE_CHARS = 5_000;
// Keep this aligned with buildOrgAgentPromptContext's shared recent-message
// query so no web or Slack messages sit between the latest summary cursor and
// the raw context.
const RECENT_RAW_MESSAGE_LIMIT = 14;
const MAX_SOURCE_MESSAGES = 80;
const MAX_SOURCE_CHARS = 18_000;

type SupabaseAdminClient = {
  from: (table: string) => any;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function extractChatContent(response: any) {
  return normalizeText(response?.choices?.[0]?.message?.content);
}

function formatSource(messages: OrgAgentMessageRow[]) {
  let totalChars = 0;
  const lines: string[] = [];
  for (const message of messages) {
    const clipped = normalizeText(message.content).slice(0, 2_000);
    if (!clipped) continue;
    const line = `[${message.id}] ${message.role}: ${clipped}`;
    if (totalChars + line.length > MAX_SOURCE_CHARS) break;
    totalChars += line.length;
    lines.push(line);
  }
  return lines.join("\n");
}

async function summarizeOrgAgentSource(args: {
  model: OrgAgentModelId;
  source: string;
}) {
  const { model, response } = await createChatCompletionWithFallback({
    anthropicOverloadFallbackModel: ORG_AGENT_GROK_MODEL,
    buildRequest: () => ({
      max_tokens: 900,
      messages: [
        {
          content:
            "You summarize workspace-scoped recruiter-agent conversations for future context. A conversation may discuss multiple positions and candidates, so preserve the relevant role names/IDs when present. Write Korean unless source is primarily English. Be concise and preserve durable hiring criteria, accepted/rejected calibration, company/role edits, and unresolved questions. Do not include small talk.",
          role: "system",
        },
        {
          content: [
            "Summarize the following older company recruiting conversation segment.",
            "Focus on durable facts that should guide future recruiter-agent replies.",
            "",
            args.source,
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

export async function maybeSummarizeOrgAgentConversation(args: {
  admin: SupabaseAdminClient;
  conversation: OrgAgentConversationRow;
  model?: OrgAgentModelId | null;
}) {
  const cursor = args.conversation.summary_cursor_message_id ?? 0;
  const { data, error } = await args.admin
    .from("company_messages")
    .select(
      "id, conversation_id, company_workspace_id, role_id, company_user_id, role, content, message_type, model, status, mentions, thinking_logs, metadata, created_at"
    )
    .eq("conversation_id", args.conversation.id)
    .in("message_type", ["chat", "slack"])
    .gt("id", cursor)
    .order("id", { ascending: true })
    .limit(MAX_SOURCE_MESSAGES + RECENT_RAW_MESSAGE_LIMIT);

  if (error) throw error;
  const rows = (data ?? []) as OrgAgentMessageRow[];
  if (rows.length <= RECENT_RAW_MESSAGE_LIMIT) return null;

  const sourceRows = rows.slice(0, -RECENT_RAW_MESSAGE_LIMIT);
  if (sourceRows.length < MIN_MESSAGE_COUNT) return null;

  const source = formatSource(sourceRows);
  if (source.length < MIN_SOURCE_CHARS) return null;

  try {
    const summary = await summarizeOrgAgentSource({
      model: args.model ?? DEFAULT_ORG_AGENT_MODEL,
      source,
    });
    if (!summary.text) return null;

    const first = sourceRows[0];
    const last = sourceRows[sourceRows.length - 1];
    if (!first || !last) return null;

    const { error: insertError } = await args.admin
      .from("company_conversation_summaries")
      .insert({
        company_workspace_id: args.conversation.company_workspace_id,
        content: summary.text,
        conversation_id: args.conversation.id,
        message_count: sourceRows.length,
        metadata: {
          source: "org_agent_auto_summary",
        } satisfies Record<string, unknown> as Json,
        model: summary.model,
        role_id: args.conversation.role_id,
        source_end_message_id: last.id,
        source_start_message_id: first.id,
      });

    if (insertError && (insertError as { code?: string }).code !== "23505") {
      throw insertError;
    }

    const { error: updateError } = await args.admin
      .from("company_conversations")
      .update({
        summary_cursor_message_id: last.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", args.conversation.id);

    if (updateError) throw updateError;
    return summary;
  } catch (error) {
    console.error("[org/agent/summary]", getLlmErrorMessage(error));
    return null;
  }
}
