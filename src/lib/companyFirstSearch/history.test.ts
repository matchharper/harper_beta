import assert from "node:assert/strict";
import test from "node:test";
import { readCandidateOutreachPauses, readMatchingRunHistory } from "./history";
import { formatMatchingRunHistory, serializeOrgAgentToolResult } from "@/lib/org/agent/promptFormat";
import { executeOrgAgentTool } from "@/lib/org/agent/toolExecution";
import { createOrgAgentToolExecutionStateFromSnapshot, isOrgAgentLongTextComplete } from "@/lib/org/agent/toolState";
import { fitOrgAgentMoreDataContent, type OrgAgentMoreDataResult } from "@/lib/org/agent/data";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const roleId = "00000000-0000-4000-8000-000000000101";
const otherRoleId = "00000000-0000-4000-8000-000000000102";
const run = (index: number) => ({
  id: `run-${index}`, company_workspace_id: workspaceId,
  created_at: "2026-10-06T22:00:00Z", started_at: "2026-10-07T00:00:00Z", finished_at: "2026-10-07T00:03:00Z",
  status: "succeeded", trigger_reason: "scheduled", scheduled_role_ids: [roleId], requested_role_ids: [otherRoleId],
  query_plan: { reason: "역할의 채용 요청을 기준으로 새 후보 탐색", searchStrategy: "직접 수행한 제품 개발 경험 탐색", roleQueries: ["PRIVATE SQL"] },
  result: { counts: { hard_filtered: 16, rerankPool: 8, freshScorePairs: 12, reusedFitPairs: 20, candidateFirst: 2, companyFirst: 1, selected: 2, priorityReviewSelected: 0 },
    noSelectionReason: "PRIVATE TALENT BRIEF", reason: "PRIVATE ERROR DETAIL", selectedTalentIds: ["PRIVATE TALENT ID"] },
});

function fakeAdmin(rows = Array.from({ length: 11 }, (_, i) => run(i)), options = { memory: "회사 메모", error: null as Error | null }) {
  const queries: Array<{ table: string; filters: Array<[string, unknown]>; selected: string; range?: number[]; orders: string[] }> = [];
  return { queries, from(table: string) {
    const query = { table, filters: [] as Array<[string, unknown]>, selected: "", orders: [] as string[], range: undefined as number[] | undefined };
    queries.push(query);
    const builder: any = {
      select(value: string) { query.selected = value; return builder; },
      or(value: string) { query.filters.push(["or", value]); return builder; },
      eq(key: string, value: unknown) { query.filters.push([key, value]); return builder; },
      is(key: string, value: unknown) { query.filters.push([key, value]); return builder; },
      in(key: string, value: unknown) { query.filters.push([key, value]); return builder; },
      order(key: string) { query.orders.push(key); return builder; },
      range(from: number, to: number) { query.range = [from, to]; return builder; },
      maybeSingle() { return builder; },
      then(resolve: (value: unknown) => unknown) {
        if (table === "company_workspace") return Promise.resolve(resolve({ data: { is_reviewing: false }, error: null }));
        if (table === "company_user_workspace") return Promise.resolve(resolve({ data: { authority: "owner", access_scope: "organization", team_id: null }, error: null }));
        if (table === "company_first_search_runs") return Promise.resolve(resolve({ data: query.range ? rows.slice(query.range[0], query.range[1] + 1) : rows, error: options.error }));
        if (table === "company_roles") return Promise.resolve(resolve({ data: [{ role_id: roleId, name: "Backend" }, { role_id: otherRoleId, name: "Product" }], error: null }));
        if (table === "company_memories") return Promise.resolve(resolve({ data: { content: options.memory }, error: null }));
        throw Error(`Unexpected table: ${table}`);
      },
    };
    return builder;
  } };
}

async function execute(input: unknown, admin = fakeAdmin()) {
  const state = createOrgAgentToolExecutionStateFromSnapshot({ roles: [{ roleId, name: "Backend" }] as any, workspace: { workspaceId } as any });
  const result = await executeOrgAgentTool({ actorId: "actor", actorLabel: "팀원", admin: admin as any,
    audience: "company_safe", callId: "read-1", conversation: { company_workspace_id: workspaceId } as any,
    currentUserMessageId: 1, input, name: "get_more_data", scopeKey: "test", slackThreadId: null,
    source: "chat", state, user: { id: "actor" } as any });
  return { result, state, text: serializeOrgAgentToolResult("get_more_data", result) };
}

test("default page and next pages share a company-safe projection and never load another workspace", async () => {
  const admin = fakeAdmin();
  const first = await readMatchingRunHistory({ admin: admin as any, workspaceId });
  const second = await execute({ kinds: ["matching_runs"], offset: first.nextOffset }, admin);
  const last = await readMatchingRunHistory({ admin: admin as any, workspaceId, offset: 10 });
  assert.equal(first.items.length, 5); assert.equal(first.nextOffset, 5);
  assert.equal((second.result.matchingRuns as any).items.length, 5);
  assert.equal((second.result.matchingRuns as any).nextOffset, 10);
  assert.equal(last.items.length, 1); assert.equal(last.nextOffset, null);
  assert.deepEqual(second.result.requestedKinds, ["matching_runs"]);
  assert.equal(second.state.activatedMoreData.length, 0);
  assert.ok(second.text.includes("offset=10")); assert.ok(second.text.includes("Backend"));
  assert.equal(second.text.includes("PRIVATE"), false);
  assert.equal(JSON.stringify(first).includes("PRIVATE"), false);
  assert.equal(first.items[0].roles.length, 2);
  for (const q of admin.queries) assert.ok(q.filters.some(([key, value]) => key === "company_workspace_id" && value === workspaceId));
  assert.deepEqual(admin.queries[0].orders, ["created_at", "id"]);
  assert.deepEqual(admin.queries[0].range, [0, 5]);
});

test("timestamps, explicit zero and missing counts retain different meanings", async () => {
  const admin = fakeAdmin([{ ...run(0), status: "queued", started_at: null, finished_at: null,
    request_options: {sourceMessageId:42}, source_cutoff:"2026-10-06T21:00:00Z",
    result: { counts: { candidateFirst: 0, companyFirst: -1, freshScorePairs: "12" } } } as any]);
  const history = await readMatchingRunHistory({ admin: admin as any, workspaceId });
  assert.equal(history.items[0].startedAt, null);
  assert.equal(history.items[0].evaluatedPairs, null);
  assert.equal(history.items[0].companyProposals, null);
  const text = formatMatchingRunHistory(history);
  assert.ok(text.includes("요청 등록: 2026년 10월 7일 07:00 KST, 정기 검색"));
  assert.ok(text.includes("message_id: 42"));
  assert.ok(text.includes("데이터 기준시각: 2026년 10월 7일 06:00 KST"));
  assert.ok(text.includes("후보자에게 먼저 추천 선정: 0명"));
  assert.ok(text.includes("회사에게 먼저 추천할 후보자 선정: 기록 없음"));
  assert.ok(text.includes("전체 검토: 기록 없음"));
  assert.equal(history.items[0].candidateOutreachPauses, undefined);
  assert.ok(text.includes("과거 측정 기록이 없는 상태"));
});

test("interactive history separates new calls, saved population, comparison labels and list changes", async () => {
  const row = run(0);
  const history = await readMatchingRunHistory({ workspaceId, admin: fakeAdmin([{ ...row,
    result: { roleSearch: { briefVersion: "version", scope: "unassessed", selectionMethod: "stage2_mutual_fit_desc_v1", stage1Passed: 3, stage2Evaluated: 3,
      counts: { stage1Evaluated: 12, stage1Excluded: 9, currentStage2Evaluated: 103, selectionPoolStage2Evaluated: 3, stage3Written: 2 },
      addedTalentIds: ["new"], removedTalentIds: [], refreshedTalentIds: ["existing"],
      criteriaStats: [{ name: "Ownership", count: 3, criterionDefinition: "Required ownership; domain experience preferred",
        labelCounts: { good: 1, uncertain: 2 }, labelExpectedCounts: { good: 1.23456789 } }],
    } },
  } as any]) as any });
  const formatted = formatMatchingRunHistory(history);
  assert.ok(formatted.includes("새 평가: 1차 12명 중 통과 3명, 제외 9명; 2차 3명"));
  assert.ok(formatted.includes("전체 누적 2차 평가 103명"));
  assert.ok(formatted.includes("저장된 2차 상호 적합 점수순 Top N"));
  assert.ok(formatted.includes("추가 비교 모델 호출 없음"));
  assert.ok(formatted.includes("비교 모집단 3명"));
  assert.ok(formatted.includes("분모 3명: good 1명, uncertain 2명"));
  assert.ok(formatted.includes("추가 1명, 제외 0명, 기존 설명 갱신 1명"));
  assert.ok(formatted.includes("domain experience preferred"));
  assert.equal(formatted.includes("labelExpectedCounts"), false);
  assert.equal(formatted.includes("1.23456789"), false);
});

test("reused and failed history preserve measured zero and absent summary as different facts", async () => {
  const history = await readMatchingRunHistory({ workspaceId, admin: fakeAdmin([
    { ...run(0), result: { roleSearch: { briefVersion: "v1", scope: "evaluated", stage1Passed: 0, stage2Evaluated: 0,
      counts: { stage1Evaluated: 0, stage1Excluded: 0, currentStage2Evaluated: 90 },
      criteriaStats: [{ name: "Ownership", count: 90, labelCounts: { uncertain: 90 } }],
    } } }, { ...run(1), status: "failed", result: {} },
  ] as any) as any });
  const formatted = formatMatchingRunHistory(history);
  assert.ok(formatted.includes("새 평가: 1차 0명 중 통과 0명, 제외 0명; 2차 0명"));
  assert.ok(formatted.includes("비교 모집단 미측정"));
  assert.ok(formatted.includes("실패·과거 실행의 요약 수치가 없더라도 저장된 평가가 없다는 뜻은 아니다"));
  assert.ok(formatted.includes("limited/conflict 등의 합계가 실제 제외 인원이나 제외 사유는 아니다"));
  assert.ok(formatted.includes("이유 원문은 없다"));
});

test("an explicitly recorded no-capacity-pause is distinct from missing legacy data", async () => {
  const row=run(0);
  const history=await readMatchingRunHistory({ admin: fakeAdmin([{ ...row,
    result: { ...row.result, candidateOutreachPauses: [] } } as any]) as any,workspaceId });
  assert.deepEqual(history.items[0].candidateOutreachPauses, []);
  assert.match(formatMatchingRunHistory(history), /상한 때문에 후보자 선추천을 중단한 역할이 없음/);
  assert.match(formatMatchingRunHistory(history), /전체 검토: 16명/);
});

test("compact history uses people rather than role pairs and has one privacy footer", async () => {
  const history = await readMatchingRunHistory({ admin: fakeAdmin() as any, workspaceId });
  const formatted = formatMatchingRunHistory(history);
  assert.match(formatted, /전체 검토: 16명, 추천 가능하지만 이번에 추천하지 않음: 6명/);
  assert.match(formatted, /회사에게 먼저 추천할 후보자 선정: 1명 · 후보자에게 먼저 추천 선정: 2명/);
  for (const removed of ["실행 계기:", "새 fit 평가:", "기존 fit 재사용:", "우선 검토 요청 선정:", "전체 선정:", "이전 선정 결과 재사용:"]) {
    assert.equal(formatted.includes(removed), false);
  }
  const footer = "개인 정보 보호를 이유로 후보자에게 먼저 추천한 내역을 공유받지 못함.";
  assert.equal(formatted.split(footer).length - 1, 1);
  assert.ok(formatted.endsWith(footer));
  assert.ok(formatMatchingRunHistory({ items: [], offset: 0, nextOffset: null }).endsWith(footer));
});

test("unselected rerank counts preserve zero and unknown rather than adding both route counts", async () => {
  for (const [counts, expected] of [
    [{ rerankPool: 8, selected: 2, companyFirst: 2, candidateFirst: 2 }, "6명"],
    [{ rerankPool: 2, selected: 2 }, "0명"],
    [{ selected: 0 }, "기록 없음 (0으로 해석하지 않음)"],
    [{ rerankPool: 8 }, "기록 없음 (0으로 해석하지 않음)"],
    [{ rerankPool: 1, selected: 2 }, "기록 없음 (0으로 해석하지 않음)"],
  ] as const) {
    const history = await readMatchingRunHistory({ workspaceId,
      admin: fakeAdmin([{ ...run(0), result: { counts } } as any]) as any });
    assert.ok(formatMatchingRunHistory(history).includes(`추천 가능하지만 이번에 추천하지 않음: ${expected}`));
  }
});

test("legacy pair totals count people only when exactly one role was reviewed", async () => {
  const row = run(0);
  const counts = { freshScorePairs: 35, reusedFitPairs: 10, companyFirst: 2, candidateFirst: 0 };
  const read = async (requestedRoleIds: string[]) => readMatchingRunHistory({ workspaceId,
    admin: fakeAdmin([{ ...row, requested_role_ids: requestedRoleIds,
      result: { counts } } as any]) as any });
  const single = await read([]);
  assert.equal(single.items[0].reviewedTalents, 45);
  assert.match(formatMatchingRunHistory(single), /전체 검토: 45명/);
  const multiple = await read([otherRoleId]);
  assert.equal(multiple.items[0].reviewedTalents, null);
  assert.match(formatMatchingRunHistory(multiple), /전체 검토: 기록 없음/);
});

test("history preserves measured capacity facts and omits unrelated roles or private reasons", async () => {
  const row = run(0);
  const history = await readMatchingRunHistory({ admin: fakeAdmin([{ ...row, result: {
    ...row.result, candidateOutreachPauses: [
      { roleId, pendingCount: 14, maxPendingTalents: 10, reason: "PRIVATE" },
      { roleId: "another-workspace-role", pendingCount: 100, maxPendingTalents: 10 },
      { roleId, pendingCount: 9, maxPendingTalents: 10 },
    ],
  } } as any]) as any, workspaceId });
  assert.deepEqual(history.items[0].candidateOutreachPauses, [{ roleId, pendingCount: 14, maxPendingTalents: 10 }]);
  const formatted = formatMatchingRunHistory(history);
  assert.match(formatted, /당시 연결 수락할 후보 14명 \/ 상한 10명/);
  assert.match(formatted, /회사에 먼저 후보를 제안하는 경로에는 적용하지 않음/);
  assert.doesNotMatch(formatted, /PRIVATE|100명/);
  assert.deepEqual(readCandidateOutreachPauses({ candidateOutreachPauses: [
    { roleId, pendingCount: "14", maxPendingTalents: 10 },
    { roleId, pendingCount: 14, maxPendingTalents: -1 },
  ] }), []);
});

test("empty history is readable while a database failure remains an error", async () => {
  const empty = await execute({ kinds: ["matching_runs"] }, fakeAdmin([]));
  assert.ok(empty.text.includes("이 페이지에 검색 실행 기록 없음"));
  assert.ok(empty.text.includes("다음 페이지 없음"));
  await assert.rejects(execute({ kinds: ["matching_runs"] }, fakeAdmin([], { memory: "", error: Error("database unavailable") })), /database unavailable/);
});

test("mixed history and retained data honor schema and preserve completeness within the tool budget", async () => {
  const admin = fakeAdmin(undefined, { memory: "회사 메모".repeat(4000), error: null });
  const { result, state, text } = await execute({ kinds: ["matching_runs", "workspace_memory"], offset: 5 }, admin);
  assert.ok(text.includes("<matching_runs>"));
  assert.ok(text.includes("<workspace_memory_markdown>"));
  assert.ok(text.includes("offset=10"));
  assert.ok(text.length < 14_000);
  assert.equal(text.includes("serialization_complete=false"), false);
  assert.deepEqual(state.activatedMoreData.map(item => item.kind), ["workspace_memory"]);
  assert.equal((result.workspaceMemory as any).complete, false);
  assert.equal(isOrgAgentLongTextComplete({ state, key: "workspace_memory", roleId: null,
    currentValue: (result.workspaceMemory as any).content }), false);
});

test("retained team member IDs count toward the space reserved alongside history", () => {
  const result: OrgAgentMoreDataResult = { requestedKinds: ["members"], members: {
    complete: true, totalCount: 100, returnedCount: 100,
    items: Array.from({ length: 100 }, (_, i) => ({ userId: `member-${i}`.padEnd(36, "0"), name: "팀원", email: null, role: "member" })),
  } };
  fitOrgAgentMoreDataContent({ fullTextKeys: [], result, contentBudget: 1000 });
  assert.equal(result.members!.complete, false);
  assert.ok(result.members!.items.reduce((total, item) => total + item.userId.length + (item.name?.length ?? 0) + (item.email?.length ?? 0) + (item.role?.length ?? 0), 0) <= 1000);
});

for (const input of [
  { kinds: ["matching_runs"], offset: -1 }, { kinds: ["matching_runs"], offset: 1.5 },
  { kinds: ["matching_runs"], offset: "5" }, { kinds: ["matching_runs"], offset: Infinity },
  { kinds: ["workspace_memory"], offset: 5 }, { kinds: ["matching_runs", "invented"] },
  { kinds: ["matching_runs"], fullTextKeys: ["workspace_request"] },
]) test(`invalid history arguments are rejected before reading: ${JSON.stringify(input)}`, async () => {
  const admin = fakeAdmin();
  await assert.rejects(execute(input, admin));
  assert.equal(admin.queries.length, 0);
});


test("role history filters before pagination, including legacy arrays", async () => {
  const admin = fakeAdmin();
  await readMatchingRunHistory({ admin: admin as any, workspaceId, roleId, offset: 20, limit: 20 });
  const query = admin.queries.find(item => item.table === "company_first_search_runs")!;
  assert.deepEqual(query.range, [20, 40]);
  assert.ok(query.filters.some(([key, value]) => key === "or" && value ===
    `role_id.eq.${roleId},scheduled_role_ids.cs.{${roleId}},requested_role_ids.cs.{${roleId}}`));
});

test("role-scoped history preserves its scope through the next tool page", async () => {
  const first = await readMatchingRunHistory({ admin: fakeAdmin() as any, workspaceId, roleId });
  assert.equal(first.roleId, roleId);
  assert.ok(formatMatchingRunHistory(first).includes(`roleId="${roleId}", offset=5`));
  const admin = fakeAdmin();
  const next = await execute({ kinds: ["matching_runs"], roleId, offset: first.nextOffset }, admin);
  assert.equal((next.result.matchingRuns as any).roleId, roleId);
  const query = admin.queries.find(item => item.table === "company_first_search_runs")!;
  assert.deepEqual(query.range, [5, 10]);
  assert.ok(query.filters.some(([key, value]) => key === "or" && String(value).includes(`role_id.eq.${roleId}`)));
});
