import assert from "node:assert/strict";
import test from "node:test";
import { CareerHandbookRuntime } from "../handbooks/runtime";
import { CAREER_HANDBOOK_LOADER, careerHandbookCatalog, findCareerHandbook, type CareerHandbookLease } from "../handbooks/registry";
import { APPLICATION_HANDBOOK } from "../handbooks/application";
import { CareerCapabilityRuntime, CareerReplyContinuation } from "./runtime";
import { CAREER_CAPABILITIES, CAREER_CAPABILITY_LOADER } from "./registry";
import { buildCareerDecisionCatalog, buildCareerDecisionRequest, parseCareerPreloadSelection, selectCareerPreloads } from "./decisions";

const tools = ["read_talent_context", "read_document", "upsert_document", "web_search", "use_browser", "suggest_form"].map(name => ({
  type: "function" as const, function: { name, description: name, parameters: { type: "object", properties: {} } },
}));
const make = (options: Partial<ConstructorParameters<typeof CareerCapabilityRuntime>[0]> = {}) => new CareerCapabilityRuntime({
  mode: "progressive", eligibleTools: tools, promptArgs: () => ({ channel: "chat", isOnboardingDone: true,
    profile: null, structuredProfileText: "Profile evidence", talentContextSection: "", currentPreferences: { preferredLocale: "ko" } }), ...options,
});

test("Decisions sends readable evidence and one independent choice per eligible bundle/handbook", () => {
  const catalog = buildCareerDecisionCatalog(new Set(tools.map(tool => tool.function.name)));
  const request = buildCareerDecisionRequest(catalog, { messages: [{ role: "user", content: "이 수정본으로 지원해줘.\nForm 81 revision 2" }], currentContext: "Role job:exact; form 81 revision 2" });
  assert.equal(request.model, "gpt-6-luna");
  assert.equal(request.questions.length, catalog.length);
  assert.ok(request.input[1].content[0].text.includes("이 수정본으로 지원해줘.\nForm 81 revision 2"));
  assert.ok(!request.input[1].content[0].text.includes('"role"'));
  assert.ok(!catalog.some(item => item.id === "email_writing"));
  const selected = parseCareerPreloadSelection({ answers: [
    { name: "capability:browser", type: "choice", choice: "load" },
    { name: "handbook:application", type: "choice", choice: "load" },
    { name: "capability:invented", type: "choice", choice: "load" },
    { name: "capability:documents", type: "choice", choice: "load" },
    { name: "capability:documents", type: "choice", choice: "load" },
  ] }, catalog);
  assert.deepEqual(selected.capabilityIds, ["browser"]);
  assert.deepEqual(selected.handbookIds, ["application"]);
  assert.equal(selected.status, "partial");
});

test("handbooks last exactly three delivered replies, not three completions or elapsed time", async () => {
  let remembered: CareerHandbookLease[] = [];
  for (let reply = 0; reply < 3; reply++) {
    const runtime = make({ handbooks: remembered, selection: { capabilityIds: ["documents"], handbookIds: ["resume"], status: "selected", elapsedMs: 0 } });
    assert.equal(runtime.handbooks.snapshot()[0].remainingReplies, 3 - reply);
    const preview = runtime.resolveStep(false);
    assert.equal(runtime.handbooks.injected.size, 0, "prompt inspection is not a model request");
    for (let completion = 0; completion < 5; completion++) await runtime.beforeCompletion(preview, { transport: "chat", messages: [] });
    remembered = runtime.handbooks.afterDeliveredReply();
    assert.equal(remembered[0]?.remainingReplies ?? 0, 2 - reply);
  }
  assert.deepEqual(remembered, []);
  const guide = new CareerHandbookRuntime();
  guide.load(["application"], "manual");
  guide.load(["application"], "manual");
  assert.equal(guide.afterDeliveredReply()[0].remainingReplies, 3, "loading without a later completion does not consume a reply");
});

test("new and carried application leases use the single current source without extending their lifetime", async () => {
  assert.equal(findCareerHandbook("application")?.body, APPLICATION_HANDBOOK);
  assert.equal(findCareerHandbook("unknown"), undefined);
  const catalog = careerHandbookCatalog().filter(book => book.id === "application");
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].version, "current");
  assert.equal(catalog[0].characters, Array.from(APPLICATION_HANDBOOK).length);

  for (const version of ["2026-10-29-v1", "2026-10-30-v9"]) {
    let remembered: CareerHandbookLease[] = [{ id: "application", version, remainingReplies: 2 }];
    for (let reply = 0; reply < 3; reply++) {
      const runtime = make({ handbooks: remembered, selection: { capabilityIds: [], handbookIds: ["application"], status: "selected", elapsedMs: 0 } });
      const step = runtime.resolveStep(false);
      const book = step.systemBlocks.find(block => block.key === "handbook:application");
      assert.equal(book?.text, `## Handbook: application\n${APPLICATION_HANDBOOK}`);
      assert.equal(runtime.handbooks.snapshot()[0].remainingReplies, reply < 2 ? 2 - reply : 3);
      await runtime.beforeCompletion(step, { transport: "chat", messages: [] });
      remembered = runtime.handbooks.afterDeliveredReply();
    }
  }
  const runtime = make({ handbooks: [{ id: "application", version: "2026-10-30-v2", remainingReplies: 1 }] });
  const loaded = runtime.load({ handbook_ids: ["application"] }, runtime.resolveStep(false), CAREER_HANDBOOK_LOADER);
  assert.equal(loaded.ok, true);
  assert.deepEqual(runtime.handbooks.snapshot(), [{ id: "application", version: "current", remainingReplies: 3 }]);
});

test("form review remains callable when the selector only chooses the external executor", () => {
  const runtime = make({ selection: { capabilityIds: ["browser"], handbookIds: ["application"], status: "selected", elapsedMs: 0 } });
  const step = runtime.resolveStep(false);
  assert.ok(step.offeredNames.has("suggest_form"));
  assert.ok(step.offeredNames.has("use_browser"));
  assert.ok(!step.loadableIds.includes("forms"));
  assert.ok(!buildCareerDecisionCatalog(new Set(tools.map(tool => tool.function.name))).some(item => item.name === "capability:forms"));
});

test("handbook loader changes only next completion and keeps its body out of tool results", async () => {
  const runtime = make();
  const first = runtime.resolveStep(false);
  assert.ok(first.offeredNames.has(CAREER_HANDBOOK_LOADER));
  const result = runtime.load({ handbook_ids: ["resume"] }, first, CAREER_HANDBOOK_LOADER);
  assert.equal(result.ok, true);
  assert.ok(!first.systemBlocks.some(block => block.key === "handbook:resume"));
  assert.ok(!result.modelOutput?.includes(findCareerHandbook("resume")!.body));
  const next = runtime.resolveStep(false);
  assert.equal(next.systemBlocks.filter(block => block.text.includes(findCareerHandbook("resume")!.body)).length, 1);
  assert.ok(next.systemBlocks.findIndex(block => block.key === "handbook:resume") > next.systemBlocks.findIndex(block => block.key === "profile_context"));
  assert.equal(runtime.claimCall("upsert_document", first), "tool_not_offered");
  for (let index = 0; index < 20; index++) assert.equal(runtime.claimCall(CAREER_CAPABILITY_LOADER, first), null);
  assert.ok(!CAREER_CAPABILITIES.some(capability => String(capability.id) === "application_support"));
});

test("deadline checkpoints exact prior results without consuming another reply; cancellation propagates", async () => {
  const saved: unknown[] = [];
  const runtime = make({ replyId: "event:exact", deadlineAt: 0, checkpoint: async checkpoint => { saved.push(checkpoint); } });
  const messages = [{ role: "tool", tool_call_id: "sent-once", content: "Email sent; message_id=exact" }];
  await assert.rejects(runtime.beforeCompletion(runtime.resolveStep(false), { transport: "chat", messages }), error => {
    assert.ok(error instanceof CareerReplyContinuation);
    assert.equal(error.checkpoint.replyId, "event:exact");
    assert.deepEqual(error.checkpoint.messages, messages);
    return true;
  });
  assert.equal(saved.length, 1);
  assert.equal(runtime.handbooks.injected.size, 0);
  const aborted = new AbortController(); aborted.abort();
  const cancelled = make({ abortSignal: aborted.signal });
  await assert.rejects(cancelled.beforeCompletion(cancelled.resolveStep(false), { transport: "chat", messages: [] }), { name: "AbortError" });
});

test("Decisions unavailability leaves the main assistant's ordinary loaders usable", async () => {
  const previous = process.env.OPENAI_API_KEY; delete process.env.OPENAI_API_KEY;
  try {
    const selection = await selectCareerPreloads({ eligibleNames: new Set(["read_document"]), input: { messages: [{ role: "user", content: "자료를 읽어줘" }] } });
    assert.equal(selection.status, "unavailable");
    const runtime = make({ selection });
    const step = runtime.resolveStep(false);
    assert.ok(step.offeredNames.has(CAREER_CAPABILITY_LOADER));
    assert.equal(runtime.load({ capabilityIds: ["documents"] }, step).ok, true);
    assert.ok(runtime.resolveStep(false).offeredNames.has("read_document"));
  } finally { if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous; }
});
