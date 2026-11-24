import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import { browserRunAwaitsEmailCode, browserRunSubmission, markSubmittedApplications } from "./submissionReceipt";
import type { ExternalOperation } from "../externalOperations/store";

// The stage executor's modules are server-only and create a server client on import; no request reaches it here.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test";
const nodeModule = Module as typeof Module & { _load: (request: string, parent: unknown, isMain: boolean) => unknown };
const originalLoad = nodeModule._load;
nodeModule._load = function (request, parent, isMain) {
  return request === "server-only" ? {} : originalLoad.call(this, request, parent, isMain);
};

const userId = "00000000-0000-4000-8000-000000000001";
const roleId = "00000000-0000-4000-8000-0000000000aa";
const run = (result: Record<string, unknown>, roleRefs: unknown[] = [roleId]) => ({
  id: "00000000-0000-4000-8000-000000000004", kind: "browser_run", status: "completed", user_id: userId,
  conversation_id: null, parent_id: null, idempotency_key: "k", revision: 2, provider_refs: {},
  request: { role_refs: roleRefs }, result, created_at: "2026-11-18T00:00:00Z", updated_at: "2026-11-18T00:00:00Z",
}) as unknown as ExternalOperation;

function adminWith(rows: { id: string; saved_stage: string | null }[]) {
  const moved: Record<string, unknown>[] = [];
  const from = () => {
    const filters: Record<string, unknown> = {};
    const query: any = {
      select: () => query,
      eq: (key: string, value: unknown) => { filters[key] = value; return query; },
      in: (key: string, value: unknown) => { filters[key] = value; return query; },
      maybeSingle: async () => ({ data: { id: filters.id, role_id: roleId }, error: null }),
      then: (resolve: (value: unknown) => void) => resolve({ data: rows, error: null }),
    };
    return query;
  };
  const rpc = async (name: string, args: Record<string, unknown>) => {
    if (name === "move_talent_role_saved_stage_v2") moved.push(args);
    return { data: null, error: null };
  };
  return { admin: { from, rpc } as any, moved };
}

test("the receipt is read case-insensitively and unknown values are not a receipt", () => {
  assert.equal(browserRunSubmission({ submitted: " Yes " }), "yes");
  assert.equal(browserRunSubmission({ submitted: "unclear" }), "unclear");
  assert.equal(browserRunSubmission({ submitted: "maybe" }), null);
  assert.equal(browserRunSubmission({}), null);
});

test("only an unsubmitted run at an emailed code screen awaits an email code", () => {
  assert.equal(browserRunAwaitsEmailCode({ verificationCode: " Email ", submitted: "no" }), true);
  assert.equal(browserRunAwaitsEmailCode({ verificationCode: "email" }), true);
  assert.equal(browserRunAwaitsEmailCode({ verificationCode: "email", submitted: "yes" }), false);
  assert.equal(browserRunAwaitsEmailCode({ verificationCode: "phone", submitted: "no" }), false);
  assert.equal(browserRunAwaitsEmailCode({ verificationCode: "none" }), false);
  assert.equal(browserRunAwaitsEmailCode({ summary: "The site emailed a verification code." }), false);
});

test("a confirmed submission moves only saved or unstaged opportunities to applied", async () => {
  const { admin, moved } = adminWith([
    { id: "rec-saved", saved_stage: "saved" },
    { id: "rec-new", saved_stage: null },
    { id: "rec-connected", saved_stage: "connected" },
    { id: "rec-hidden", saved_stage: "hidden" },
  ]);
  const updates = await markSubmittedApplications({ admin, userId }, run({ submitted: "yes" }));
  assert.deepEqual(moved.map(args => [args.p_recommendation_id, args.p_saved_stage, args.p_actor]),
    [["rec-saved", "applied", "harper_submission"], ["rec-new", "applied", "harper_submission"]]);
  assert.equal(updates.length, 2);
});

test("no, unclear and role-less runs leave stages alone", async () => {
  const { admin, moved } = adminWith([{ id: "rec-saved", saved_stage: "saved" }]);
  for (const operation of [run({ submitted: "no" }), run({ submitted: "unclear" }), run({ summary: "Submitted once." }), run({ submitted: "yes" }, ["not-a-role"])])
    assert.deepEqual(await markSubmittedApplications({ admin, userId }, operation), []);
  assert.deepEqual(moved, []);
});
