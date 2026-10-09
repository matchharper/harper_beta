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
  result: { counts: { hard_filtered: 16, freshScorePairs: 12, reusedFitPairs: 20, candidateFirst: 2, companyFirst: 1, selected: 2, priorityReviewSelected: 0 },
    noSelectionReason: "PRIVATE TALENT BRIEF", reason: "PRIVATE ERROR DETAIL", selectedTalentIds: ["PRIVATE TALENT ID"] },
});

function fakeAdmin(rows = Array.from({ length: 11 }, (_, i) => run(i)), options = { memory: "회사 메모", error: null as Error | null }) {
  const queries: Array<{ table: string; filters: Array<[string, unknown]>; selected: string; range?: number[]; orders: string[] }> = [];
  return { queries, from(table: string) {
    const query = { table, filters: [] as Array<[string, unknown]>, selected: "", orders: [] as string[], range: undefined as number[] | undefined };
    queries.push(query);
    const builder: any = {
      select(value: string) { query.selected = value; return builder; },
      eq(key: string, value: unknown) { query.filters.push([key, value]); return builder; },
      is(key: string, value: unknown) { query.filters.push([key, value]); return builder; },
      in(key: string, value: unknown) { query.filters.push([key, value]); return builder; },
      order(key: string) { query.orders.push(key); return builder; },
      range(from: number, to: number) { query.range = [from, to]; return builder; },
      maybeSingle() { return builder; },
      then(resolve: (value: unknown) => unknown) {
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
  const state = createOrgAgentToolExecutionStateFromSnapshot({ roles: [], workspace: { workspaceId } as any });
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
    result: { counts: { candidateFirst: 0, companyFirst: -1, freshScorePairs: "12" } } } as any]);
  const history = await readMatchingRunHistory({ admin: admin as any, workspaceId });
  assert.equal(history.items[0].startedAt, null);
  assert.equal(history.items[0].evaluatedPairs, null);
  assert.equal(history.items[0].companyProposals, null);
  const text = formatMatchingRunHistory(history);
  assert.ok(text.includes("실행: 2026년 10월 7일 07:00 KST, 정기 검색"));
  assert.ok(text.includes("후보자에게 먼저 추천 선정: 0명"));
  assert.ok(text.includes("회사에게 먼저 추천할 후보자 선정: 기록 없음"));
  assert.ok(text.includes("전체 검토: 기록 없음"));
  assert.equal(history.items[0].candidateOutreachPauses, undefined);
  assert.ok(text.includes("과거 측정 기록이 없는 상태"));
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
  assert.match(formatted, /전체 검토: 16명/);
  assert.match(formatted, /회사에게 먼저 추천할 후보자 선정: 1명 · 후보자에게 먼저 추천 선정: 2명/);
  for (const removed of ["등록:", "시작:", "종료:", "실행 계기:", "새 fit 평가:", "기존 fit 재사용:", "우선 검토 요청 선정:", "전체 선정:", "이전 선정 결과 재사용:"]) {
    assert.equal(formatted.includes(removed), false);
  }
  const footer = "개인 정보 보호를 이유로 후보자에게 먼저 추천한 내역을 공유받지 못함.";
  assert.equal(formatted.split(footer).length - 1, 1);
  assert.ok(formatted.endsWith(footer));
  assert.ok(formatMatchingRunHistory({ items: [], offset: 0, nextOffset: null }).endsWith(footer));
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
  assert.match(formatted, /당시 연결 대기 14명 \/ 상한 10명/);
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
