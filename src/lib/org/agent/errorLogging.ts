import { formatToolError, redactToolDiagnosticText } from "@/lib/llm/toolError";
import type { getSupabaseAdmin } from "@/lib/server/candidateAccess";

/** Server diagnostics only; never attach these details to company messages. */
export async function recordOrgAgentFailure(args: {
  admin: ReturnType<typeof getSupabaseAdmin>;
  error: unknown;
  userId: string;
  workspaceId: string;
  conversationId: string;
  userMessageId: number;
  runId: string;
  slackThreadId: string | null;
  slackReplyJobId: string | null;
  model: string;
  stage: string;
}) {
  const { admin, error, userId, ...context } = args;
  const diagnostic = {
    ...context,
    error: formatToolError(error),
    stack: error instanceof Error && typeof error.stack === "string"
      ? redactToolDiagnosticText(error.stack).slice(0, 16_000)
      : null,
  };
  // Log before any DB write: the original failure may itself be a DB outage.
  console.error("[org/agent:turn-error]", diagnostic);
  try {
    const { error: loggingError } = await admin.from("logs").insert({
      user_id: userId,
      type: "org_agent_error",
      meta_data: diagnostic,
    });
    if (loggingError) throw loggingError;
  } catch (loggingError) {
    console.error("[org/agent:turn-error-log-failed]", {
      runId: args.runId,
      slackReplyJobId: args.slackReplyJobId,
      error: formatToolError(loggingError),
    });
  }
}
