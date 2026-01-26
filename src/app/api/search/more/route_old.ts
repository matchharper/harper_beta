import { supabase } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";
import { deduplicateAndScore, ScoredCandidate } from "../utils";
import { updateRunStatus } from "../utils";
import { makeSqlQuery, searchDatabase } from "../parse";
import { logger } from "@/utils/logger";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { queryId, pageIdx } = body;

  // 이미 검색해둔 결과가 있는지 찾기
  const { data: cachedResults, error: lpErr } = await supabase
    .from("query_pages")
    .select("*")
    .eq("query_id", queryId)
    .eq("page_idx", pageIdx)
    .single();

  const { data: q, error: qErr } = await supabase
    .from("queries")
    .select("query_id,user_id,raw_input_text,query,criteria,retries")
    .eq("query_id", queryId)
    .single();

  logger.log("Run More Search 일단 쿼리 확인 : ", q);

  if (qErr || !q || !q.raw_input_text || !q.query || !q.criteria)
    return NextResponse.json({ error: "Query not found" }, { status: 404 });

  await updateRunStatus(queryId, "더 많은 후보군을 탐색해보는 중입니다...");

  const uploadBestTenCandidates = async (fullCandidates: any[]) => {
    await updateRunStatus(
      queryId,
      "Got Best 10 Candidates. Now organizing results."
    );
    const candidates = fullCandidates.map((r: any) => ({
      score: r.score,
      id: r.id,
    }));
    // const candidateIds = fullCandidates.slice(0, 10).map((r: any) => r.id);
    const { error: insErr } = await supabase.from("query_pages").upsert({
      query_id: queryId,
      page_idx: pageIdx,
      candidate_ids: candidates,
      message_id: 0,
    });

    return candidates.slice(0, 10).map((r: any) => r.id);
  };

  let parsed_query = q.query;
  let criteria = q.criteria;

  parsed_query = await makeSqlQuery(
    q.raw_input_text,
    criteria,
    `
이미 한번 검색을 했는데 조건에 맞는 결과가 충분히 잡히지 않았기 때문에, 이번에는 범위를 조금 더 넓혀서 최대한 누군가라도 검색에 잡히도록 좀 더 단순하게 SQL 쿼리를 만들어줘. 아래가 기존에 사용했던 쿼리야. 대신 input에 해당하는 조건이 바뀌어서는 안돼.

Original SQL Query:
"""
${parsed_query}
"""
`
  );
  // 쿼리를 만들었다.
  let { data: searchResults, status: searchStatus } = await searchDatabase(
    {
      query_text: q.raw_input_text ?? "",
      criteria: criteria,
      pageIdx: pageIdx,
      run: { id: queryId, query_id: queryId, criteria: criteria, sql_query: parsed_query },
      sql_query: parsed_query,
      limit: 50,
      offset: 0,
      review_count: 50
    }
  );

  const upRes2 = await supabase.from("queries").upsert({
    query_id: queryId,
    user_id: q.user_id,
    retries: q.retries + 1,
    status: "Got Candidates. Now organizing results.",
  });
  if (!searchResults || searchResults.length === 0) {
    return NextResponse.json(
      { results: [], isNewSearch: true },
      { status: 200 }
    );
  }
  logger.log(`idWithScores === ${searchResults.length} nums `, searchResults);

  // score가 1점인 사람 수
  const oneScoreCount = searchResults.filter((r: any) => r.score === 1).length;
  logger.log(searchResults.length, " oneScoreCount === ", oneScoreCount);

  const mergeCachedCandidates = deduplicateAndScore(
    searchResults,
    (cachedResults?.candidate_ids ?? []) as ScoredCandidate[]
  );
  logger.log("mergeCachedCandidates ", mergeCachedCandidates.length);
  const candidateIds = await uploadBestTenCandidates(mergeCachedCandidates);
  logger.log("upRes2 ", upRes2);
  return NextResponse.json(
    { results: candidateIds, isNewSearch: true },
    { status: 200 }
  );
}
