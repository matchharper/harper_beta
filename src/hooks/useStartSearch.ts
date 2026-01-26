// hooks/useSearchChatCandidates.ts
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { CandidateType, EduUserType, ExpUserType } from "@/types/type";
import { useCallback } from "react";
import { logger } from "@/utils/logger";
import { UI_END, UI_START } from "./chat/useChatSession";

export type ExperienceUserType = ExpUserType & {
  company_db: {
    name: string;
    logo: string;
    linkedin_url: string;
    investors?: any;
    short_description?: string;
  };
};

export type CandidateTypeWithConnection = CandidateType & {
  edu_user: EduUserType[];
  experience_user: ExperienceUserType[];
  connection: { user_id: string; typed: number }[];
  publications?: { title: string; published_at: string }[];
  synthesized_summary?: { text: string }[];
};

function extractUiJsonFromMessage(content: string): any | null {
  if (!content) return null;

  const start = content.lastIndexOf(UI_START);
  const end = content.lastIndexOf(UI_END);

  if (start === -1 || end === -1 || end <= start) return null;

  const jsonText = content.slice(start + UI_START.length, end).trim();
  if (!jsonText) return null;

  try {
    return JSON.parse(jsonText);
  } catch (e) {
    logger.log("UI JSON parse failed:", e);
    return null;
  }
}

async function fetchSearchIds(params: {
  queryId: string;
  runId: string;
  pageIdx: number;
  userId: string;
}) {
  const res = await fetch("/api/search/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!res.ok) throw new Error("search api failed");
  const data = await res.json();

  return {
    ids: (data?.results ?? []) as string[],
    isNewSearch: data?.isNewSearch ?? false,
  };
}
/**
 * run 생성:
 * body: { queryId, messageId, criteria, queryText }
 * resp: { runId }
 */
async function createRunFromMessage(params: {
  queryId: string;
  messageId: number;
  criteria: any;
  queryText: string;
}) {
  const { queryId, messageId, criteria, queryText } = params;
  console.log("\n createRunFromMessage: ", queryId, messageId, criteria);

  if (!queryId) throw new Error("createRunFromMessage: missing queryId");
  if (!Number.isFinite(messageId))
    throw new Error("createRunFromMessage: invalid messageId");
  if (criteria == null)
    throw new Error("createRunFromMessage: missing criteria");

  const { data, error } = await supabase
    .from("runs")
    .insert({
      query_id: queryId,
      message_id: messageId,
      criteria,
      query_text: queryText,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(
      `createRunFromMessage: insert failed (${error.code}): ${error.message}`
    );
  }
  if (!data?.id) {
    throw new Error("createRunFromMessage: no run id returned");
  }

  return { runId: data.id as string };
}

export const runSearch =
  async ({ messageId, queryId, userId }: { messageId: number, queryId: string, userId: string }) => {
    if (!queryId || !userId) return null;

    // 1) load message
    const { data, error } = await supabase
      .from("messages")
      .select("id, content")
      .eq("id", messageId)
      .single();

    if (error) {
      logger.log("load message error:", error);
      return null;
    }
    if (!data?.content) return null;

    // 2) parse criteria from UI block
    const inputs = extractUiJsonFromMessage(data.content);
    if (!inputs || !inputs.criteria) {
      logger.log("no criteria parsed from message:", messageId);
      return null;
    }

    // 3) create run
    const { runId: newRunId } = await createRunFromMessage({
      queryId,
      messageId,
      criteria: inputs.criteria,
      queryText: inputs.thinking ?? "",
    });

    if (!newRunId) return null;

    return newRunId;
  }

export const doSearch = async ({ runId, queryId, userId, pageIdx }: { runId: string, queryId: string, userId: string, pageIdx: number }) => {
  console.trace("[doSearch] stack");
  if (!queryId || !userId) return null;
  logger.log("doSearch: ", runId, queryId, userId, pageIdx);

  const params = {
    queryId,
    runId,
    pageIdx,
    userId,
  }

  const res = await fetch("/api/search/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!res.ok) throw new Error("search api failed");

  const data = await res.json();
  logger.log("doSearch data: ", data);

  return {
    ids: (data?.results ?? []) as string[]
  };
}