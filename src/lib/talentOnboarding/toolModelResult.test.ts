import assert from "node:assert/strict";
import test from "node:test";
import { withCompactTalentToolModelResult } from "./toolModelResult";
function project(name: string, raw: Record<string, unknown>) {
  const result = withCompactTalentToolModelResult(name, raw) as Record<string, unknown>;
  for (const key of Object.keys(raw)) assert.equal(result[key], raw[key]);
  const model = JSON.parse(result.modelOutput as string);
  assert.equal(model.assistantInstruction, raw.assistantInstruction);
  return model;
}
test("settings keeps saved values and marks bounded history", () => {
  const raw = { ok: true, assistantInstruction: "unchanged", settings: {profileVisibility: "dont_share"}, remainingInternalRoles: Array.from({length: 100}, (_, i) => ({id: String(i), title: "Role", href: "url"})), internalRoleHistoryLimit: 100, updatedSettingFields: [], impactLevel: "high" };
  const model = project("update_setting", raw);
  assert.equal(model.remainingInternalRoles.length, 5);
  assert.equal(model.internalRoleHistoryTruncated, true);
  assert.deepEqual(model.settings, raw.settings);
  for (const key of ["impactLevel", "internalRoleHistoryLimit", "updatedSettingFields"]) assert.ok(!(key in model));
  assert.equal(project("update_setting", {remainingInternalRoles: null, internalRoleHistoryAvailable: false}).internalRoleHistoryAvailable, false);
});
test("async search keeps acceptance facts and one active request; instant is unchanged", () => {
  const active = {id: "internal", purposeText: "Earlier request", status: "running", maxResults: 10};
  const model = project("recommend_job_postings", {ok: true, accepted: false, currentRequestApplied: false, lifecycleEffect: {}, statusRunId: "internal", statusRun: active, blockingRun: active, requestedRequest: {}});
  assert.equal(model.currentRequestApplied, false);
  assert.equal(model.activeRequest.purposeText, "Earlier request");
  for (const key of ["lifecycleEffect", "statusRun", "blockingRun", "requestedRequest", "statusRunId"]) assert.ok(!(key in model));
  const instant = {ok: true, searchPlan: {query: "engineer"}};
  assert.equal(withCompactTalentToolModelResult("recommend_job_postings", instant), instant);
});
test("coaching keeps concurrency references on success and conflict", () => {
  const activity = {messageId: 15, revision: 4, status: "active", topic: "Interview", agenda: ["Practice"], createdAt: "internal"};
  const model = project("manage_career_coaching_activity", {ok: true, activityMessage: {payload: {}, coachingActivity: activity}, uiAction: {activity}});
  assert.equal(model.currentActivity.messageId, 15);
  assert.equal(model.currentActivity.revision, 4);
  assert.ok(!("activityMessage" in model));
  assert.ok(!("uiAction" in model));
  assert.deepEqual(project("manage_career_coaching_activity", {ok: false, status: "conflict", currentActivity: activity}).currentActivity, model.currentActivity);
});
test("reads retain source content without duplicate summaries and cache fields", () => {
  const events = [{summary: "Changed setting"}];
  assert.deepEqual(project("read_talent_activity_events", {events, summaries: ["Changed setting"]}), {events});
  const model = project("open_url", {ok: true, title: "Page", url: "https://example.com", markdown: "Full text", truncated: true, excerpt: "Full", cached: true, createdAt: "time", documentId: "cache-id"});
  assert.equal(model.markdown, "Full text");
  assert.equal(model.truncated, true);
  for (const key of ["excerpt", "cached", "createdAt", "documentId"]) assert.ok(!(key in model));
});
