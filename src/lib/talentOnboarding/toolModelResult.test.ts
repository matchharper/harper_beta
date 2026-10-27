import assert from "node:assert/strict";
import test from "node:test";
import { withCompactTalentToolModelResult } from "./toolModelResult";
function project(name: string, raw: Record<string, unknown>) {
  const result = withCompactTalentToolModelResult(name, raw) as Record<string, unknown>;
  for (const key of Object.keys(raw)) assert.equal(result[key], raw[key]);
  const model = result.modelOutput as string;
  if (raw.assistantInstruction) assert.ok(model.includes(String(raw.assistantInstruction)));
  return model;
}
test("settings keeps saved values and marks bounded history", () => {
  const raw = { ok: true, assistantInstruction: "unchanged", settings: {profileVisibility: "dont_share"}, remainingInternalRoles: Array.from({length: 100}, (_, i) => ({id: String(i), title: "Role", href: "url"})), internalRoleHistoryLimit: 100, updatedSettingFields: [], impactLevel: "high" };
  const model = project("update_setting", raw);
  assert.match(model, /참조 ID: 4/);
  assert.doesNotMatch(model, /참조 ID: 5/);
  assert.match(model, /internalRoleHistoryTruncated: 예/);
  assert.match(model, /profileVisibility: dont_share/);
  for (const key of ["impactLevel", "internalRoleHistoryLimit", "updatedSettingFields"]) assert.ok(!model.includes(key));
  assert.match(project("update_setting", {remainingInternalRoles: null, internalRoleHistoryAvailable: false}), /internalRoleHistoryAvailable: 아니요/);
});
test("async search keeps acceptance facts and one active request; instant is unchanged", () => {
  const active = {id: "internal", purposeText: "Earlier request", status: "running", maxResults: 10};
  const model = project("recommend_job_postings", {ok: true, accepted: false, currentRequestApplied: false, lifecycleEffect: {}, statusRunId: "internal", statusRun: active, blockingRun: active, requestedRequest: {}});
  assert.match(model, /currentRequestApplied: 아니요/);
  assert.match(model, /purposeText: Earlier request/);
  for (const key of ["lifecycleEffect", "statusRun", "blockingRun", "requestedRequest", "statusRunId"]) assert.ok(!model.includes(key));
  const instant = {ok: true, searchPlan: {query: "engineer"}};
  assert.equal(withCompactTalentToolModelResult("recommend_job_postings", instant), instant);
});
test("coaching keeps concurrency references on success and conflict", () => {
  const activity = {messageId: 15, revision: 4, status: "active", topic: "Interview", agenda: ["Practice"], createdAt: "internal"};
  const model = project("manage_career_coaching_activity", {ok: true, activityMessage: {payload: {}, coachingActivity: activity}, uiAction: {activity}});
  assert.match(model, /messageId: 15/);
  assert.match(model, /revision: 4/);
  assert.ok(!model.includes("activityMessage"));
  assert.ok(!model.includes("uiAction"));
  const conflict = project("manage_career_coaching_activity", {ok: false, status: "conflict", currentActivity: activity});
  assert.equal(conflict.slice(conflict.indexOf("currentActivity:")), model.slice(model.indexOf("currentActivity:")));
});
test("reads retain source content without duplicate summaries and cache fields", () => {
  const events = [{summary: "Changed setting"}];
  const eventText = project("read_talent_activity_events", {events, summaries: ["Changed setting"]});
  assert.equal(eventText.split("Changed setting").length, 2);
  const model = project("open_url", {ok: true, title: "Page", url: "https://example.com", markdown: "Full text", truncated: true, excerpt: "Full", cached: true, createdAt: "time", documentId: "cache-id"});
  assert.match(model, /markdown: Full text/);
  assert.match(model, /truncated: 예/);
  for (const key of ["excerpt", "cached", "createdAt", "documentId"]) assert.ok(!model.includes(key));
});
