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
let lostSave = false;
let finishDraft!: () => void;
let finished = false;
const completion = new Promise<void>((resolve) => { finishDraft = resolve; }).then(() => { finished = true; });
const role = { status: "draft", name: "Fixture", description: "JD", hasDescription: true,
  locationText: null, workMode: null, employmentTypes: [], salaryRange: null };
const session = { phase: "questions", brief: {}, questions: { history: [] }, firstCandidates: [] };
let GET: typeof import("./route").GET;
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
    if (name === "@/lib/org/roleStart/access") return {
      readRoleStartAccess: async () => { if (!allowed) throw new OrgHttpError(403, "Forbidden"); return role; },
    };
    if (name === "@/lib/org/roleStart/session") return { loadRoleStartSession: async () => session };
    if (name === "@/lib/org/roleStart/compensation") return { compensationChips: () => [{ ko: "협의", en: "Discuss" }] };
    if (name === "@/lib/org/roleStart/service") return {
      checkBriefConsistency: () => [],
      answerRoleStartQuestion: async (input: unknown) => { calls.push(input); return lostSave ? null : session; },
      answerRoleStartCompensation: async () => ({ session: { ...session, questions: { history: [], compensation: "answered" } }, salaryRange: "1억원" }),
      evaluateRoleStartCandidate: async (input: unknown) => {
        calls.push(input);
        return { ...session, phase: "evaluating" };
      },
      beginRoleStartDraft: async (input: unknown) => {
        calls.push(input);
        return { session: { ...session, phase: "drafting" }, completion };
      },
    };
    if (name === "@/lib/org/roleStart/view") return { roleStartView: (session: unknown) => session };
    if (name.startsWith("@/lib/org/roleStart/")) return {};
    return original.call(this, name, ...args);
  };
  try { ({ GET, POST } = await import("./route")); } finally { loader._load = original; }
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
  const payload = await response.json();
  assert.equal(payload.session.phase, "drafting");
  assert.deepEqual(payload.role, role);
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


test("polling and answers return the screen snapshot without loading RoleCreationState", async () => {
  // The full loader is deliberately absent from the mock: these requests must not call it.
  const response = await GET(new NextRequest(`https://example.invalid/api/org/role-start?roleId=${roleId}&workspaceId=${workspaceId}`));
  assert.equal(response.status, 200);
  const initial = await response.json();
  const answer = await POST(request("answer", { questionId: "q1", text: "스타트업 경험 중요" }));
  assert.equal(answer.status, 200);
  const payload = await answer.json();
  assert.deepEqual(payload.role, initial.role);
  assert.deepEqual(payload.issues, []);
  assert.deepEqual(payload.compensation, initial.compensation);
  assert.equal(payload.session.phase, "questions");
  const compensation = await POST(request("compensation", { text: "1억원" }));
  const saved = await compensation.json();
  assert.equal(saved.role.salaryRange, "1억원");
  assert.equal(saved.compensation, null, "the next screen needs no follow-up GET");
  allowed = false;
  assert.equal((await GET(new NextRequest(`https://example.invalid/api/org/role-start?roleId=${roleId}&workspaceId=${workspaceId}`))).status, 403);
  allowed = true;
});

test("a lost session write returns a conflict, not a successful null snapshot", async () => {
  lostSave = true;
  const response = await POST(request("answer", { questionId: "q1", text: "경험" }));
  assert.equal(response.status, 409);
  assert.match(response.headers.get("server-timing") ?? "", /^role-start;dur=/);
  lostSave = false;
});
