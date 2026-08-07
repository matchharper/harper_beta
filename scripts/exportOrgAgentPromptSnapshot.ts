import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { User } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });

type JsonRecord = Record<string, unknown>;

type SourceMessage = {
  company_user_id: string | null;
  company_workspace_id: string;
  content: string;
  conversation_id: string;
  created_at: string;
  id: number;
  mentions: unknown;
  message_type: string;
  metadata: unknown;
  model: string | null;
  role: string;
  slack_thread_id: string | null;
  slack_user_id: string | null;
};

type CliOptions = {
  messageId: number | null;
  output: string | null;
  surface: "chat" | "slack" | null;
  workspaceId: string | null;
};

const COMPANY_SIDE_USER_SOURCES = new Set([
  "org_agent_user",
  "org_agent_slack_user",
  "org_agent_slack_button_choice",
]);

function text(value: unknown) {
  return String(value ?? "").trim();
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function parseArgs(argv: string[]): CliOptions {
  let messageId: number | null = null;
  let output: string | null = null;
  let surface: CliOptions["surface"] = null;
  let workspaceId: string | null = null;

  for (const argument of argv) {
    if (argument.startsWith("--message-id=")) {
      const parsed = Number(argument.slice("--message-id=".length));
      if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new Error("--message-id must be a positive integer");
      }
      messageId = parsed;
      continue;
    }
    if (argument.startsWith("--output=")) {
      output = text(argument.slice("--output=".length)) || null;
      continue;
    }
    if (argument.startsWith("--surface=")) {
      const requested = text(argument.slice("--surface=".length));
      if (requested !== "chat" && requested !== "slack") {
        throw new Error("--surface must be chat or slack");
      }
      surface = requested;
      continue;
    }
    if (argument.startsWith("--workspace=")) {
      workspaceId = text(argument.slice("--workspace=".length)) || null;
      continue;
    }
    if (!argument.startsWith("--") && !workspaceId) {
      workspaceId = text(argument) || null;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  return { messageId, output, surface, workspaceId };
}

function sourceName(message: SourceMessage) {
  return text(record(message.metadata).source);
}

function isCompanySideUserTurn(message: SourceMessage) {
  return (
    message.role === "user" &&
    COMPANY_SIDE_USER_SOURCES.has(sourceName(message))
  );
}

function safeMentions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const candidate = record(item);
    const displayName = text(candidate.displayName);
    const talentId = text(candidate.talentId);
    if (!displayName || !talentId) return [];
    return [
      {
        displayName,
        recommendationId: text(candidate.recommendationId) || null,
        roleId: text(candidate.roleId) || null,
        talentId,
      },
    ];
  });
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function markdownFence(value: string, language = "text") {
  const longestRun = Math.max(
    0,
    ...(value.match(/`+/g) ?? []).map((item) => item.length)
  );
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  return `${fence}${language}\n${value}\n${fence}`;
}

function oneLine(value: unknown) {
  return text(value).replaceAll("\n", " ").replaceAll("`", "\\`");
}

function timestampForPath(date: Date) {
  return date.toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

async function selectSourceMessage(
  admin: any,
  options: CliOptions
): Promise<SourceMessage> {
  let query = admin
    .from("company_messages")
    .select(
      "id, conversation_id, company_workspace_id, company_user_id, role, content, message_type, model, mentions, metadata, created_at, slack_thread_id, slack_user_id"
    )
    .eq("role", "user")
    .order("id", { ascending: false });

  if (options.messageId) query = query.eq("id", options.messageId);
  if (options.workspaceId) {
    query = query.eq("company_workspace_id", options.workspaceId);
  }
  if (options.surface) query = query.eq("message_type", options.surface);

  const { data, error } = await query.limit(options.messageId ? 1 : 200);
  if (error) throw error;
  const rows = (data ?? []) as SourceMessage[];
  const selected = rows.find(isCompanySideUserTurn);
  if (selected) return selected;

  const qualifier = options.messageId
    ? `message ${options.messageId}`
    : options.workspaceId
      ? `workspace ${options.workspaceId}`
      : "the latest 200 user messages";
  throw new Error(`No company-side LLM user turn found for ${qualifier}`);
}

async function loadConversation(admin: any, message: SourceMessage) {
  const { data, error } = await admin
    .from("company_conversations")
    .select(
      "id, company_workspace_id, role_id, title, last_message_at, last_message_id, summary_cursor_message_id, metadata, created_at, updated_at"
    )
    .eq("id", message.conversation_id)
    .single();
  if (error) throw error;
  return data;
}

async function validAuthUser(admin: any, userId: unknown) {
  const id = text(userId);
  if (!id) return null;
  const { data, error } = await admin.auth.admin.getUserById(id);
  if (error || !data.user) return null;
  return data.user as User;
}

async function resolveActor(admin: any, message: SourceMessage) {
  const direct = await validAuthUser(admin, message.company_user_id);
  if (direct) return direct;

  const { data: integration } = await admin
    .from("company_slack_integrations")
    .select("installed_by_user_id")
    .eq("company_workspace_id", message.company_workspace_id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  const installer = await validAuthUser(
    admin,
    integration?.installed_by_user_id
  );
  if (installer) return installer;

  const { data: memberships, error } = await admin
    .from("company_user_workspace")
    .select("company_user_id")
    .eq("company_workspace_id", message.company_workspace_id)
    .in("role", ["owner", "admin", "member"])
    .limit(20);
  if (error) throw error;
  for (const membership of memberships ?? []) {
    const member = await validAuthUser(admin, membership.company_user_id);
    if (member) return member;
  }
  throw new Error("No active company workspace actor could be resolved");
}

async function resolveLlmUserMessage(admin: any, message: SourceMessage) {
  if (message.message_type !== "slack") return message.content;
  const { data, error } = await admin
    .from("slack_reply_jobs")
    .select("batched_prompt, prompt")
    .eq("user_message_id", message.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return text(data?.batched_prompt) || text(data?.prompt) || message.content;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const [
    { buildOrgAgentPromptContext },
    { usesMaxCompletionTokensForModel },
    {
      getOrgAgentFallbackModel,
      getSlackOrgAgentModel,
      isOrgAgentModelId,
      resolveOrgAgentModel,
    },
    { buildOrgAgentSystemPrompt, buildOrgAgentUserPrompt },
    { createOrgAgentToolExecutionState },
    { getOrgAgentToolCompletionMaxTokens },
    { getEnabledOrgAgentTools },
    { getSupabaseAdmin },
  ] = await Promise.all([
    import("../src/lib/org/agent/context"),
    import("../src/lib/llm/llm"),
    import("../src/lib/org/agent/modelConfig"),
    import("../src/lib/org/agent/prompts"),
    import("../src/lib/org/agent/toolExecution"),
    import("../src/lib/org/agent/toolCompletionBudget"),
    import("../src/lib/org/agent/tools"),
    import("../src/lib/server/candidateAccess"),
  ]);

  const admin = getSupabaseAdmin();
  const message = await selectSourceMessage(admin, options);
  const metadata = record(message.metadata);
  const isSlack = message.message_type === "slack";
  if (isSlack && !text(message.slack_thread_id)) {
    throw new Error(`Slack message ${message.id} has no slack_thread_id`);
  }

  const [conversation, user, llmUserMessage] = await Promise.all([
    loadConversation(admin, message),
    resolveActor(admin, message),
    resolveLlmUserMessage(admin, message),
  ]);
  const context = await buildOrgAgentPromptContext({
    admin,
    beforeMessageId: message.id,
    conversation,
    currentUserMessageId: message.id,
    messageType: isSlack ? "slack" : "chat",
    readAudience: isSlack ? "company_safe" : "caller",
    scopeKey: isSlack
      ? `slack:${message.slack_thread_id}`
      : `chat:${conversation.id}`,
    slackThreadId: message.slack_thread_id,
    slackHistoryTruncated: Boolean(metadata.historyTruncated),
    user,
  });

  const mentions = safeMentions(message.mentions);
  const systemPrompt = buildOrgAgentSystemPrompt({
    enableSlackChoiceButtons: isSlack,
  });
  const userPrompt = buildOrgAgentUserPrompt({
    context,
    mentions,
    userLabel: isSlack
      ? text(metadata.slackUserName) ||
        (text(message.slack_user_id) ? "Slack participant" : "user")
      : "user",
    userMessage: llmUserMessage,
  });
  const tools = getEnabledOrgAgentTools();
  const toolsJson = JSON.stringify(tools, null, 2);
  const recordedModel = text(metadata.model) || text(message.model);
  const model = isOrgAgentModelId(recordedModel)
    ? recordedModel
    : isSlack
      ? getSlackOrgAgentModel()
      : resolveOrgAgentModel(recordedModel || null).model;
  const state = createOrgAgentToolExecutionState(context);
  const maxTokens = getOrgAgentToolCompletionMaxTokens(state);
  const maxTokensField = usesMaxCompletionTokensForModel(model)
    ? "max_completion_tokens"
    : "max_tokens";
  const generatedAt = new Date();
  const requestSummary = {
    anthropicOverloadFallbackModel: "grok-4.3",
    fallbackModel: getOrgAgentFallbackModel(model),
    maxTokensField,
    maxTokens,
    model,
    openAIResponsesReasoningEffort: "high",
    deepSeekThinkingReasoningEffort: "high",
    temperature: 0.1,
    toolChoice: "auto",
  };
  const hashes = {
    systemPromptSha256: sha256(systemPrompt),
    toolsSha256: sha256(toolsJson),
    userPromptSha256: sha256(userPrompt),
  };
  const visibleCharacters = {
    systemPrompt: systemPrompt.length,
    tools: toolsJson.length,
    total: systemPrompt.length + userPrompt.length + toolsJson.length,
    userPrompt: userPrompt.length,
  };

  const markdown = [
    "# Company-side LLM 실제 첫 호출 Prompt Snapshot",
    "",
    "> 민감 정보: 이 파일에는 실제 회사·후보·대화 데이터가 포함될 수 있다. 로컬 확인용이며 Git에 커밋하거나 외부에 공유하지 않는다.",
    "",
    "## Snapshot 범위",
    "",
    "이 문서는 선택한 실제 company-side LLM user turn의 대화 경계와 snapshot 생성 시점의 authoritative DB 값을 사용해 첫 completion 직전 payload를 재구성한 것이다. DB는 읽기만 했으며 LLM 호출과 tool 실행은 하지 않았다.",
    "",
    "첫 completion 이후에는 모델이 고른 assistant tool call과 서버의 tool result가 messages에 추가된다. 그 동적 후속 completion payload는 이 snapshot에 포함되지 않는다.",
    "",
    `- 생성 시각: ${generatedAt.toISOString()}`,
    `- 실제 user message 시각: ${oneLine(message.created_at)}`,
    `- surface: ${isSlack ? "slack" : "chat"}`,
    `- source: ${oneLine(sourceName(message))}`,
    `- workspace: ${oneLine(context.workspace.companyName)} (${oneLine(message.company_workspace_id)})`,
    `- conversation ID: ${oneLine(message.conversation_id)}`,
    `- source message ID: ${message.id}`,
    ...(isSlack
      ? [`- Slack thread ID: ${oneLine(message.slack_thread_id)}`]
      : []),
    `- tool 수: ${tools.length}`,
    "",
    "## 요청 설정",
    "",
    markdownFence(JSON.stringify(requestSummary, null, 2), "json"),
    "",
    "## 크기와 무결성",
    "",
    markdownFence(
      JSON.stringify({ hashes, visibleCharacters }, null, 2),
      "json"
    ),
    "",
    "## messages[0] — system",
    "",
    markdownFence(systemPrompt),
    "",
    "## messages[1] — user",
    "",
    markdownFence(userPrompt),
    "",
    "## tools",
    "",
    markdownFence(toolsJson, "json"),
    "",
  ].join("\n");

  const defaultPath = path.join(
    ".local",
    "org-agent-prompt-snapshots",
    `${timestampForPath(generatedAt)}-${isSlack ? "slack" : "chat"}-message-${message.id}.md`
  );
  const outputPath = path.resolve(process.cwd(), options.output || defaultPath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdown, { encoding: "utf8", flag: "wx" });

  process.stdout.write(
    `${JSON.stringify(
      {
        companyName: context.workspace.companyName,
        generatedAt: generatedAt.toISOString(),
        messageId: message.id,
        outputPath,
        surface: isSlack ? "slack" : "chat",
        visibleCharacters,
        workspaceId: message.company_workspace_id,
      },
      null,
      2
    )}\n`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
