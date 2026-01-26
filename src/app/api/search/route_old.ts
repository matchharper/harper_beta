// import { geminiInference, xaiInference } from "@/lib/llm/llm";
// import { supabase } from "@/lib/supabase";
// import { ensureGroupBy } from "@/utils/textprocess";
// import { NextRequest, NextResponse } from "next/server";
// import { criteriaPrompt, firstSqlPrompt, sqlExistsPrompt } from "@/lib/prompt";
// import { generateSummary } from "./criteria_summarize/utils";
// import {
//   deduplicateAndScore,
//   mapWithConcurrency,
//   ScoredCandidate,
//   sumScore,
//   updateRunStatus,
// } from "./utils";
// import { makeMessage } from "../hello/utils";
// import { ko } from "@/lang/ko";
// import { logger } from "@/utils/logger";
// import { notifyToSlack } from "@/lib/slack";

// async function parseCriteria(
//   queryText: string
// ): Promise<{ criteria: string[]; rephrasing: string; thinking: string }> {
//   const prompt = `
// ${criteriaPrompt}
// ${queryText}
// `.trim();
//   // Responses API + structured outputs (text.format)
//   const outText = await xaiInference(
//     "grok-4-fast-reasoning",
//     "You are a head hunting expert. Your input is a natural-language request describing criteria for searching job candidates.",
//     prompt,
//     0.5,
//     1,
//     false,
//     "search_query_parser_harper_20260105"
//   );

//   const cleanedResponse = (outText as string).trim().replace(/\n/g, " ").trim();
//   const outJson = JSON.parse(cleanedResponse);
//   logger.log("outJson ", outJson);

//   return outJson as any;
// }

// async function makeSqlQuery(
//   queryText: string,
//   criteria: string[],
//   extraInfo: string = ""
// ): Promise<string | any> {
//   try {
//     let prompt = `
// ${firstSqlPrompt}
// Natural Language Query: ${queryText}
// Criteria: ${criteria}
// `.trim();
//     if (extraInfo) {
//       prompt += `
// Extra Info: ${extraInfo}
// `;
//     }

//     // Responses API + structured outputs (text.format)
//     const outText = await geminiInference(
//       "gemini-3-flash-preview",
//       "You are a head hunting expertand SQL Query parser. Your input is a natural-language request describing criteria for searching job candidates.",
//       prompt,
//       0.5
//     );
//     const cleanText = (outText as string).trim().replace(/\n/g, " ").trim();

//     // const transformedSqlQuery = transformSql(cleanedResponse);
//     const sqlQuery = `
// SELECT DISTINCT ON (T1.id)
//   to_json(T1.id) AS id,
//   T1.name,
//   T1.headline,
//   T1.location
// FROM
//   candid AS T1
// ${cleanText}
// `;
//     const sqlQueryWithGroupBy = ensureGroupBy(sqlQuery, "");
//     logger.log(
//       "\n\n-------- 🔥 cleanedResponse1 🔥 ---------\n\n",
//       sqlQueryWithGroupBy,
//       "\n\n-------- 🔥 cleanedResponse1 🔥 ---------\n\n"
//     );

//     const pp2 =
//       sqlExistsPrompt +
//       `
// Input SQL Query:
// """
// ${sqlQueryWithGroupBy}
// """
// `;
//     await new Promise((resolve) => setTimeout(resolve, 2000));

//     const outText2 = await geminiInference(
//       "gemini-3-flash-preview",
//       "You are a SQL Query refinement expert.",
//       pp2,
//       0.4
//     );
//     const cleanedResponse2 = (outText2 as string)
//       .trim()
//       .replace(/\n/g, " ")
//       .trim();

//     logger.log(
//       "\n\n-------- ⭐️ cleanedResponse2 ⭐️ ---------\n\n",
//       cleanedResponse2,
//       "\n\n-------- ⭐️ cleanedResponse2 ⭐️ ---------\n\n"
//     );

//     // const outJson = JSON.parse(cleanedResponse2);
//     const sqlQueryWithGroupBy2 = ensureGroupBy(cleanedResponse2, "");

//     return sqlQueryWithGroupBy2;
//   } catch (e) {
//     console.error("makeSqlQuery error ", e);
//     return e;
//   }
// }

// /**
//  * raw_input_text, criteria를 받아서 SQL 쿼리를 만들고, 50명을 검색하고, 요약을 만들고, 만족하는 10명을 점수와 함께 리턴하는 함수
//  */
// const searchDatabase = async (
//   raw_input_text: string,
//   criteria: string[],
//   pageIdx: number,
//   queryId: string,
//   userId: string,
//   sql_query: string,
//   limit: number = 50,
//   offset: number = 0
// ) => {
//   // const sqlQueryWithGroupBy = ensureGroupBy(sql_query, ""); // 다듬기
//   logger.log("sqlQueryWithGroupBy === \n", sql_query, "\n---\n");

//   const upRes2 = await supabase.from("queries").upsert({
//     query_id: queryId,
//     user_id: userId,
//     query: sql_query,
//     status: ko.loading.searching_candidates,
//   });

//   const start_time = performance.now();
//   let data: any[] | null = [];
//   let error;
//   const { data: data1, error: error1 } = await supabase.rpc(
//     "set_timeout_and_execute_raw_sql",
//     {
//       sql_query: sql_query,
//       page_idx: pageIdx,
//       limit_num: limit,
//       offset_num: offset,
//     }
//   );
//   data = data1;
//   error = error1;
//   const end_time = performance.now();
//   logger.log(
//     "\n\ntime for fetching data : ",
//     end_time - start_time,
//     error,
//     "\n\n"
//   );

//   if (error && error.message.includes("timeout")) {
//     logger.log("\n\n⚠️ 그냥 Database 쿼리 자체만 한번 더 실행 ==");
//     await updateRunStatus(queryId, ko.loading.searching_again);
//     const { data: data2, error: error2 } = await supabase.rpc(
//       "set_timeout_and_execute_raw_sql",
//       {
//         sql_query: sql_query,
//         page_idx: pageIdx,
//         limit_num: limit,
//         offset_num: offset,
//       }
//     );
//     data = data2;
//     error = error2;
//   }

//   if (error) {
//     logger.log("\n\n⚠️ First sql query error == try second == ", error);
//     await updateRunStatus(queryId, ko.loading.retrying_error);

//     let additional_prompt = "";
//     if (error.message.includes("timeout")) {
//       additional_prompt = `
// If the error indicates a timeout (e.g., contains any of: timeout, statement timeout, canceling statement due to statement timeout, 504, Function timed out, deadline exceeded), treat it as a performance-fix task rather than a syntax-fix task.

// **TIMEOUT rules**
// - Preserve the meaning and returned rows as much as possible, but you MAY restructure the query ONLY to reduce execution time.
// - Prefer a two-phase approach for speed: first select only T1.id (and any columns required for ORDER BY / DISTINCT ON) with restrictive filters and LIMIT, then join other tables to fetch the final columns.
// - Do NOT add new tables. Do NOT add new filtering logic. Do NOT change ranking/ordering semantics.
// - Allowed performance-only transformations (choose the minimum needed):
// - Replace JOIN-based filtering with EXISTS subqueries when the joined table is used only for filtering (keeps semantics, reduces row explosion).
// - If the query uses LEFT JOIN but filters on the joined table in WHERE, rewrite to EXISTS (or change to INNER JOIN) without changing logic.
// - Add DISTINCT/DISTINCT ON only if the original query already implied deduplication or is returning duplicates due to joins (do not change results otherwise).
// - Push down WHERE filters into the phase-1 id subquery/CTE so fewer rows are joined later.
// - Avoid selecting large JSON/text columns in phase-1; fetch them only in phase-2.
// - Keep all tsvector / tsquery logic as-is (@@ and tsquery functions), except minimal fixes required to avoid tsquery syntax errors.
// - Output MUST be a single valid SQL statement only. No explanations.
// - **중요** DB Search 속도를 위해서는 먼저 조건을 만족하는 candid의 id만 뽑고, 그 다음에 table을 JOIN으로 붙여야 한다.
// `;
//     }
//     let fixed_query = await xaiInference(
//       "grok-4-fast-reasoning",
//       "You are a specialized SQL query fixing assistant. If there are any errors in the SQL query, fix them and return the fixed SQL query.",
//       `You are an expert PostgreSQL SQL fixer for a recruitment candidate search system.

// Goal:
// Given (1) a PostgreSQL SQL query that failed and (2) the database error message, produce a corrected SQL query.

// Critical rules:
// - Fix ONLY what is necessary to resolve the SQL error.
// - Do not change or fix the meaning of the query.
// - Preserve the original intent and structure as much as possible (do not redesign the query).
// - Do NOT add new tables, new joins, or new filters unless required to fix the error.
// - Keep the tsvector search logic in place (tsvector column, to_tsquery/plainto_tsquery/websearch_to_tsquery, @@ operator).
// - Keep the WHERE clause logic in place; only correct syntax/typing/aliasing/parentheses/quoting issues.
// - If the error is caused by tsquery syntax, fix the query string minimally (escaping, removing illegal operators, using websearch_to_tsquery, etc.).
// - If the error is caused by ambiguous columns/aliases, qualify with table aliases instead of changing logic.
// - If the error is caused by type mismatch, cast minimally.
// - Output MUST be a single valid SQL statement only. No explanations, no markdown, no comments, no codeblock.
// - 속도를 위해서는 먼저 id만 뽑고(LIMIT), 그 다음에 table을 붙이는게 낫다.
// ${additional_prompt}
// Inputs:
// [SQL]
// ${sql_query},

// [ERROR]
// ${error.message}

// Return:
// A corrected SQL query.
// `,
//       0.2,
//       1
//     );

//     logger.log("⚠️ ==== fixed_query ==== \n\n", fixed_query);
//     const sqlQueryWithGroupBy2 = ensureGroupBy(fixed_query as string, "");
//     const upRes3 = await supabase.from("queries").upsert({
//       query_id: queryId,
//       user_id: userId,
//       query: fixed_query as string,
//       status: ko.loading.searching_candidates,
//     });

//     const { data: data2, error: error2 } = await supabase.rpc(
//       "set_timeout_and_execute_raw_sql",
//       {
//         sql_query: sqlQueryWithGroupBy2,
//         page_idx: pageIdx,
//         limit_num: limit,
//         offset_num: offset,
//       }
//     );
//     data = data2;
//     error = error2;
//   }

//   logger.log(
//     "총 가져온 지원자 data : ",
//     data?.[0]?.length,
//     // JSON.stringify(data?.[0]?.slice(0, 1), null, 2),
//     "\nError : ",
//     error
//   );
//   if (!data || !data[0] || data[0].length === 0) {
//     return [];
//   }

//   await updateRunStatus(queryId, ko.loading.summarizing);

//   const fullScore = criteria.length * 2;
//   // 1. LLM 요약 및 점수 계산만 먼저 수행
//   const scored: (ScoredCandidate & { summary: string })[] =
//     await mapWithConcurrency(data[0] as any[], 17, async (candidate) => {
//       const id = candidate.id as string;
//       let summary: string | null = null;
//       let lines: string[] = [];

//       try {
//         summary = (await generateSummary(
//           candidate,
//           criteria,
//           raw_input_text
//         )) as string;
//         lines = JSON.parse(summary);
//       } catch (e) {
//         lines = [];
//         summary = "";
//       }

//       const score = sumScore(lines);

//       return {
//         id,
//         score:
//           fullScore !== 0 ? Math.round((score / fullScore) * 100) / 100 : 1,
//         summary, // 나중에 저장하기 위해 결과에 포함
//       };
//     });

//   // 2. DB에 저장할 데이터 필터링 (에러 등으로 요약이 없는 경우 제외)
//   const upsertData = scored
//     .filter((s) => s.summary !== null)
//     .map((s) => ({
//       candid_id: s.id,
//       query_id: queryId,
//       text: s.summary,
//     }));

//   // 3. 한 번의 네트워크 요청으로 모두 저장 (Batch Upsert)
//   if (upsertData.length > 0) {
//     const { error } = await supabase
//       .from("synthesized_summary")
//       .upsert(upsertData); // 단일 요청으로 N개 저장

//     if (error) console.error("Batch upsert error:", error);
//   }

//   // Sort desc by score, tie-breaker optional (stable-ish by id)
//   scored
//     .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
//     .map((s) => ({ score: s.score, id: s.id }));

//   return scored;
// };

// export async function POST(req: NextRequest) {
//   const body = await req.json();
//   const { queryId, pageIdx } = body;

//   if (!queryId)
//     return NextResponse.json({ error: "Missing queryId" }, { status: 400 });

//   let offset = 0;
//   let cachedCandidates: any[] = [];

//   // 이미 검색해둔 결과가 있는지 찾기
//   const { data: resultsPages, error: lpErr } = await supabase
//     .from("query_pages")
//     .select("*")
//     .eq("query_id", queryId)
//     .eq("page_idx", pageIdx)
//     .order("created_at", { ascending: false });

//   const nextPageIdx = pageIdx + 1;
//   const cachedResults = resultsPages?.[0];

//   logger.log(pageIdx, "쿼리와 results ", cachedResults);

//   // 이미 검색한 결과가 있다면 그대로 리턴
//   if (cachedResults && cachedResults.candidate_ids) {
//     const candidateIds = cachedResults.candidate_ids
//       .slice(0, 10)
//       .map((r: any) => r.id);
//     return NextResponse.json(
//       { nextPageIdx, results: candidateIds },
//       { status: 200 }
//     );
//   } else if (pageIdx > 0) {
//     const { data: prevResultsPages } = await supabase
//       .from("query_pages")
//       .select("*")
//       .eq("query_id", queryId)
//       .eq("page_idx", pageIdx - 1)
//       .order("created_at", { ascending: false });

//     const prevCachedResults = prevResultsPages?.[0];
//     if (
//       !prevResultsPages ||
//       !prevCachedResults ||
//       !prevCachedResults.candidate_ids ||
//       prevCachedResults.candidate_ids.length === 0
//     ) {
//       return NextResponse.json({ nextPageIdx, results: [] }, { status: 200 });
//     }
//     const isLoadMore =
//       (prevCachedResults.candidate_ids.length + pageIdx * 10) % 50 === 0;
//     logger.log("prevCachedResults ", prevCachedResults.candidate_ids?.length);
//     if (!isLoadMore) {
//       logger.log("\n\n50의 배수가 아닌 경우 그냥 10개 리턴\n\n");
//       // 점수 순으로 나열, 앞 10개 제외하고 뒤 (N-10)개 저장, 리턴은 max(N-10, 10)개 리턴
//       // 같은 쿼리를 날려봤자 50명 이하이기 때문에 똑같음.
//       const candidateIds = prevCachedResults.candidate_ids.slice(10);
//       await supabase.from("query_pages").insert({
//         message_id: 0,
//         query_id: queryId,
//         page_idx: pageIdx,
//         candidate_ids: candidateIds,
//       });
//       return NextResponse.json(
//         {
//           nextPageIdx,
//           results: candidateIds.slice(0, 10).map((r: any) => r.id),
//         },
//         { status: 200 }
//       );
//     } else if (isLoadMore) {
//       logger.log("\n\n50의 배수인 경우\n\n");
//       const candidateIds = prevCachedResults.candidate_ids.slice(10);
//       const scoreSum = candidateIds
//         .slice(0, 10)
//         .reduce((acc: number, curr: any) => acc + curr.score, 0);
//       if (scoreSum >= 10) {
//         await supabase.from("query_pages").insert({
//           message_id: 0,
//           query_id: queryId,
//           page_idx: pageIdx,
//           candidate_ids: candidateIds,
//         });
//         return NextResponse.json(
//           {
//             nextPageIdx,
//             results: candidateIds.slice(0, 10).map((r: any) => r.id),
//           },
//           { status: 200 }
//         );
//       } else {
//         //
//         offset = 50;
//         cachedCandidates = candidateIds;
//       }
//     }
//   }

//   // 저장되어있는 결과가 없다면 새롭게 검색해야한다는 뜻.
//   const { data: q, error: qErr } = await supabase
//     .from("queries")
//     .select("query_id,user_id,raw_input_text,query,criteria")
//     .eq("query_id", queryId)
//     .single();

//   logger.log("일단 쿼리 확인 : ", q);

//   if (qErr || !q || !q.raw_input_text)
//     return NextResponse.json({ error: "Query not found" }, { status: 404 });

//   const uploadBestTenCandidates = async (fullCandidates: any[]) => {
//     await updateRunStatus(
//       queryId,
//       "Got Best 10 Candidates. Now organizing results."
//     );
//     const candidates = fullCandidates.map((r: any) => ({
//       score: r.score,
//       id: r.id,
//     }));
//     // const candidateIds = fullCandidates.slice(0, 10).map((r: any) => r.id);
//     const { error: insErr } = await supabase.from("query_pages").insert({
//       query_id: queryId,
//       page_idx: pageIdx,
//       candidate_ids: candidates,
//       message_id: 0,
//     });

//     return candidates.slice(0, 10).map((r: any) => r.id);
//   };

//   // input query로 SQL문을 만들어뒀는지 아닌지
//   // 저장되어있는 결과가 없다면 새롭게 검색해야한다는 뜻.
//   let parsed_query = q.query;
//   let criteria = q.criteria;

//   if (!parsed_query) {
//     await updateRunStatus(queryId, ko.loading.making_criteria);
//     const {
//       criteria: criteria1,
//       rephrasing,
//       thinking,
//     } = await parseCriteria(q.raw_input_text);
//     criteria = criteria1;

//     const upRes = await supabase.from("queries").upsert({
//       query_id: queryId,
//       user_id: q.user_id,
//       criteria: criteria,
//       thinking: rephrasing + " | " + thinking,
//       status: ko.loading.making_query,
//     });

//     parsed_query = await makeSqlQuery(q.raw_input_text, criteria, "");
//     if (typeof parsed_query !== "string") {
//       await updateRunStatus(queryId, JSON.stringify(parsed_query));
//       return NextResponse.json(parsed_query, { status: 404 });
//     }
//   }
//   // 쿼리를 만들었다.
//   let searchResults = await searchDatabase(
//     q.raw_input_text ?? "",
//     criteria ?? [],
//     pageIdx,
//     queryId,
//     q.user_id,
//     parsed_query,
//     50,
//     offset
//   );
//   logger.log(`idWithScores === ${searchResults.length} nums `, searchResults);

//   // score가 1점인 사람 수
//   const oneScoreCount = searchResults.filter((r: any) => r.score === 1).length;
//   logger.log(searchResults.length, " oneScoreCount === ", oneScoreCount);

//   const mergeCachedCandidates = deduplicateAndScore(
//     searchResults,
//     cachedCandidates
//   );
//   logger.log("mergeCachedCandidates ", mergeCachedCandidates.length);
//   const candidateIds = await uploadBestTenCandidates(mergeCachedCandidates);

//   if (
//     pageIdx === 0 &&
//     (candidateIds.length === 0 ||
//       candidateIds.length < 10 ||
//       candidateIds.length >= 50 ||
//       oneScoreCount <= 5)
//   ) {
//     const message = await makeMessage(
//       q.raw_input_text ?? "",
//       criteria?.join(", ") ?? "",
//       candidateIds.length === 0
//         ? "no"
//         : candidateIds.length < 10
//         ? "less"
//         : "more"
//     );
//     logger.log("message ", message);
//     if (message) {
//       logger.log("들어는 옵니다. message ", message["message"]);
//       const res = await supabase.from("queries").upsert({
//         query_id: queryId,
//         user_id: q.user_id,
//         message: message["message"],
//         recommendation: message["recommendations"]?.join("|") ?? "no",
//       });
//       logger.log("res ", res);
//     }
//   }
//   if (pageIdx === 0 && candidateIds.length === 0) {
//     await notifyToSlack(`🔍 *Search Result Not Found! 검색 결과가 없어요!*

// • *Query*: ${q.raw_input_text}
// • *Criteria*: ${criteria?.join(", ")}
// - *User ID*: ${q.user_id}
// • *Time(Standard Korea Time)*: ${new Date().toLocaleString("ko-KR")}`);
//   }
//   return NextResponse.json(
//     { nextPageIdx, results: candidateIds, isNewSearch: true },
//     { status: 200 }
//   );
// }
