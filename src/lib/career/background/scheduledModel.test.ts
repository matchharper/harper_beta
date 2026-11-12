import assert from "node:assert/strict";
import test from "node:test";
import { CLAUDE_HAIKU_MODEL, GPT_6_LUNA_MODEL } from "@/lib/llm/modelConfig";
import { getScheduledCareerModelOptions, isScheduledCareerRun } from "./scheduledModel";

test("scheduled Career uses Haiku with provider-default effort and preserves the model override", () => {
  assert.deepEqual(getScheduledCareerModelOptions("  "), {
    assistantModel: CLAUDE_HAIKU_MODEL,
    assistantAnthropicEffort: null,
    assistantOpenAIResponsesReasoningEffort: "high",
  });
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
