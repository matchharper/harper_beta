import Ajv from "ajv";
import type { User } from "@supabase/supabase-js";
import { InternalApiError } from "@/lib/internalApi";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import {
  executeTalentTool,
  TALENT_TOOL_NAMES,
} from "@/lib/talentOnboarding/tools";
import { resolveCareerChatTools } from "@/lib/career/llmTools";
import {
  fetchTalentGmailIntegration,
  type GmailSearchResult,
} from "@/lib/integrations/gmail";
import { prepareToolDelivery, runToolCall } from "@/lib/llm/toolExecution";
import { formatToolResultText } from "@/lib/llm/promptText";
import { formatToolError } from "@/lib/llm/toolError";
import type {
  CareerGmailDebugOptions,
  CareerGmailDebugRun,
} from "./careerGmailDebug";

const toolName = TALENT_TOOL_NAMES.SEARCH_CONNECTED_GMAIL;

function gmailTool(connected: boolean) {
  const tool = resolveCareerChatTools({
    channel: "chat",
    isOnboardingDone: true,
    hasActiveGmailIntegration: connected,
    allowedToolNames: [toolName],
  }).tools.find((entry) => entry.function.name === toolName);
  if (!tool) throw new Error("Career Gmail tool is unavailable");
  return tool.function;
}

const ajv = new Ajv({ allErrors: true });
const validateArguments = ajv.compile(gmailTool(true).parameters);

export async function getCareerGmailDebugOptions(
  user: User
): Promise<CareerGmailDebugOptions> {
  const integration = await fetchTalentGmailIntegration({
    admin: getTalentSupabaseAdmin(),
    talentId: user.id,
  });
  return {
    account: { userId: user.id, email: user.email ?? null },
    connectionStatus: integration?.status ?? "not_connected",
    tool: gmailTool(integration?.status === "active"),
  };
}

export async function runCareerGmailDebug(
  user: User,
  input: unknown
): Promise<CareerGmailDebugRun> {
  if (!validateArguments(input)) {
    throw new InternalApiError(400, ajv.errorsText(validateArguments.errors));
  }
  const toolInput = input as Record<string, unknown>;
  const startedAt = new Date().toISOString();
  const start = Date.now();
  // Identity comes exclusively from the authenticated request, never tool arguments.
  const capture = await runToolCall(() =>
    executeTalentTool({
      name: toolName,
      channel: "chat",
      input: toolInput,
      context: { admin: getTalentSupabaseAdmin(), userId: user.id },
      logging: false,
    })
  );
  return {
    account: { userId: user.id, email: user.email ?? null },
    input: toolInput,
    startedAt,
    durationMs: Date.now() - start,
    result: capture.returned ? (capture.value as GmailSearchResult) : null,
    error: capture.returned ? null : formatToolError(capture.error),
    // Same capture + projection used for delivery in the Career provider loop.
    llmText: prepareToolDelivery(capture, formatToolResultText),
  };
}
