// hooks/useSearchChatCandidates.ts
import { supabase } from "@/lib/supabase";
import type { CandidateType, EduUserType, ExpUserType } from "@/types/type";
import { logger } from "@/utils/logger";
import { UI_END, UI_START } from "./chat/useChatSession";
import type { Locale } from "@/i18n/useMessage";
import {
  SearchSource,
  normalizeSearchSources,
  queryTypeToSearchSource,
} from "@/lib/searchSource";

function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  return document.cookie
    .split("; ")
    .find((row) => row.startsWith(name + "="))
    ?.split("=")[1];
}

function getLocaleFromCookie(): Locale {
  const c = getCookie("NEXT_LOCALE");
  return c === "ko" || c === "en" ? c : "ko";
}

function getDefaultEnabledSources(
  sourceType?: SearchSource | null
): SearchSource[] {
  return [sourceType === "scholar" ? "scholar" : "linkedin"];
}

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

type RunPageCandidate = { id?: string; score?: number | string | null };

type SearchSettingsSnapshot = {
  is_korean: boolean;
  type: SearchSource;
  sources: SearchSource[];
};

class SearchLaunchLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SearchLaunchLimitError";
  }
}

function filterPositiveScoreCandidates(items: RunPageCandidate[]) {
  return items.filter((item) => {
    const score = Number(item?.score);
    // Keep legacy rows without score, but exclude explicit zero/negative.
    if (Number.isNaN(score)) return true;
    return score > 0;
  });
}

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

async function fetchSearchIds(params: { runId: string; pageIdx: number }) {
  const { runId, pageIdx } = params;

  const { data, error } = await supabase
    .from("runs_pages")
    .select("candidate_ids, created_at")
    .eq("run_id", runId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw error;

  const row = data?.[0];
  const all = filterPositiveScoreCandidates(
    (row?.candidate_ids ?? []) as RunPageCandidate[]
  );

  const start = pageIdx * 10;
  const end = start + 10;
  const ids = all
    .slice(start, end)
    .map((r) => r.id)
    .filter(Boolean) as string[];

  return {
    ids,
    isNewSearch: false,
  };
}

async function loadSearchSettings(
  userId: string,
  sourceType: SearchSettingsSnapshot["type"],
  selectedSources: SearchSource[]
): Promise<SearchSettingsSnapshot> {
  const { data: row, error } = await supabase
    .from("settings")
    .select("is_korean")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `loadSearchSettings failed (${error.code}): ${error.message}`
    );
  }

  return {
    is_korean: row?.is_korean ?? false,
    type: sourceType,
    sources: normalizeSearchSources(selectedSources, {
      enabledOnly: true,
      fallback: getDefaultEnabledSources(sourceType),
    }),
  };
}

async function loadQuerySourceType(
  queryId: string
): Promise<SearchSettingsSnapshot["type"]> {
  const { data, error } = await supabase
    .from("queries")
    .select("type")
    .eq("query_id", queryId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `loadQuerySourceType failed (${error.code}): ${error.message}`
    );
  }

  return queryTypeToSearchSource(data?.type);
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
  userId: string;
  sources?: unknown;
}) {
  const { queryId, messageId, criteria, queryText, userId, sources } = params;
  console.log("\n createRunFromMessage: ", queryId, messageId, criteria);

  if (!queryId) throw new Error("createRunFromMessage: missing queryId");
  if (!Number.isFinite(messageId))
    throw new Error("createRunFromMessage: invalid messageId");
  if (criteria == null)
    throw new Error("createRunFromMessage: missing criteria");

  const locale = getLocaleFromCookie();
  const sourceType = await loadQuerySourceType(queryId);
  const selectedSources = normalizeSearchSources(sources, {
    enabledOnly: true,
    fallback: getDefaultEnabledSources(sourceType),
  });
  const searchSettings = await loadSearchSettings(
    userId,
    selectedSources[0] ?? getDefaultEnabledSources(sourceType)[0],
    selectedSources
  );

  // 테스트 모드 확인 (환경 변수)
  const testMode =
    typeof window !== "undefined" &&
    process.env.NEXT_PUBLIC_WORKER_TEST_MODE === "true";
  const queueStatus = testMode ? "queued_test" : "queued";

  const { data, error } = await supabase
    .from("runs")
    .insert({
      query_id: queryId,
      message_id: messageId,
      criteria,
      query_text: queryText,
      user_id: userId,
      status: queueStatus,
      locale,
      search_settings: searchSettings,
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

async function createRunViaLaunchApi(params: {
  queryId: string;
  messageId: number;
}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) return null;

  const response = await fetch("/api/search/launch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(params),
  });

  const json = (await response.json().catch(() => ({}))) as {
    error?: string;
    runId?: string;
  };

  if (!response.ok) {
    if (response.status === 429) {
      throw new SearchLaunchLimitError(
        json.error ?? "Parallel search limit reached"
      );
    }

    return null;
  }

  return typeof json.runId === "string" ? json.runId : null;
}

export const runSearch = async ({
  messageId,
  queryId,
  userId,
}: {
  messageId: number;
  queryId: string;
  userId: string;
}) => {
  if (!queryId || !userId) return null;

  // 0) Preferred path: server launch API (auth + ownership check + run creation)
  try {
    const launchedRunId = await createRunViaLaunchApi({
      queryId,
      messageId,
    });
    if (launchedRunId) return launchedRunId;
  } catch (e) {
    if (e instanceof SearchLaunchLimitError) {
      throw e;
    }

    logger.log("launch api failed, fallback to client path:", e);
  }

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
    userId: userId,
    sources: inputs.sources,
  });

  if (!newRunId) return null;

  return newRunId;
};

export const doSearch = async ({
  runId,
  pageIdx,
}: {
  runId: string;
  pageIdx: number;
}) => {
  console.trace("[doSearch] stack");
  logger.log("doSearch: ", runId, pageIdx);

  const { ids } = await fetchSearchIds({ runId, pageIdx });
  return { ids };
};
