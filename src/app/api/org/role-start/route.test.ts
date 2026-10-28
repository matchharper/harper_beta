import assert from "node:assert/strict";
import Module from "node:module";
import { before, test } from "node:test";
import { NextRequest } from "next/server";
import { OrgHttpError } from "@/lib/org/httpError";

const roleId = "20000000-0000-4000-8000-000000000001";
const workspaceId = "10000000-0000-4000-8000-000000000001";
const user = { id: "synthetic-team-member" };
const calls: unknown[] = [];
const background: Array<() => Promise<unknown>> = [];
let authenticated = true;
let allowed = true;
let finishDraft!: () => void;
let finished = false;
const completion = new Promise<void>((resolve) => { finishDraft = resolve; }).then(() => { finished = true; });
let POST: typeof import("./route").POST;

before(async () => {
  const loader = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown };
  const original = loader._load;
  loader._load = function (name, ...args) {
    if (name === "next/server") return { ...original.call(this, name, ...args) as object, after: (fn: () => Promise<unknown>) => background.push(fn) };
    if (name === "@/lib/server/candidateAccess") return {
      requireAuthenticatedUser: async () => { if (!authenticated) throw new Error("Unauthorized"); return user; },
    };
    if (name === "@/lib/org/server") return { OrgHttpError };
    if (name === "@/lib/org/agent/roleCreationState") return {
      createOrResumeDraftRole: async (input: unknown) => {
        calls.push(input);
        if (!allowed) throw new OrgHttpError(403, "Forbidden");
        return roleId;
      },
    };
    if (name === "@/lib/org/roleStart/service") return {
      evaluateRoleStartCandidate: async (input: unknown) => {
        calls.push(input);
        return { phase: "evaluating" };
      },
      beginRoleStartDraft: async (input: unknown) => {
        calls.push(input);
        return { session: { phase: "drafting" }, completion };
      },
    };
    if (name === "@/lib/org/roleStart/view") return { roleStartView: (session: unknown) => session };
    if (name.startsWith("@/lib/org/roleStart/")) return {};
    return original.call(this, name, ...args);
  };
  try { ({ POST } = await import("./route")); } finally { loader._load = original; }
});

function request(action: string, body: Record<string, unknown> = {}) {
  return new NextRequest("https://example.invalid/api/org/role-start", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, roleId, workspaceId, ...body }),
  });
}

test("Setup creates or resumes its chosen draft only through authenticated workspace access", async () => {
  authenticated = false;
  assert.equal((await POST(request("create"))).status, 401);
  assert.equal(calls.length, 0);
  authenticated = true;
  allowed = false;
  assert.equal((await POST(request("create"))).status, 403);
  allowed = true;
  const response = await POST(request("create"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { roleId });
  assert.deepEqual(calls.at(-1), { draftRoleId: roleId, workspaceId, user });
  assert.equal(background.length, 0, "Creating a draft does not start a search");
});

test("starting Brief returns the persisted session while drafting continues after the response", async () => {
  const response = await POST(request("start"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { session: { phase: "drafting" } });
  assert.deepEqual(calls.at(-1), { roleId, workspaceId, user });
  assert.equal(finished, false, "Setup must not wait for model and pool completion");
  assert.equal(background.length, 1);
  finishDraft();
  await background[0]();
  assert.equal(finished, true);
});

test("candidate feedback accepts text alone or a rating, but rejects blank and invalid input", async () => {
  const talentId = "synthetic-candidate";
  for (const body of [
    { reasonText: "관련 업무 범위를 더 확인하고 싶어요." },
    { rating: null, reasonText: "제품을 직접 만든 경험이 중요해요." },
    { rating: "good" },
  ]) {
    const response = await POST(request("evaluate", { talentId, ...body }));
    assert.equal(response.status, 200);
    assert.equal((calls.at(-1) as { rating: unknown }).rating, body.rating ?? null);
    assert.equal((calls.at(-1) as { reasonText: unknown }).reasonText, body.reasonText ?? null);
  }
  const before = calls.length;
  for (const body of [{}, { rating: null, reasonText: " \n " }, { reasonText: 42 }, { rating: "invalid", reasonText: "의견" }]) {
    assert.equal((await POST(request("evaluate", { talentId, ...body }))).status, 400);
  }
  assert.equal(calls.length, before, "invalid submissions never reach the service");
});
