import assert from "node:assert/strict";
import Module from "node:module";
import { before, test } from "node:test";

// Which company Harper wake-ups collect into one run (D12). Database and queue
// replaced; nothing is dispatched.
const rpcs: Array<{ name: string; args: Record<string, unknown> }> = [];
const admin = {
  rpc: async (name: string, args: Record<string, unknown>) => {
    rpcs.push({ name, args });
    return { data: [{ job_id: "job", created: true }], error: null };
  },
};
let turn: typeof import("./webActionTurn");
before(async () => {
  const mod = Module as any;
  const original = mod._load;
  const mocks: Record<string, unknown> = {
    "server-only": {},
    "../requestScope.server": { deferOrgResponseWork: () => true },
    "@/lib/org/stageTiming.server": { traceStageStep: (_: string, run: () => unknown) => run() },
    "@/lib/org/agent/store": {
      ensureOrgAgentConversation: async () => ({ admin, conversation: { id: "conversation", role_id: null } }),
      ensureOrgRoleCreationConversation: async () => ({ admin, conversation: { id: "role-conversation", role_id: "role" } }),
    },
    "@/lib/org/agent/webActionConversation": { chooseWebActionConversation: (c: unknown) => c },
    "@/lib/org/agent/webActionQueue": { publishCompanyAgentWebActionJob: async () => undefined },
    "@/lib/server/candidateAccess": { getSupabaseAdmin: () => admin },
  };
  mod._load = function (request: string, parent: unknown, isMain: boolean) {
    return request in mocks ? mocks[request] : original.call(this, request, parent, isMain);
  };
  try {
    turn = await import("./webActionTurn");
  } finally {
    mod._load = original;
  }
});

test("Pass/requests and stage moves collect into one run; other events run alone", async () => {
  assert.deepEqual(turn.BATCHED_WEB_ACTIONS, {
    company_intro_decision: 45,
    candidate_stage_changed: 45,
  });
  for (const actionName of ["candidate_stage_changed", "company_intro_decision", "company_update"]) {
    rpcs.length = 0;
    await turn.enqueueOrgAgentWebActionTurn({
      actionContext: { stage: "connected" },
      actionName,
      idempotencyKey: `key:${actionName}`,
      roleId: "role",
      user: { id: "member" } as any,
      workspaceId: "workspace",
    });
    const batched = actionName !== "company_update";
    assert.equal(rpcs[0].name, batched ? "enqueue_company_agent_web_action_batched_v1" : "enqueue_company_agent_web_action_v1");
    assert.equal(rpcs[0].args.p_window_seconds, batched ? 45 : undefined);
    assert.equal(rpcs[0].args.p_conversation_id, "role-conversation");
  }
});
