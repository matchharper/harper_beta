import { supabase } from "@/lib/supabase";
import { logger } from "@/utils/logger";

enum Status {
  QUEUED = "queued",
  RUNNING = "running",
  DONE = "done",
  ERROR = "error",
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type RpcLikeResult = { data: any; error: any };

/**
 * supabase.rpc("set_timeout_and_execute_raw_sql", {...}) 를 대체하는 함수
 *
 * 동작:
 * 1) runs에 sql_query 저장 + status='queued'
 * 2) status가 done/error 될 때까지 폴링
 * 3) done이면 runs.results(uuid[]) 기반으로 최종 row를 JOIN해서 반환
 *
 * IMPORTANT:
 * - 워커가 runs.status를 done/error로 바꾸고, runs.results에 uuid[]를 넣어줘야 함
 */
export async function rpc_set_timeout_and_execute_raw_sql_via_runs(params: {
  runId: string;
  queryId: string;

  // 기존 rpc 파라미터를 그대로 받되, 실제 실행은 워커가 함
  sql_query: string;
  page_idx: number;
  limit_num: number;
  offset_num: number;
  // 옵션
  pollIntervalMs?: number; // 기본 600
  maxWaitMs?: number; // 기본 25000 (서버리스면 너무 길게 잡지 말 것)
}): Promise<RpcLikeResult> {
  const {
    runId,
    queryId,
    sql_query,
    page_idx,
    limit_num,
    offset_num,
    pollIntervalMs = 1500, // 1500ms
    maxWaitMs = 140000, // 140 seconds
  } = params;
  const finalSelect = `
    id,
    name,
    bio,
    headline,
    location,
    experience_user(
      role,
      description,
      start_date,
      end_date,
      company_db(
          name,
          investors,
          short_description,
          employee_count_range,
          founded_year,
          location,
          specialities
      )
    ),
    edu_user(
        school,
        degree,
        field,
        start_date,
        end_date
    ),
    publications(
        title,
        link,
        published_at
    ),
    extra_experience(*)
  `;

  const start_time = performance.now();
  logger.log("DB Search 시작");

  // 1) enqueue: runs에 sql_query + status=queued 저장
  const { error: upErr } = await supabase
    .from("runs")
    .update({
      sql_query,
      status: Status.QUEUED,
      limit_num: limit_num,
      results: null,
    })
    .eq("id", runId)
    .eq("query_id", queryId);

  if (upErr) return { data: null, error: upErr };

  // 2) done/error 될 때까지 폴링
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const { data: runRow, error: rErr } = await supabase
      .from("runs")
      .select("status, results")
      .eq("id", runId)
      .eq("query_id", queryId)
      .single();

    if (rErr) return { data: null, error: rErr };

    const status = runRow.status as string;

    if (status.includes(Status.ERROR)) {
      // 요구사항: 에러면 에러 리턴 (추가 칼럼 없으니 일반 메시지로)
      return { data: null, error: { message: "Search failed" } };
    }

    if (status === Status.DONE) {
      // 3) done이면 results에서 uuid id 리스트 추출
      // results가 uuid[] 라고 했지만 혹시 [{id:...}] 형태도 방어
      const raw = runRow?.results;

      const ids: string[] = Array.isArray(raw)
        ? raw
            .map((v: any) => (typeof v === "string" ? v : v?.id))
            .filter((x: any) => typeof x === "string" && x.length > 0)
        : [];

      if (ids.length === 0) {
        // 기존 rpc가 data[0]에 []를 주는 것처럼 맞춤
        return { data: [[]], error: null };
      }

      // 4) ids로 최종 데이터 JOIN해서 생성 (candid 기준 예시)
      const { data: rows, error: jErr } = await supabase
        .from("candid")
        .select(finalSelect)
        .in("id", ids);

      if (jErr) return { data: null, error: jErr };

      // ids 순서 유지 (Supabase in()은 순서 보장 안 함)
      const order = new Map(ids.map((id, i) => [id, i]));
      const sorted = (rows ?? []).slice().sort((a: any, b: any) => {
        return (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9);
      });

      logger.log(
        `🐙 데이터 조회 완료 ${sorted.length}명 [${((performance.now() - start_time) / 1000).toFixed(3)}s] \n`
      );

      return { data: [sorted], error: null };
    }

    // queued/running/기타면 대기
    await sleep(pollIntervalMs);
  }
  logger.log(
    `🐙 데이터 조회 타임아웃 [${((performance.now() - start_time) / 1000).toFixed(3)}s] \n`
  );

  // 5) 타임아웃: 서버리스면 이 케이스가 있을 수 있음
  return { data: null, error: { message: "Timeout waiting for worker" } };
}
