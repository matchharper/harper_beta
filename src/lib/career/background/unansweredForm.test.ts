import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { NextRequest } from "next/server";
import { formatLlmDateTime } from "@/lib/llm/promptDateTime";
import { getConfiguredPublicSiteUrl } from "@/lib/siteUrl";
import { CAREER_BACKGROUND_INSTRUCTION, renderCareerBackgroundInvocation } from "./prompt";
import { admitUnansweredCareerForms, CAREER_FORM_UNANSWERED_GRACE_SECONDS, readUnansweredForms } from "./unansweredForm";

const form = (formId: number, revision: number, items: unknown[], title = "Company A · Backend Engineer") => ({
  formId, revision, kind: "form", title, presentationDeferred: true, relatedRefs: [{ type: "role", id: "role-a" }], items,
});
const salary = { id: "salary", label: "What is your expected annual salary?", type: "text", content: { value: "" }, required: true };
const start = { id: "start", label: "When could you start?", type: "text", content: { value: "Next month" } };
const visa = { id: "visa", label: "Do you need visa sponsorship?", type: "select", content: { options: [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }] } };
const run = (id: string, unansweredForms: unknown[]) => ({
  id, talent_id: "talent-a", conversation_id: "conversation-a", status: "handed_off",
  trigger: "career_form_unanswered", created_at: "2026-11-27T03:00:00Z",
  trigger_payload: {
    runContract: "career_agent_v1", cadencePolicy: { affectsBaseCadence: false }, unansweredForms, chatSeenAt: "2026-11-27T02:20:00Z",
    agentInvocation: { replyId: `background:${id}`, sourceMessageCursor: 7, acceptedAt: "2026-11-27T03:00:00Z" },
  },
});

test("the background event gives the agent each waiting form as saved and leaves the email to it", () => {
  const rendered = renderCareerBackgroundInvocation(run("run-a", [
    { formId: 10, revision: 1, messageId: 10, createdAt: "2026-11-27T02:00:00Z", form: form(10, 1, [salary, start]) },
    { formId: 12, revision: 2, messageId: 15, createdAt: "2026-11-27T02:10:00Z", form: form(12, 2, [visa], "Company B · Data Engineer") },
  ]));
  assert.ok(rendered.startsWith(CAREER_BACKGROUND_INSTRUCTION));
  assert.match(rendered, /Background event: career_form_unanswered; observed /);
  assert.ok(rendered.includes(`Career link: ${getConfiguredPublicSiteUrl()}/career`));
  for (const text of ["Form 10, revision 1 (form)", "Company A · Backend Engineer", salary.label, start.label, "value: Next month",
    "Form 12, revision 2 (form)", "Company B · Data Engineer", visa.label, "References: role role-a"])
    assert.ok(rendered.includes(text), text);
  assert.ok(rendered.includes(`last viewed ${formatLlmDateTime("2026-11-27T02:20:00Z")}`));
  assert.ok(rendered.includes(`Waiting since ${formatLlmDateTime("2026-11-27T02:00:00Z")}.`));
  assert.match(rendered, /saw these application forms in their Career chat/);
  assert.match(rendered, /whether it is worth an email is your decision/);
  assert.match(rendered, /each question they still need to answer exactly as the form words it/);
  assert.match(rendered, /replying to this email or in Career through the link/);
  assert.match(rendered, /nothing is submitted before they do/);
  assert.match(rendered, /another chat message would repeat them/);
  assert.match(rendered, /not a user message, consent, or a request for new work/);
  assert.doesNotMatch(rendered, /Pending daily updates|Delegated work/, "a notice run carries no discovery or delegated work");

  const single = renderCareerBackgroundInvocation(run("run-b", [{ formId: 10, revision: 1, form: form(10, 1, [salary]) }]));
  assert.match(single, /saw this application form in their Career chat/);
  assert.doesNotMatch(single, /Waiting since/);
});

test("only listed forms whose saved snapshot is that exact revision are read back", () => {
  const listed = readUnansweredForms(run("run-c", [
    { formId: 10, revision: 1, createdAt: "2026-11-27T02:00:00Z", form: form(10, 1, [salary]) },
    { formId: 11, revision: 1, form: form(12, 1, [salary]) },
    { formId: 13, revision: 2, form: form(13, 1, [salary]) },
    { formId: 14, revision: 1, form: { formId: 14, revision: 1, title: "No questions" } },
    null,
  ]));
  assert.deepEqual(listed.map(item => [item.formId, item.revision, item.createdAt]), [[10, 1, "2026-11-27T02:00:00Z"]]);
  assert.deepEqual(readUnansweredForms({ trigger_payload: {} }), []);
  assert.deepEqual(readUnansweredForms({ trigger_payload: null }), []);
});

test("the scan asks for forms left 30 minutes within the last day and hands each run to the agent queue", async () => {
  assert.equal(CAREER_FORM_UNANSWERED_GRACE_SECONDS, 30 * 60);
  const calls: unknown[] = [];
  const admin = { rpc: async (name: string, args: unknown) => {
    calls.push([name, args]);
    return { data: [run("run-d", []), run("run-e", [])], error: null };
  } } as any;
  const published: unknown[] = [];
  const result = await admitUnansweredCareerForms(admin, async job => {
    published.push(job);
    if (job.backgroundRunId === "run-e") throw new Error("queue unavailable");
  });
  assert.deepEqual(calls, [["admit_career_unanswered_forms_v1", { p_grace_seconds: 30 * 60, p_window_seconds: 24 * 60 * 60, p_limit: 20 }]]);
  assert.deepEqual(published, ["run-d", "run-e"].map(id => ({ userId: "talent-a", conversationId: "conversation-a", backgroundRunId: id, replyId: `background:${id}` })));
  assert.deepEqual(result, { admitted: 2, deferred: 1 }, "a failed handoff stays durable for background recovery");
  await assert.rejects(admitUnansweredCareerForms({ rpc: async () => ({ data: null, error: new Error("scan failed") }) } as any, async () => {}), /scan failed/);
});

test("the career-agent maintenance scan runs the unanswered-form scan, and its failure never fails the other scans", async () => {
  const calls: string[] = [];
  let failForms = false;
  const scan = (name: string) => async () => { calls.push(name); return {}; };
  const module = Module as any, load = module._load;
  const stubs: Record<string, unknown> = {
    "@/lib/talentOnboarding/admin": { getTalentSupabaseAdmin: () => ({}) },
    "@/lib/career/background/server": { recoverCareerBackgroundRuns: scan("background") },
    "@/lib/career/background/delivery": { recoverCareerEmailDeliveries: scan("deliveries") },
    "@/lib/career/schedules/server": { collectDueCareerWork: scan("work") },
    "@/lib/career/agentContinuation": {},
    "@/lib/career/matching/externalSearch": { recoverCareerMatchingSearches: scan("matching") },
    "@/lib/career/matching/internalScoring/backend": { recoverInternalEvaluations: scan("internalMatching") },
    "@/lib/career/resources/queue": { recoverResourceOperations: scan("resources") },
    "@/lib/career/background/unseenReply": { admitUnseenCareerReplies: scan("unseenReplies") },
    "@/lib/career/background/unansweredForm": { admitUnansweredCareerForms: async () => {
      calls.push("unansweredForms");
      if (failForms) throw new Error("scan failed");
      return { admitted: 1, deferred: 0 };
    } },
    "@/lib/career/background/gmailReview": { startPendingGmailReviews: scan("gmailReviews") },
  };
  module._load = function (name: string, ...args: unknown[]) {
    return stubs[name] ?? load.call(this, name, ...args);
  };
  let POST: typeof import("../../../app/api/internal/career-agent/route").POST;
  try { ({ POST } = await import("../../../app/api/internal/career-agent/route")); } finally { module._load = load; }
  const previous = process.env.INTERNAL_WORKER_API_SECRET;
  process.env.INTERNAL_WORKER_API_SECRET = "fixture-secret";
  const collect = () => POST(new NextRequest("http://localhost/api/internal/career-agent", {
    method: "POST", headers: { authorization: "Bearer fixture-secret" }, body: JSON.stringify({ action: "collect_due", maxNewRuns: 1 }),
  }));
  try {
    const response = await collect();
    assert.equal(response.status, 200);
    assert.ok(calls.includes("unansweredForms"));
    assert.deepEqual((await response.json()).unansweredForms, { admitted: 1, deferred: 0 });
    failForms = true; calls.length = 0;
    const failed = await collect();
    assert.equal(failed.status, 200);
    assert.deepEqual(calls.sort(), ["background", "deliveries", "gmailReviews", "internalMatching", "matching", "resources", "unansweredForms", "unseenReplies", "work"]);
    assert.deepEqual((await failed.json()).unansweredForms, { admitted: 0, deferred: 0, error: "deferred" });
  } finally {
    if (previous === undefined) delete process.env.INTERNAL_WORKER_API_SECRET;
    else process.env.INTERNAL_WORKER_API_SECRET = previous;
  }
});
