import assert from "node:assert/strict";
import test from "node:test";
import { CareerCapabilityRuntime } from "../capabilities/runtime";
import { isScheduledCareerRun } from "./scheduledModel";
import { formatCareerMatchingResult } from "../matching/formatters";
import { renderCareerBackgroundInvocation } from "./prompt";

const prompt = { channel: "chat" as const, isOnboardingDone: true, profile: null, structuredProfileText: "Candidate", talentContextSection: "Brief" };
const tools = ["deliver_career_email", "get_role_context"].map(name => ({ type: "function" as const, function: { name, description: name, parameters: {} } }));
const runtime = (scheduledWork = true) => new CareerCapabilityRuntime({ mode: "progressive", eligibleTools: tools, preloads: ["career_delivery", "opportunities"],
  promptArgs: () => ({ ...prompt, backgroundInvocation: true, scheduledWork }) });

test("daily work, check-in, once and recurring reservations use career_main with email instructions", () => {
  for (const [trigger, sourceKind] of [["career_daily_due", "daily"], ["career_schedule_due", "career_check_in"], ["career_schedule_due", "once"], ["career_source_reconciled", "schedule"]]) {
    const scheduled = isScheduledCareerRun({ trigger, trigger_payload: { sourceEvents: [{ sourceKind }] } });
    assert.equal(scheduled, true);
    const blocks = runtime(scheduled).resolveStep(false).systemBlocks;
    assert.ok(blocks.some(b => b.key === "career_main"));
    assert.ok(blocks.some(b => b.key === "scheduled_work"));
    assert.ok(!blocks.some(b => ["chat_core", "background_execution", "career_chat_display", "autonomous_career_work"].includes(b.key)));
  }
  const ordinary = runtime(false).resolveStep(false).systemBlocks;
  assert.ok(!ordinary.some(b => b.key === "scheduled_work" || b.key === "career_main"));
});
test("talent-first event projection supplies Harper origin without attributing the proposal to the company", () => {
  const rendered = renderCareerBackgroundInvocation({ id: "run", talent_id: "owner", conversation_id: "conversation", status: "handed_off", trigger: "career_daily_due", created_at: "2026-11-12T00:00:00Z", trigger_payload: {
    sourceEvents: [{ sourceKind: "talent_selection", sourceId: "selection", roleIds: ["selected-role"], summary: "The company-side agent selected this Role for a talent-first proposal." }],
  } });
  assert.match(rendered, /Harper-origin recommendation/);
  assert.match(rendered, /selected-role/);
  assert.doesNotMatch(rendered, /company-side agent/);
});
test("role facts load only the relevant writing guides, and do not leak into ordinary background work", async () => {
  for (const scheduled of [true, false]) {
    const rt = runtime(scheduled);
    assert.ok(!rt.resolveStep(false).handbooks.some(b => b.id.endsWith("recommendation_writing")));
    await rt.recordResult("get_role_context", { roles: [{ role: { sourceType: "internal" } }] }, rt.resolveStep(false));
    assert.equal(rt.resolveStep(false).handbooks.some(b => b.id === "internal_recommendation_writing"), scheduled);
    assert.ok(!rt.resolveStep(false).handbooks.some(b => b.id === "external_recommendation_writing"));
    await rt.recordResult("read_recommended_opportunities", { opportunities: [{ sourceType: "external" }] }, rt.resolveStep(false));
    assert.equal(rt.resolveStep(false).handbooks.some(b => b.id === "external_recommendation_writing"), scheduled);
  }
});
test("only confirmed email delivery ends scheduled work", () => {
  const rt = runtime();
  for (const status of ["queued", "retry", "failed", "context_changed", "delivery_unknown", "cancelled"]) {
    assert.equal(rt.shouldFinishAfterTool("deliver_career_email", { action: "deliver" }, { status }), false);
  }
  assert.equal(rt.shouldFinishAfterTool("deliver_career_email", {}, { status: "sent" }), true);
  assert.equal(rt.shouldFinishAfterTool("deliver_career_email", { action: "retry" }, { status: "sent" }), true);
  assert.equal(rt.shouldFinishAfterTool("deliver_career_email", { action: "read" }, { status: "sent" }), false);
  assert.equal(rt.shouldFinishAfterTool("contact_user", { channel: "email" }, { status: "sent" }), true);
  assert.equal(rt.shouldFinishAfterTool("contact_user", { channel: "chat" }, { status: "sent" }), false);
  assert.equal(runtime(false).shouldFinishAfterTool("deliver_career_email", {}, { status: "sent" }), false);
});
test("scheduled matching projection exposes role IDs without recommendation IDs or fabricated URLs", () => {
  const value = { action: "add", recommendationIds: ["private-rec"], roleIds: ["actual-role"], memberships: [{ recommendation_id: "private-rec", role_id: "actual-role" }], coverage: { recommendations: [{ recommendationId: "private-rec", roleId: "actual-role" }] } };
  const text = formatCareerMatchingResult(value, "ko", { roleIdsOnly: true });
  assert.match(text, /actual-role/);
  assert.doesNotMatch(text, /private-rec|https?:/);
  assert.match(formatCareerMatchingResult(value), /private-rec/);
});

test("publication resolves its saved owned recommendation IDs into role IDs for the model", async () => {
  const { upsertOpportunities } = await import("../matching/store");
  const predicates: unknown[] = [];
  const q: any = { select: () => q, eq: (key: string, value: string) => { predicates.push([key, value]); return q; },
    in: async (key: string, values: string[]) => { assert.deepEqual([key, values], ["id", ["saved-rec"]]); return { data: [{ role_id: "saved-role" }], error: null }; } };
  const admin: any = { from: (name: string) => { assert.equal(name, "talent_opportunity_recommendation"); return q; },
    rpc: async (_: string, input: any) => { assert.equal(input.p_command.returnRoleIds, undefined); return { data: { action: "add", recommendationIds: ["saved-rec"] }, error: null }; } };
  const result = await upsertOpportunities({ admin, userId: "owner", operationId: "operation", action: "add", returnRoleIds: true, items: [{ roleId: "requested-role" }] });
  assert.deepEqual(predicates, [["talent_id", "owner"]]);
  const text = formatCareerMatchingResult(result, "ko", { roleIdsOnly: true });
  assert.match(text, /saved-role/);
  assert.doesNotMatch(text, /saved-rec|requested-role/);
});
