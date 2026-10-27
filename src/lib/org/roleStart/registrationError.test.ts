import assert from "node:assert/strict";
import Module from "node:module";
import { before, test } from "node:test";
import { billingErrorCopy, WorkspaceBillingError } from "../billing/types";
import { billingErrorResponse } from "../billing/http";
import type { RoleStartProgress, RoleStartSession } from "./session";
import { normalizeRoleStartBrief } from "./brief";

process.env.OPENAI_API_KEY ||= "test-only-not-used";
process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-only-not-used";

let session: RoleStartSession;
let activationError: unknown;
let activationCalls = 0;
let run: typeof import("./service").runRoleStartFirstBatch;
let ratingsKey: typeof import("./service").ratingsKey;
let view: typeof import("./view").roleStartView;

before(async () => {
  const loader = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown };
  const original = loader._load;
  loader._load = function (name, ...args) {
    if (name === "server-only") return {};
    if (name === "@/lib/server/candidateAccess") return {
      getSupabaseAdmin: () => ({ rpc: async (rpc: string) => {
        assert.equal(rpc, "complete_company_role_creation_v1");
        activationCalls++;
        return { data: null, error: activationError };
      } }),
    };
    if (name === "@/lib/org/agent/roleCreationState") return {
      fetchRoleCreationState: async () => ({ role: { status: "draft" } }),
    };
    if (name === "./session") return {
      ...original.call(this, name, ...args) as object,
      loadRoleStartSession: async () => session,
      mergeRoleStartTimings: async () => undefined,
      upsertRoleStartProgress: async (_roleId: string, entry: Omit<RoleStartProgress, "at">) => {
        const value = { ...entry, at: new Date().toISOString() };
        const index = session.progress.findIndex(item => item.key === entry.key);
        if (index < 0) session.progress.push(value);
        else session.progress[index] = value;
      },
      saveRoleStartSession: async ({ patch }: { patch: Partial<RoleStartSession> }) => {
        Object.assign(session, patch);
        return session;
      },
    };
    return original.call(this, name, ...args);
  };
  try {
    ({ runRoleStartFirstBatch: run, ratingsKey } = await import("./service"));
    ({ roleStartView: view } = await import("./view"));
  } finally { loader._load = original; }
});

test("background activation preserves the capacity error through the session and browser response", async () => {
  // The registration time-budget timer need not keep this isolated test alive.
  const timeout = globalThis.setTimeout;
  globalThis.setTimeout = ((...args: Parameters<typeof setTimeout>) => {
    const timer = timeout(...args);
    timer.unref();
    return timer;
  }) as typeof setTimeout;
  try {
    for (const error of [
      { code: "P0001", message: "workspace_role_capacity_exceeded" },
      new WorkspaceBillingError("role_capacity_exceeded"),
      new Error("private database diagnostic"),
    ]) {
      session = {
        roleId: "synthetic-role", workspaceId: "synthetic-workspace", phase: "registering",
        brief: normalizeRoleStartBrief({}), firstCandidates: [], evaluations: {},
        questions: { history: [], candidates: [], probes: [], stopped: true },
        pendingQuestion: null, pool: null, batch: null, progress: session?.progress ?? [], timings: {}, llmUsage: [],
        prepared: { entries: {}, stats: {} }, revision: 1, refinedAnswers: 0, leases: {},
        updatedAt: new Date().toISOString(),
      } as RoleStartSession;
      session.prepared.batch = {
        key: ratingsKey(session), status: "done", startedAt: session.updatedAt,
        result: { brief: session.brief, notes: [], proposals: [], candidates: [], passing: 0, judged: 0 },
      } as NonNullable<RoleStartSession["prepared"]["batch"]>;
      activationError = error;
      await run({ roleId: session.roleId, userId: null, user: { id: "synthetic-user" } as never });
      assert.equal(session.phase, "evaluating", "failed activation retains the editable draft");
      // Simulate the persisted session being loaded by the polling endpoint.
      const response = view(JSON.parse(JSON.stringify(session)))!;
      const failure = response.progress.find(item => item.step === "batch" && item.status === "error")!;
      assert.ok(failure);
      if (error instanceof Error && !(error instanceof WorkspaceBillingError)) {
        assert.equal(failure.billingCode, undefined, "unknown errors keep the generic recovery message");
        assert.ok(!JSON.stringify(response).includes(error.message), "raw diagnostics stay off screen");
      } else {
        assert.equal(failure.billingCode, "role_capacity_exceeded");
        assert.match(billingErrorCopy(failure.billingCode!, "ko"), /1개.*일시 중지.*유료 슬롯/);
        assert.match(billingErrorCopy(failure.billingCode!, "en"), /one Free Role.*pausing.*paid slot/);
      }
    }
    assert.equal(activationCalls, 3);
  } finally { globalThis.setTimeout = timeout; }
});

test("the shared billing error reader retains existing HTTP status and copy", async () => {
  for (const [error, code, status] of [
    [{ message: "workspace_role_capacity_exceeded" }, "role_capacity_exceeded", 409],
    [{ message: "workspace_credits_exhausted" }, "credits_exhausted", 409],
    [new WorkspaceBillingError("billing_forbidden", 403), "billing_forbidden", 403],
  ] as const) {
    const response = billingErrorResponse(error)!;
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { billingCode: code, error: billingErrorCopy(code, "ko") });
  }
  assert.equal(billingErrorResponse(new Error("unknown")), null);
});
