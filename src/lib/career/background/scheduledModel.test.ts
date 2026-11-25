import assert from "node:assert/strict";
import test from "node:test";
import { CLAUDE_HAIKU_MODEL, GPT_6_LUNA_MODEL } from "@/lib/llm/modelConfig";
import { getScheduledCareerModelOptions, isScheduledCareerRun } from "./scheduledModel";

test("scheduled Career defaults to Haiku and preserves explicit provider overrides", () => {
  assert.deepEqual(getScheduledCareerModelOptions("  "), {
    assistantModel: CLAUDE_HAIKU_MODEL,
    assistantAnthropicEffort: null,
    assistantOpenAIResponsesReasoningEffort: "high",
  });
  assert.equal(getScheduledCareerModelOptions(undefined).assistantModel, CLAUDE_HAIKU_MODEL);
  assert.equal(getScheduledCareerModelOptions(` ${CLAUDE_HAIKU_MODEL} `).assistantAnthropicEffort, null);
  assert.deepEqual(getScheduledCareerModelOptions(` ${GPT_6_LUNA_MODEL} `), {
    assistantModel: GPT_6_LUNA_MODEL,
    assistantAnthropicEffort: undefined,
    assistantOpenAIResponsesReasoningEffort: "high",
  });
});

test("the scheduled model applies to schedules and daily batches, including reconciled ones", () => {
  const scheduled = (trigger: string, sourceEvents: unknown[] = []) =>
    isScheduledCareerRun({ trigger, trigger_payload: { sourceEvents } });
  assert.equal(scheduled("career_schedule_due"), true);
  assert.equal(scheduled("career_daily_due"), true);
  assert.equal(scheduled("career_source_reconciled", [{ sourceKind: "schedule" }]), true);
  assert.equal(scheduled("career_source_reconciled", [{ dailySourceId: "source" }]), true);
  assert.equal(scheduled("career_source_reconciled", [
    { sourceKind: "schedule" }, { sourceKind: "agent_contact" },
  ]), false);
  assert.equal(scheduled("career_source_reconciled"), false);
  assert.equal(scheduled("career_company_follow_changed"), false);
  assert.equal(scheduled("company_request_followup_due"), false);
  assert.equal(scheduled("conversation_completed"), false);
});

test("scheduled work starts with the opportunity tools; other background work keeps its bundle", async () => {
  const { careerBackgroundPreload, CAREER_BACKGROUND_PRELOAD } = await import("./scheduledModel");
  assert.deepEqual(careerBackgroundPreload({ scheduledWork: false }), CAREER_BACKGROUND_PRELOAD);
  assert.deepEqual(careerBackgroundPreload(undefined), CAREER_BACKGROUND_PRELOAD);
  const scheduled = careerBackgroundPreload({ scheduledWork: true });
  assert.ok(scheduled.capabilityIds.includes("opportunities"));
  assert.ok(scheduled.handbookIds.includes("opportunity_search"));
  for (const id of CAREER_BACKGROUND_PRELOAD.capabilityIds) assert.ok(scheduled.capabilityIds.includes(id));
});

test("discovery runs are the check-in, a reservation on a matching, or changed public resources", async () => {
  const { isCareerDiscoveryRun } = await import("./scheduledModel");
  const run = (sourceEvents: unknown[]) => isCareerDiscoveryRun({ trigger_payload: { sourceEvents } });
  assert.equal(run([{ sourceKind: "schedule", scheduleKey: "career_check_in" }]), true);
  assert.equal(run([{ sourceKind: "schedule", targetRefs: { matchingId: "m-1" } }]), true);
  assert.equal(run([{ sourceKind: "public_discovery" }]), true);
  assert.equal(run([{ sourceKind: "schedule", scheduleKey: null }]), false);
  assert.equal(run([{ dailySourceId: "appointment" }]), false);
  assert.equal(run([]), false);
});
