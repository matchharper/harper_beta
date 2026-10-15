/**
 * Operator-only read_search prototype. Not a company agent tool or public API.
 * Existing reasons are returned verbatim and can contain private context.
 * The caller must supply an authorized server client. No models or writes.
 */
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, any>;
const obj = (x: unknown): Row => x && typeof x === "object" && !Array.isArray(x) ? x : {};
const number = (x: unknown): number | null => typeof x === "number" && Number.isSafeInteger(x) && x >= 0 ? x : null;
const text = (x: unknown): string | null => typeof x === "string" && x.trim() ? x : null;
const ratio = (n: number, d: number) => ({ numerator: n, denominator: d, percent: d ? Math.round(n / d * 1000) / 10 : null });
const rolesOf = (r: Row): string[] => [...new Set([r.role_id, ...(r.requested_role_ids ?? []), ...(r.scheduled_role_ids ?? [])].filter(Boolean))];

async function checked(query: PromiseLike<any>): Promise<any> {
  const result = await query;
  if (result.error) throw new Error(`read_search database read failed (${result.error.code ?? "unknown"}): ${result.error.message}`);
  return result;
}

/** Keyset pagination: never silently treat the Data API's first page as a census. */
async function allRows(makeQuery: () => any): Promise<Row[]> {
  const rows: Row[] = [];
  let cursor: string | null = null;
  for (;;) {
    let query = makeQuery().order("id", { ascending: true }).limit(500);
    if (cursor) query = query.gt("id", cursor);
    const { data } = await checked(query);
    if (!data.length) return rows;
    rows.push(...data);
    if (rows.length > 50_000) throw new Error("read_search row budget exceeded; no partial census returned");
    cursor = data[data.length - 1].id;
  }
}

/** A content-independent, repeatable sample, not a ranking by fit or reason. */
function sample(rows: Row[], seed: string, limit: number) {
  return rows.map(row => ({ row, hash: createHash("sha256").update(`${seed}:${row.id}`).digest("hex") }))
    .sort((a, b) => a.hash.localeCompare(b.hash)).slice(0, limit).map(x => x.row);
}

export function partitionStoredFits(rows: Row[]) {
  const v2 = rows.filter(r => r.fit_contract_version === "talent_role_fit_v2");
  const stage1 = v2.filter(r => r.evaluated_stage === 1 && r.stage_one_result === "screened_out");
  const grades = new Set(["perfect", "good", "worth_considering", "bad", "unfit"]);
  const stage2 = v2.filter(r => r.evaluated_stage === 2 &&
    [r.role_fit, r.candidate_fit, r.company_fit].every(x => grades.has(x)));
  const failed = stage2.filter(r => [r.role_fit, r.candidate_fit, r.company_fit].some(x => x === "bad" || x === "unfit"));
  return { stage1, stage2, failed, passed: stage2.length - failed.length,
    legacyOrUnclassified: rows.length - stage1.length - stage2.length };
}

export async function readSearchData(args: {
  admin: SupabaseClient; workspaceId: string; roleId: string; searchRef?: string; sampleLimit?: number;
}) {
  const { admin, workspaceId, roleId } = args;
  const sampleLimit = args.sampleLimit ?? 3;
  if (![workspaceId, roleId, ...(args.searchRef ? [args.searchRef] : [])].every(x => /^[0-9a-f-]{36}$/i.test(x))) {
    throw new Error("Valid workspace, role and optional search UUIDs are required");
  }
  if (!Number.isInteger(sampleLimit) || sampleLimit < 1 || sampleLimit > 8) throw new Error("sampleLimit must be 1..8");
  const startedAt = new Date().toISOString();
  const [{ data: workspace }, { data: role }] = await Promise.all([
    checked(admin.from("company_workspace").select("company_workspace_id,company_name,is_internal").eq("company_workspace_id", workspaceId).single()),
    checked(admin.from("company_roles").select("role_id,name,status,source_type,information").eq("company_workspace_id", workspaceId).eq("role_id", roleId).single()),
  ]);
  if (!workspace.is_internal || role.source_type !== "internal" || obj(role.information).testOnly === true) {
    throw new Error("This operator preview requires a non-test internal Role in an internal workspace");
  }
  const runColumns = "id,status,created_at,started_at,finished_at,source_cutoff,role_id,requested_role_ids,scheduled_role_ids,trigger_reason,result";
  const { data: recent } = await checked(admin.from("company_first_search_runs").select(runColumns)
    .eq("company_workspace_id", workspaceId)
    .or(`role_id.eq.${roleId},requested_role_ids.cs.{${roleId}},scheduled_role_ids.cs.{${roleId}}`)
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(5));
  let run: Row | null = recent[0] ?? null;
  if (args.searchRef) {
    const { data } = await checked(admin.from("company_first_search_runs").select(runColumns)
      .eq("company_workspace_id", workspaceId).eq("id", args.searchRef).single());
    if (!rolesOf(data).includes(roleId)) throw new Error("Search does not include this Role");
    run = data;
  }
  // Review rows belong to a run. Fit rows are current stored results, not that run's funnel.
  const [reviews, fits] = await Promise.all([
    run ? allRows(() => admin.from("talent_opportunity_matching_review").select("id,decision,reason,reviewed_at")
      .eq("run_id", run!.id).eq("opportunity_id", roleId)) : Promise.resolve([]),
    allRows(() => admin.from("talent_opportunity_fit")
      .select("id,evaluated_stage,stage_one_result,role_fit,candidate_fit,company_fit,fit_contract_version,last_evaluated_at,expires_at")
      .eq("opportunity_id", roleId)),
  ]);
  const groups = partitionStoredFits(fits);
  async function fitExamples(rows: Row[], group: string) {
    const chosen = sample(rows, `${roleId}:${group}`, sampleLimit);
    const { data } = chosen.length ? await checked(admin.from("talent_opportunity_fit")
      .select("id,reason,candidate_reason,company_reason,last_evaluated_at")
      .eq("opportunity_id", roleId).in("id", chosen.map(r => r.id))) : { data: [] };
    const byId = new Map<string, Row>(data.map((r: Row) => [r.id, r]));
    return {
      population: rows.length,
      sampling: "stable_hash_sample_of_stored_rows; not a reason-frequency estimate",
      examples: chosen.map((row, i) => {
        const current = byId.get(row.id);
        if (!current || current.last_evaluated_at !== row.last_evaluated_at) return { ref: `${group}-${i + 1}`, unavailable: "row_changed_during_read" };
        return { ref: `${group}-${i + 1}`, evaluatedAt: row.last_evaluated_at,
          ...(row.evaluated_stage === 2 ? { fit: { role: row.role_fit, candidate: row.candidate_fit, company: row.company_fit } } : {}),
          reason: text(current.reason),
          ...(row.evaluated_stage === 2 ? { candidateReason: text(current.candidate_reason), companyReason: text(current.company_reason) } : {}),
        };
      }),
    };
  }
  const [stage1Examples, stage2Examples] = await Promise.all([
    fitExamples(groups.stage1, "stage1"), fitExamples(groups.failed, "stage2"),
  ]);
  const noAction = reviews.filter(r => r.decision === "no_action");
  const decisions: Record<string, number> = {};
  for (const review of reviews) decisions[review.decision] = (decisions[review.decision] ?? 0) + 1;
  const r = obj(run?.result), counts = obj(r.counts), retrieval = obj(r.retrieval);
  const runScope = run && rolesOf(run).length === 1 ? "role" : "workspace_run_not_role_specific";
  const lane = (x: Row) => ({
    pairBudgetAcrossRun: number(x.pairBudget), selectedPairsAcrossRun: number(x.selectedPairs),
    roleQueryReturned: number(obj(x.roleCounts)[roleId]),
    roleBroadPoolReturned: number(obj(x.broadPoolCounts)[roleId]), partial: typeof x.partial === "boolean" ? x.partial : null,
  });
  return {
    audience: "internal_operator_preview; raw reasons are not company-facing copy",
    readWindow: { startedAt, finishedAt: new Date().toISOString(), consistency: "read_only_multi_query; not a transactional snapshot" },
    workspace: { id: workspaceId, name: workspace.company_name }, role: { id: roleId, name: role.name, status: role.status },
    recentSearches: recent.map((x: Row) => ({ searchRef: x.id, createdAt: x.created_at, status: x.status,
      countsScope: rolesOf(x).length === 1 ? "role" : "workspace_run_not_role_specific",
      selected: number(obj(obj(x.result).counts).selected), selectionReusedFrom: obj(x.result).reusedSelectionRunId ?? null })),
    search: run ? {
      searchRef: run.id, status: run.status, trigger: run.trigger_reason,
      sourceCutoff: run.source_cutoff, startedAt: run.started_at, finishedAt: run.finished_at,
      countsScope: runScope, selectionReusedFrom: r.reusedSelectionRunId ?? null,
      recordedCounts: Object.fromEntries(["retrieved", "hard_filtered", "freshScorePairs", "reusedFitPairs", "staleFitPairs", "scoringFailed", "rerankPool", "reviewed", "noAction", "companyFirst", "candidateFirst", "acceptedConnect", "acceptedReject", "acceptedDefer", "selected", "liveGuardExcluded"].map(k => [k, number(counts[k])])),
      retrieval: { new: lane(retrieval), refresh: lane(obj(retrieval.refresh)) },
      missing: ["run-specific stage1/stage2 counts are not stored", "selection and delivery are different; delivery receipts are not read", "retrieval counts describe limited lanes, not the whole talent pool", "scoringFailed counts error entries, not necessarily candidates"],
    } : null,
    finalReview: {
      scope: "selected run and representative Role only", total: reviews.length, decisions,
      noActionShareOfOrdinaryDecisions: ratio(noAction.length, reviews.filter(x => ["no_action", "candidate_first", "company_first", "both"].includes(x.decision)).length),
      noActionReasons: { population: noAction.length, withReason: noAction.filter(x => text(x.reason)).length,
        sampling: "stable_hash_sample; not a reason-frequency estimate",
        examples: sample(noAction, `${run?.id}:${roleId}`, sampleLimit).map((x, i) => ({ ref: `final-${i + 1}`, reviewedAt: x.reviewed_at, reason: text(x.reason) })) },
    },
    storedRoleAssessments: {
      scope: "current stored fit rows for this Role; all evaluation dates, not selected run",
      source: "talent_opportunity_fit", storedPairs: fits.length,
      freshness: "input fingerprint and current sharing/route eligibility not checked; not a current recommendable census",
      expiredByTimestamp: fits.filter(x => x.expires_at && Date.parse(x.expires_at) <= Date.parse(startedAt)).length,
      missingExpiry: fits.filter(x => !x.expires_at).length,
      classifiedV2Pairs: groups.stage1.length + groups.stage2.length, legacyOrUnclassifiedPairs: groups.legacyOrUnclassified,
      stage1ScreenedOut: groups.stage1.length, stage2Completed: groups.stage2.length,
      stage2BelowStructuralFloor: groups.failed.length, stage2PassesStructuralFloor: groups.passed,
      stage1ShareOfClassifiedStoredResults: ratio(groups.stage1.length, groups.stage1.length + groups.stage2.length),
      belowFloorShareOfStoredStage2: ratio(groups.failed.length, groups.stage2.length),
      stage1Reasons: stage1Examples, stage2Reasons: stage2Examples,
    },
    talentPool: { total: null, growth: null, roleExperienceShare: null, reason: "Not measured by these stored search/fit records; no proxy from retrieved counts or legacy fits" },
  };
}

export type SearchReadData = Awaited<ReturnType<typeof readSearchData>>;

/** LLM-facing return value. Keep raw evidence available only to internal callers. */
export async function read_search(args: Parameters<typeof readSearchData>[0]): Promise<string> {
  return formatSearchText(await readSearchData(args));
}

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function compactSearchTime(value: string | null, reference: string): string {
  if (!value) return "미기록";
  const parts = (date: string) => Object.fromEntries(timeFormatter.formatToParts(new Date(date)).map(p => [p.type, p.value]));
  if (!Number.isFinite(Date.parse(value))) return "시각 미확인";
  const p = parts(value), year = parts(reference).year;
  return `${p.year === year ? "" : `${p.year}/`}${p.month}/${p.day} ${p.hour}:${p.minute}`;
}

/** Formatting only: no semantic rewriting, reason classification, or new model call. */
export function formatSearchText(data: SearchReadData): string {
  const asOf = data.readWindow.finishedAt;
  const year = timeFormatter.formatToParts(new Date(asOf)).find(p => p.type === "year")!.value;
  const date = (v: string | null) => compactSearchTime(v, asOf);
  const n = (v: number | null | undefined) => v == null ? "미기록" : v.toLocaleString("en-US");
  const percent = (r: { numerator: number; denominator: number; percent: number | null }) =>
    `${n(r.numerator)}/${n(r.denominator)}${r.percent == null ? " (비율 미산출)" : ` (${r.percent}%)`}`;
  const labels: Record<string, string> = {
    succeeded: "완료", failed: "실패", queued: "대기", running: "진행 중", skipped: "건너뜀",
    connect: "기수락 후보 연결 선정", reject: "기수락 후보 제외", defer: "기수락 후보 보류",
    company_first: "회사 선추천", candidate_first: "후보자 선추천", both: "양방향 선정", no_action: "미선정",
    scheduled: "정기", active: "채용 중",
  };
  const label = (s: string) => labels[s] ?? s;
  const lines: string[] = [
    `${data.workspace.name} · ${data.role.name} (${label(data.role.status)})`,
    `조회 ${date(asOf)} | ${year}년, 한국 시간(KST) | 읽기 전용·조회 중 변경 가능`,
    "내부 판단 자료. reason은 저장 원문이며 개인 맥락을 포함할 수 있음. 회사 답변에 그대로 인용하지 않음.",
    "",
    "최근 검색 (접수 시각 / 상태 / 선정; 전달 완료와 다름)",
    ...data.recentSearches.map((r: Row) => `${date(r.createdAt)} / ${label(r.status)} / ${n(r.selected)}명${r.countsScope === "role" ? "" : " [회사 전체 실행]"}${r.selectionReusedFrom ? " [이전 선정 재사용]" : ""}`),
  ];
  const run = data.search;
  if (run) {
    const c = run.recordedCounts;
    lines.push("", `상세 검색: ${date(run.startedAt)} → ${date(run.finishedAt)} · ${label(run.trigger)} · ${label(run.status)}`);
    if (run.sourceCutoff !== run.startedAt) lines.push(`데이터 기준 ${date(run.sourceCutoff)}`);
    if (run.countsScope !== "role") lines.push("아래 실행 집계는 회사 전체이며 이 Role만의 수치가 아님.");
    if (run.selectionReusedFrom) lines.push("이전 선정을 재사용한 실행. 새로운 판단 표본이 아님.");
    lines.push(`검색 회수 ${n(c.retrieved)}명 → 필터 후 ${n(c.hard_filtered)}명; 새 평가 ${n(c.freshScorePairs)}쌍·재사용 ${n(c.reusedFitPairs)}쌍`,
      `최종 검토 pool ${n(c.rerankPool)}명·결정 기록 ${n(c.reviewed)}명; 선정 ${n(c.selected)}명`,
      "평가 단위는 후보×Role. 기존 평가 등이 합류하므로 전체를 단순 감소 퍼널로 해석하지 않음.");
    for (const [key, name] of [["staleFitPairs", "갱신 불일치 평가"], ["scoringFailed", "평가 오류 기록(후보 수 아님)"], ["liveGuardExcluded", "선정 후 현재성 검사 제외"]]) {
      if (c[key] !== 0) lines.push(`${name}: ${n(c[key])}`);
    }
    for (const [name, r] of [["신규 탐색", run.retrieval.new], ["재평가 탐색", run.retrieval.refresh]] as const) {
      lines.push(`${name}: Role 검색 반환 ${n(r.roleQueryReturned)}·넓은 탐색 반환 ${n(r.roleBroadPoolReturned)}; 실행 전체 평가 투입 ${n(r.selectedPairsAcrossRun)}/예산 ${n(r.pairBudgetAcrossRun)}쌍${r.partial === true ? " [부분 결과]" : r.partial === null ? " [완전성 미기록]" : ""}`);
    }
    const review = data.finalReview;
    lines.push(`해당 Role 최종 결정 ${n(review.total)}명: ${Object.entries(review.decisions).map(([k, v]) => `${label(k)} ${v}`).join(" · ") || "없음"}`,
      `일반 후보 최종 미선정 ${percent(review.noActionShareOfOrdinaryDecisions)}; 기수락 후보 연결·제외·보류는 분모에서 제외`,
      "이번 실행의 1·2차 수량은 미기록. 검색 반환 수는 전체 인재풀 수가 아니며 실제 전달 결과는 미조회.");
  } else lines.push("", "연결된 검색 실행 없음. 아래 저장 평가는 검색 실행 이력과 별개.");

  const stored = data.storedRoleAssessments;
  lines.push("", "현재 저장된 Role 평가 (전체 평가 시점 포함; 위 실행과 별개)",
    `총 ${n(stored.storedPairs)}쌍 = 단계 구분 가능 ${n(stored.classifiedV2Pairs)} + 과거 형식·구분 불가 ${n(stored.legacyOrUnclassifiedPairs)}`,
    `1차 제외 ${percent(stored.stage1ShareOfClassifiedStoredResults)}; 2차 완료 ${n(stored.stage2Completed)}`,
    `2차 하한 미통과 ${percent(stored.belowFloorShareOfStoredStage2)}; 하한 통과 ${n(stored.stage2PassesStructuralFloor)}`,
    `만료 시각 경과 ${n(stored.expiredByTimestamp)}·만료 시각 없음 ${n(stored.missingExpiry)}. 현재 입력 일치·공유 자격 미검증: 현재 추천 가능 인원으로 해석하지 않음.`,
    "", "미선정·제외 reason 표본", "내용과 무관하게 고정 추출. 표본의 이유 비중을 전체 탈락 비율로 확대하지 않음.");

  function reasons(title: string, group: { population: number; examples: Row[]; withReason?: number }) {
    lines.push("", `${title}: ${group.examples.length}/${n(group.population)}건${group.withReason === undefined ? "" : `, reason 기록 ${n(group.withReason)}건`}`);
    const times = [...new Set(group.examples.map(x => x.reviewedAt ?? x.evaluatedAt).filter(Boolean))];
    if (times.length === 1) lines.push(`평가 ${date(times[0])}`);
    for (const e of group.examples) {
      const at = e.reviewedAt ?? e.evaluatedAt;
      lines.push(`[${e.ref}]${at && times.length > 1 ? ` ${date(at)}` : ""}${e.fit ? ` | 직무 ${e.fit.role} / 후보 ${e.fit.candidate} / 회사 ${e.fit.company}` : ""}`);
      if (e.unavailable) { lines.push(`미조회: ${e.unavailable}`); continue; }
      if (e.reason) lines.push(e.reason);
      if (e.candidateReason) lines.push(`후보 관점: ${e.candidateReason}`);
      if (e.companyReason) lines.push(`회사 관점: ${e.companyReason}`);
      if (!e.reason && !e.candidateReason && !e.companyReason) lines.push("reason 미기록");
    }
  }
  if (run) reasons("해당 실행의 최종 미선정", data.finalReview.noActionReasons);
  reasons("저장 평가의 1차 제외", stored.stage1Reasons);
  reasons("저장 평가의 2차 하한 미통과", stored.stage2Reasons);
  lines.push("", "인재풀 전체 규모·증가 추세·관련 경력 비중: 미측정.");
  return lines.join("\n");
}
