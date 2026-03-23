import { getRequestUser, supabaseServer } from "@/lib/supabaseServer";
import {
  ACTIVE_PARALLEL_SEARCH_STATUSES,
  getMaxParallelSearchCount,
  getParallelSearchLimitMessage,
  inferSearchPlanKey,
} from "@/lib/searchParallelLimit";
import {
  SearchSource,
  normalizeSearchSource,
  normalizeSearchSources,
  queryTypeToSearchSource,
} from "@/lib/searchSource";
import { NextRequest, NextResponse } from "next/server";

const UI_START = "<<UI>>";
const UI_END = "<<END_UI>>";

type LaunchBody = {
  queryId?: string;
  messageId?: number;
  sourceRunId?: string;
};

type SearchSettingsSnapshot = {
  is_korean: boolean;
  type: SearchSource;
  sources: SearchSource[];
};

function parseLocaleFromRequest(req: NextRequest): "ko" | "en" {
  const locale = req.cookies.get("NEXT_LOCALE")?.value;
  return locale === "en" ? "en" : "ko";
}

function getDefaultEnabledSources(
  sourceType?: SearchSource | null
): SearchSource[] {
  return [sourceType === "scholar" ? "scholar" : "linkedin"];
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
  } catch {
    return null;
  }
}

async function loadSearchSettings(
  userId: string,
  sourceType: SearchSource,
  selectedSources: SearchSource[]
): Promise<SearchSettingsSnapshot> {
  const { data: row, error } = await supabaseServer
    .from("settings")
    .select("is_korean")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to load settings");
  }

  return {
    is_korean: row?.is_korean ?? false,
    type: sourceType,
    sources: normalizeSearchSources(selectedSources, {
      enabledOnly: true,
      fallback: [sourceType],
    }),
  };
}

async function loadActivePlanKey(userId: string) {
  const nowIso = new Date().toISOString();

  const { data: activePayment, error } = await supabaseServer
    .from("payments")
    .select(
      `
        plan_id,
        plans (
          plan_id,
          name,
          display_name
        )
      `
    )
    .eq("user_id", userId)
    .gte("current_period_end", nowIso)
    .order("current_period_end", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to load plan");
  }

  if (!activePayment) {
    return "free";
  }

  const planName =
    (activePayment as any)?.plans?.display_name ??
    (activePayment as any)?.plans?.name ??
    null;

  return inferSearchPlanKey(planName, activePayment.plan_id ?? null);
}

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: LaunchBody;
  try {
    body = (await req.json()) as LaunchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const queryId = String(body.queryId ?? "").trim();
  const messageId = Number(body.messageId);
  const sourceRunId = String(body.sourceRunId ?? "").trim();

  const isMessageLaunch = !!queryId && Number.isFinite(messageId);
  const isRetryLaunch = !!sourceRunId;

  if (!isMessageLaunch && !isRetryLaunch) {
    return NextResponse.json(
      { error: "Missing launch source" },
      { status: 400 }
    );
  }

  let effectiveQueryId = queryId;
  let effectiveMessageId: number | null = null;
  let effectiveCriteria: string[] = [];
  let effectiveQueryText = "";
  let effectiveRunSourceType: SearchSource | null = null;
  let effectiveSelectedSources: SearchSource[] = [];

  if (isRetryLaunch) {
    const { data: sourceRun, error: sourceRunError } = await supabaseServer
      .from("runs")
      .select("id, query_id, message_id, query_text, criteria, search_settings")
      .eq("id", sourceRunId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (sourceRunError) {
      return NextResponse.json(
        { error: sourceRunError.message ?? "Failed to load source run" },
        { status: 500 }
      );
    }
    if (!sourceRun?.query_id) {
      return NextResponse.json(
        { error: "Source run not found" },
        { status: 404 }
      );
    }

    effectiveQueryId = sourceRun.query_id;
    effectiveMessageId =
      typeof sourceRun.message_id === "number" ? sourceRun.message_id : null;
    effectiveQueryText = String(sourceRun.query_text ?? "").trim();
    effectiveCriteria = Array.isArray(sourceRun.criteria)
      ? sourceRun.criteria.filter(
          (item): item is string =>
            typeof item === "string" && item.trim().length > 0
        )
      : [];
    const persistedSourceType = normalizeSearchSource(
      (sourceRun.search_settings as { type?: string } | null)?.type
    );
    effectiveSelectedSources = normalizeSearchSources(
      (sourceRun.search_settings as { sources?: unknown } | null)?.sources,
      {
        enabledOnly: true,
        fallback: getDefaultEnabledSources(persistedSourceType),
      }
    );
    effectiveRunSourceType =
      effectiveSelectedSources[0] ?? persistedSourceType;
  } else {
    const { data: queryRow, error: queryError } = await supabaseServer
      .from("queries")
      .select("query_id, type")
      .eq("query_id", queryId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (queryError) {
      return NextResponse.json(
        { error: queryError.message ?? "Failed to load query" },
        { status: 500 }
      );
    }
    if (!queryRow) {
      return NextResponse.json({ error: "Query not found" }, { status: 404 });
    }

    const querySourceType = queryTypeToSearchSource(queryRow.type);
    effectiveRunSourceType = querySourceType;

    const { data: messageRow, error: messageError } = await supabaseServer
      .from("messages")
      .select("id, content")
      .eq("id", messageId)
      .eq("query_id", queryId)
      .maybeSingle();

    if (messageError) {
      return NextResponse.json(
        { error: messageError.message ?? "Failed to load message" },
        { status: 500 }
      );
    }
    if (!messageRow?.content) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const parsed = extractUiJsonFromMessage(messageRow.content);
    if (!parsed || !Array.isArray(parsed.criteria)) {
      return NextResponse.json(
        { error: "No criteria parsed from message" },
        { status: 400 }
      );
    }

    effectiveMessageId = messageId;
    effectiveCriteria = parsed.criteria.filter(
      (item: unknown): item is string =>
        typeof item === "string" && item.trim().length > 0
    );
    effectiveQueryText = String(parsed.thinking ?? "").trim();
    effectiveSelectedSources = normalizeSearchSources(parsed.sources, {
      enabledOnly: true,
      fallback: getDefaultEnabledSources(querySourceType),
    });
    effectiveRunSourceType =
      effectiveSelectedSources[0] ?? effectiveRunSourceType;
  }

  if (!effectiveQueryId || effectiveCriteria.length === 0) {
    return NextResponse.json(
      { error: "No criteria available for launch" },
      { status: 400 }
    );
  }

  const { data: queryMeta, error: queryMetaError } = await supabaseServer
    .from("queries")
    .select("query_id, type")
    .eq("query_id", effectiveQueryId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (queryMetaError) {
    return NextResponse.json(
      { error: queryMetaError.message ?? "Failed to load query" },
      { status: 500 }
    );
  }

  if (!queryMeta) {
    return NextResponse.json({ error: "Query not found" }, { status: 404 });
  }

  const locale = parseLocaleFromRequest(req);
  const planKey = await loadActivePlanKey(user.id);
  const maxParallel = getMaxParallelSearchCount({
    planKey,
    userId: user.id,
  });
  const threeMinAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  const { count: runningSearchCount, error: runningSearchError } =
    await supabaseServer
      .from("runs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .in("status", [...ACTIVE_PARALLEL_SEARCH_STATUSES])
      .gte("created_at", threeMinAgo);

  if (runningSearchError) {
    return NextResponse.json(
      {
        error: runningSearchError.message ?? "Failed to check running searches",
      },
      { status: 500 }
    );
  }

  if ((runningSearchCount ?? 0) >= maxParallel) {
    return NextResponse.json(
      {
        code: "parallel_limit_reached",
        error: getParallelSearchLimitMessage({ maxParallel, locale }),
      },
      { status: 429 }
    );
  }

  const fallbackSourceType = queryTypeToSearchSource(queryMeta.type);
  const primarySourceType = effectiveRunSourceType ?? fallbackSourceType;
  const selectedSources = normalizeSearchSources(effectiveSelectedSources, {
    enabledOnly: true,
    fallback: getDefaultEnabledSources(primarySourceType),
  });
  const searchSettings = await loadSearchSettings(
    user.id,
    selectedSources[0] ?? getDefaultEnabledSources(primarySourceType)[0],
    selectedSources
  );

  // 테스트 모드 확인 (환경 변수)
  const testMode = process.env.NEXT_PUBLIC_WORKER_TEST_MODE === "true";
  const queueStatus = testMode ? "queued_test" : "queued";

  const { data: runRow, error: runError } = await supabaseServer
    .from("runs")
    .insert({
      query_id: effectiveQueryId,
      message_id: effectiveMessageId,
      criteria: effectiveCriteria,
      query_text: effectiveQueryText,
      user_id: user.id,
      status: queueStatus,
      locale,
      search_settings: searchSettings,
    })
    .select("id")
    .single();

  if (runError || !runRow?.id) {
    return NextResponse.json(
      { error: runError?.message ?? "Failed to create run" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { runId: runRow.id, queryId: effectiveQueryId },
    { status: 200 }
  );
}
