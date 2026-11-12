import { after } from "next/server";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { getLlmUsageContext } from "@/lib/llm/usageContext";
import type { Json } from "@/types/database.types";

export const WEB_SEARCH_LOG_TYPE = "web_search_exa";

/** Executor facts, never inferred from the query or selected by the model. */
export type WebSearchAttribution = {
  source: string;
  channel?: string;
  userId?: string;
  conversationId?: string;
  sourceMessageId?: number | string | null;
  backgroundRunId?: string;
  backgroundTrigger?: string;
  replyId?: string;
  workId?: string;
  companyWorkspaceId?: string;
  roleId?: string | null;
  callId?: string | null;
};

export type WebSearchLogging = {
  attribution?: WebSearchAttribution;
  /** Research previews use an in-memory document cache but still incur API costs. */
  admin?: TalentAdminClient;
  scheduleAfter?: (task: () => Promise<void>) => void;
};

export function captureWebSearchAttribution(attribution?: WebSearchAttribution) {
  const usage = getLlmUsageContext();
  return {
    requestId: usage?.requestId,
    companyRunId: usage?.companyRunId,
    careerChannel: usage?.careerChannel,
    careerOrigin: usage?.careerOrigin,
    source: "web_search",
    ...attribution,
    userId: attribution?.userId ?? usage?.userId,
    conversationId: attribution?.conversationId ?? usage?.conversationId,
    sourceMessageId: attribution?.sourceMessageId ?? usage?.sourceMessageId,
  };
}

export function recordWebSearchLog(args: {
  admin: TalentAdminClient;
  metadata: Record<string, unknown>;
  userId?: string;
  scheduleAfter?: WebSearchLogging["scheduleAfter"];
}): void {
  // Start alongside the remaining search processing, with no DB await in the
  // tool's critical path. after() keeps the already-started write alive after
  // a streamed response/Queue handler completes; it does not start a second write.
  const pending = Promise.resolve().then(async () => {
    const { error } = await args.admin.from("logs").insert({
      type: WEB_SEARCH_LOG_TYPE,
      user_id: args.userId ?? null,
      meta_data: args.metadata as Json,
    });
    if (error) throw error;
  }).catch((error) => {
    console.error("[web-search-log] insert failed", {
      executionId: args.metadata.executionId,
      error: error && typeof error === "object" && "message" in error ? error.message : String(error),
    });
  });
  try {
    (args.scheduleAfter ?? after)(() => pending);
  } catch {
    // CLI/local callers have no Next request lifetime. The write already runs
    // in their Node process; a missing request context must not fail the search.
  }
}
