import assert from "node:assert/strict";
import test from "node:test";
import {
  getOrgRoleQuickAction,
  ORG_ROLE_QUICK_ACTION_IDLE_MS,
  ORG_ROLE_QUICK_ACTIONS,
  shouldShowOrgRoleQuickActions,
} from "./roleQuickActions";

test("role quick actions keep the exact user-facing prompts", () => {
  assert.deepEqual(ORG_ROLE_QUICK_ACTIONS, [
    {
      id: "pipeline_summary",
      label: "Pipeline summary",
      message: "현재 연결된 후보자 파이프라인을 요약해서 설명해줘",
    },
    {
      id: "pending_intros",
      label: "Pending intros",
      message: "지금 결정이 필요한 연결 대기 목록을 알려줘",
    },
  ]);
  assert.equal(
    getOrgRoleQuickAction("pipeline_summary")?.label,
    "Pipeline summary"
  );
  assert.equal(getOrgRoleQuickAction("unknown"), null);
});

test("role quick actions appear only after one hour without a user message", () => {
  const now = Date.parse("2026-08-27T09:00:00.000Z");
  assert.equal(
    shouldShowOrgRoleQuickActions({ isStreaming: false, now }),
    true
  );
  assert.equal(
    shouldShowOrgRoleQuickActions({
      isStreaming: false,
      latestUserMessageAt: new Date(
        now - ORG_ROLE_QUICK_ACTION_IDLE_MS + 1
      ).toISOString(),
      now,
    }),
    false
  );
  assert.equal(
    shouldShowOrgRoleQuickActions({
      isStreaming: false,
      latestUserMessageAt: new Date(
        now - ORG_ROLE_QUICK_ACTION_IDLE_MS
      ).toISOString(),
      now,
    }),
    true
  );
  assert.equal(
    shouldShowOrgRoleQuickActions({
      isStreaming: true,
      latestUserMessageAt: null,
      now,
    }),
    false
  );
});
