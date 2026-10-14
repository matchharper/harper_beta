import assert from "node:assert/strict";
import test from "node:test";
import { executeOrgAgentTool } from "@/lib/org/agent/toolExecution";
import { serializeOrgAgentToolResult } from "@/lib/org/agent/promptFormat";
import { createOrgAgentToolExecutionStateFromSnapshot } from "@/lib/org/agent/toolState";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const roleId = "00000000-0000-4000-8000-000000000101";
const startedAt = new Date(Date.now() - 12 * 60_000).toISOString();

/** Queue RPC plus the search-run reads behind the timing facts. */
function fakeAdmin(rpcData: Record<string, unknown>) {
  const tables: string[] = [];
  return {
    tables,
    rpc() {
      return Promise.resolve({ data: rpcData, error: null });
    },
    from(table: string) {
      tables.push(table);
      let selected = "";
      let filteredById = false;
      const builder: any = {
        select(value: string) { selected = value; return builder; },
        eq(key: string) { if (key === "id") filteredById = true; return builder; },
        in() { return builder; }, gte() { return builder; }, lte() { return builder; },
        not() { return builder; }, order() { return builder; }, limit() { return builder; },
        maybeSingle() { return builder; },
        then(resolve: (value: unknown) => unknown) {
          if (filteredById) return Promise.resolve(resolve({ data: { started_at: startedAt }, error: null }));
          const data = selected === "started_at,finished_at"
            ? [14, 29, 22].map(minutes => ({
                started_at: "2026-10-01T00:00:00Z",
                finished_at: new Date(Date.parse("2026-10-01T00:00:00Z") + minutes * 60_000).toISOString(),
              }))
            : [{ id: "recent" }];
          return Promise.resolve(resolve({ data, error: null }));
        },
      };
      return builder;
    },
  };
}

async function requestSearch(rpcData: Record<string, unknown>) {
  const admin = fakeAdmin(rpcData);
  const state = createOrgAgentToolExecutionStateFromSnapshot({
    roles: [{ name: "Backend Engineer", roleId, status: "active" } as any],
    workspace: { workspaceId } as any,
  });
  const result = await executeOrgAgentTool({
    actorId: "actor", actorLabel: "팀원", admin: admin as any, audience: "company_safe",
    callId: "search-1", conversation: { company_workspace_id: workspaceId } as any,
    currentUserMessageId: 1, input: { roleId }, name: "request_matching_search",
    scopeKey: "test", slackThreadId: null, source: "slack", state, user: { id: "actor" } as any,
  });
  return { admin, result, state, text: serializeOrgAgentToolResult("request_matching_search", result) };
}

test("a queued search tells the model its usual duration without claiming the whole pool", async () => {
  const { admin, result, state, text } = await requestSearch({
    roleId, runId: "run-1", startsAfterCurrentRun: false, status: "queued",
  });
  assert.equal(result.status, "queued");
  assert.match(text, /typical_search_duration=Recent candidate searches finished about 20 minutes after starting/);
  assert.match(text, /including when no one suitable is found/);
  assert.doesNotMatch(text, /run-1|startsAfterCurrentRun|starts_after_current_search/);
  assert.ok(admin.tables.every(table => table === "company_first_search_runs"));
  assert.doesNotMatch(state.fallbackReply ?? "", /전체|풀|가장 적합한/);
  assert.match(state.fallbackReply ?? "", /결과를 따로 알려드릴게요/);
});

test("a reused running search reports when it started", async () => {
  const { state, text } = await requestSearch({
    roleId, runId: "run-9", startsAfterCurrentRun: false, status: "already_running",
  });
  assert.match(text, /search_started_at=.+ KST \(about 12 minutes ago\)/);
  assert.match(state.fallbackReply ?? "", /이미 진행 중/);
});
