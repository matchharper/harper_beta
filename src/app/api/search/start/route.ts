import { xaiInference } from "@/lib/llm/llm";
import { supabase } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";
import { assertNotCanceled, deduplicateAndScore, UI_END, UI_START } from "../utils";
import { logger } from "@/utils/logger";
import { makeSqlQuery } from "../parse";
import { searchDatabase } from "../parse";
import { notifyToSlack } from "@/lib/slack";
import { StatusEnum } from "@/types/type";
import { en } from "@/lang/en";
import { ko } from "@/lang/ko";

type Locale = "ko" | "en";

const getLocaleFromRequest = (req: NextRequest): Locale => {
  const cookie = req.cookies.get("NEXT_LOCALE")?.value;
  if (cookie === "ko" || cookie === "en") return cookie;
  const accept = req.headers.get("accept-language")?.toLowerCase() ?? "";
  return accept.startsWith("ko") ? "ko" : "en";
};

const formatTemplate = (
  template: string,
  vars: Record<string, string | number>
) => {
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    String(vars[key] ?? "")
  );
};

type RunRow = {
  id: string;
  query_id: string;
  criteria?: any | null; // jsonb
  sql_query?: string | null;
  query_text?: string | null;
};

export async function POST(req: NextRequest) {
  const body = await req.json();
  const locale = getLocaleFromRequest(req);
  const messages = locale === "ko" ? ko : en;
  const searchMessages = messages.search;
  const { queryId, runId, pageIdx, userId } = body as {
    queryId?: string;
    runId?: string;
    pageIdx?: number;
    userId?: string;
  };
  logger.log("\n우선 /api/search/start 호출 : ", body, "\n\n");

  if (!queryId || !runId) {
    return NextResponse.json(
      { error: "Missing queryId/runId" },
      { status: 400 }
    );
  }

  const page = Number.isFinite(pageIdx) ? (pageIdx as number) : 0;
  const nextPageIdx = page + 1;

  // 2) If no cached results and page > 0, check previous page to decide if we can "slice" without new search
  let offset = 0;
  let cachedCandidates: any[] = [];

  if (page > 0) {
    const { data: prevPages } = await supabase
      .from("runs_pages")
      .select("*")
      .eq("run_id", runId)
      .eq("page_idx", page - 1)
      .order("created_at", { ascending: false });

    const prev = prevPages?.[0];

    if (!prev || !prev.candidate_ids || prev.candidate_ids.length === 0) {
      return NextResponse.json({ nextPageIdx, results: [] }, { status: 200 });
    }

    const isLoadMore = (prev.candidate_ids.length + page * 10) % 50 === 0;

    if (!isLoadMore) {
      // Just slice next 10 from prev cached candidates
      const rest = prev.candidate_ids.slice(10);

      await supabase.from("runs_pages").insert({
        run_id: runId,
        page_idx: page,
        candidate_ids: rest,
      });

      return NextResponse.json(
        { nextPageIdx, results: rest.slice(0, 10).map((r: any) => r.id) },
        { status: 200 }
      );
    } else {
      // It's a 50 boundary - decide if we can still slice or need new search
      const rest = prev.candidate_ids.slice(10);
      const scoreSum = rest
        .slice(0, 10)
        .reduce((acc: number, curr: any) => acc + curr.score, 0);

      if (scoreSum >= 10) {
        await supabase.from("runs_pages").insert({
          run_id: runId,
          page_idx: page,
          candidate_ids: rest,
        });

        return NextResponse.json(
          { nextPageIdx, results: rest.slice(0, 10).map((r: any) => r.id) },
          { status: 200 }
        );
      } else {
        offset = 50;
        cachedCandidates = rest;
      }
    }
  }

  // 3) Load run (source of truth for raw_input_text / criteria / sql_query)
  const { data: run, error: rErr } = await supabase
    .from("runs")
    .select("id, query_id, query_text, criteria, sql_query, status")
    .eq("id", runId)
    .eq("query_id", queryId)
    .single();

  if (run?.status === StatusEnum.STOPPED) {
    logger.log("\n\n 🚥 종료된 run입니다. ", run?.status, "\n\n");
    return NextResponse.json({ error: "Stopped run found" }, { status: 200 });
  }
  if (!(run?.status?.includes(StatusEnum.ERROR) || run?.status === null || run?.status.includes(StatusEnum.FINISHED))) {
    logger.log("\n\n 🦾 지금 진행중입니다. 건드리지 마세요. ", run?.status, "\n\n");
    return NextResponse.json({ error: "Run not found" }, { status: 200 });
  }

  if (rErr || !run) {
    return NextResponse.json({ error: "Run not found" }, { status: 400 });
  }

  let query_text = run.query_text ?? "";
  // 5) Ensure criteria/sql_query exist on the run (create if missing)
  let criteria: string[] = Array.isArray(run.criteria)
    ? (run.criteria as any)
    : [];
  let sql_query: string | null = run.sql_query ?? null;

  try {

    if (!criteria.length && run.criteria && typeof run.criteria === "object") {
      const maybe = (run.criteria as any)?.criteria;
      if (Array.isArray(maybe)) criteria = maybe;
    }

    if (!sql_query) {
      const parsedQuery = await makeSqlQuery(query_text, criteria, "", runId, locale);
      if (typeof parsedQuery !== "string") {
        // await updateRunStatus(run.id, JSON.stringify(parsedQuery));
        return NextResponse.json(parsedQuery, { status: 200 });
      }
      await assertNotCanceled(run.id);

      sql_query = parsedQuery;
      await supabase
        .from("runs")
        .update({
          sql_query: sql_query,
        })
        .eq("id", run.id);

    }

    // 6) Run search
    let searchResults: any[] = [];
    let searchStatus: string = "";
    try {
      const { data: searchResultsData, status: searchStatusData } = await searchDatabase({
        query_text,
        criteria,
        pageIdx: page,
        run: run as RunRow,
        sql_query: sql_query,
        limit: 300,
        offset: offset,
        review_count: 100,
        locale,
      });
      searchResults = searchResultsData;
      searchStatus = searchStatusData;
    } catch (e) {
      // updateRunStatus(run.id, "error: " + String(e));
      return NextResponse.json({ error: "Search failed" }, { status: 200 });
    }

    const fullScoreCount = searchResults.filter((r: any) => r.score === 1).length;
    const onlyPartCriteriaSatisfiedCount = searchResults.filter((r: any) => r.score < 1 && r.score > 0.5).length;
    const merged = deduplicateAndScore(searchResults, cachedCandidates);

    let defaultMsg = formatTemplate(searchMessages.defaultMessage.intro, {
      total: searchResults.length,
    });
    defaultMsg +=
      " " +
      formatTemplate(searchMessages.defaultMessage.full, {
        full: fullScoreCount,
      });
    if (criteria.length > 1) {
      defaultMsg +=
        " " +
        formatTemplate(searchMessages.defaultMessage.partial, {
          partial: onlyPartCriteriaSatisfiedCount,
        });
    }
    if (searchResults.length > 0) {
      const resultText = formatTemplate(searchMessages.ui.searchResult, {
        full: fullScoreCount,
        total: searchResults.length,
      });
      defaultMsg += `\n${UI_START}{"type": "search_result", "text": "${resultText}", "run_id": "${runId}"}${UI_END}`;
    }

    const prompt =
      locale === "ko"
        ? `You are Harper’s “search completion messenger”.
Write ONLY the additional message that will be appended after the default message.

Hard rules:
- Do NOT repeat or paraphrase the default message.
- Output must be Korean.
- Keep it short: 1–3 sentences (max 280 characters).
- Be helpful and action-oriented: suggest what the user can do next.
- Do not mention internal implementation details (SQL, LLM, limit=50, merged, fullScoreCount) unless it is necessary to clarify confusing results.
- If status is ERROR, do not reveal technical details. Tell them the search failed, credits were not deducted, and suggest trying again.

Context (facts you may use):
- user_query: "${run.query_text}"
- search_status: "${searchStatus}"  // e.g., SUCCESS | PARTIAL | ERROR
- candidates_matched: ${merged.length}   // count from SQL-filtered set (max 50)
- candidates_fully_satisfied: ${fullScoreCount}  // count judged by assistant reading details
- candidates_partially_satisfied: ${onlyPartCriteriaSatisfiedCount}
- criteria: ${criteria?.join(", ")}

Default message (already shown to user; never repeat):
${defaultMsg}

Now write the additional message:`
        : `You are Harper’s “search completion messenger”.
Write ONLY the additional message that will be appended after the default message.

Hard rules:
- Do NOT repeat or paraphrase the default message.
- Output must be English.
- Keep it short: 1–3 sentences (max 280 characters).
- Be helpful and action-oriented: suggest what the user can do next.
- Do not mention internal implementation details (SQL, LLM, limit=50, merged, fullScoreCount) unless it is necessary to clarify confusing results.
- If status is ERROR, do not reveal technical details. Tell them the search failed, credits were not deducted, and suggest trying again.

Context (facts you may use):
- user_query: "${run.query_text}"
- search_status: "${searchStatus}"  // e.g., SUCCESS | PARTIAL | ERROR
- candidates_matched: ${merged.length}   // count from SQL-filtered set (max 50)
- candidates_fully_satisfied: ${fullScoreCount}  // count judged by assistant reading details
- candidates_partially_satisfied: ${onlyPartCriteriaSatisfiedCount}
- criteria: ${criteria?.join(", ")}

Default message (already shown to user; never repeat):
${defaultMsg}

Now write the additional message:`;

    const msg = await xaiInference(
      "grok-4-fast-reasoning",
      "You are a helpful assistant agent, named Harper.",
      prompt,
      0.8,
      1
    );

    const res1 = await supabase.from("messages").insert({
      query_id: queryId,
      user_id: userId,
      role: 1,
      content: defaultMsg + "\n" + msg,
    });

    await supabase.from("runs").update({
      status: StatusEnum.FINISHED
    }).eq("id", runId);

    // 7) Cache candidates for this page into runs_pages
    const candidatesForCache = merged.map((r: any) => ({
      score: r.score,
      id: r.id,
    }));

    const candidateIds = candidatesForCache.slice(0, 10).map((r: any) => r.id);

    // 9) Slack notify if nothing found on first page
    if (page === 0 && candidateIds.length === 0) {
      await notifyToSlack(
        `🔍 *Search Result Not Found! 검색 결과가 없어요!*\n\n` +
        `• *Query*: ${query_text}\n` +
        `• *Criteria*: ${criteria?.join(", ")}\n` +
        `• *Run ID*: ${runId}\n` +
        `• *Time(Standard Korea Time)*: ${new Date().toLocaleString("ko-KR")}`
      );
    }

    return NextResponse.json(
      { nextPageIdx, results: candidateIds, isNewSearch: true },
      { status: 200 }
    );
  } catch (e: any) {
    logger.log("search start error", e);
    if (e.code === "RUN_STOPPED") {
      return NextResponse.json({ error: "Run stopped" }, { status: 200 });
    }
    logger.log("searcㄴㅇr", e);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
