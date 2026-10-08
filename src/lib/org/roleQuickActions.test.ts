import assert from "node:assert/strict";
import test from "node:test";
import { en } from "@/i18n/org/en";
import { ko } from "@/i18n/org/ko";
import {
  getOrgRoleQuickAction,
  ORG_ROLE_CHAT_QUICK_ACTIONS,
  ORG_ROLE_QUICK_ACTION_IDLE_MS,
  ORG_ROLE_QUICK_ACTIONS,
  ORG_ROLE_RUN_SEARCH_ACTION,
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
      label: "Ready to connect",
      message: "지금 결정이 필요한 연결 대기 목록을 알려줘",
    },
  ]);
  assert.equal(
    getOrgRoleQuickAction("pipeline_summary")?.label,
    "Pipeline summary"
  );
  assert.equal(getOrgRoleQuickAction("unknown"), null);
});

test("role chat quick actions append an immediate current-Brief search", () => {
  assert.deepEqual(ORG_ROLE_RUN_SEARCH_ACTION, {
    id: "run_search",
    label: "Run Search",
    message:
      "이 역할에 대해 우리가 먼저 Intro를 요청해볼 만한 후보자를 찾아줘.",
  });
  assert.deepEqual(ORG_ROLE_CHAT_QUICK_ACTIONS, [
    ...ORG_ROLE_QUICK_ACTIONS,
    ORG_ROLE_RUN_SEARCH_ACTION,
  ]);
  assert.equal(getOrgRoleQuickAction("run_search"), null);
});

test("web quick actions use locale-specific prompts while Slack keeps its existing messages", () => {
  assert.equal(
    ko["agent.quickAction.pendingIntrosMessage"],
    getOrgRoleQuickAction("pending_intros")?.message
  );
  assert.equal(en["agent.quickAction.pendingIntros"], "Ready to connect");
  assert.equal(
    en["agent.quickAction.pendingIntrosMessage"],
    "Show candidates in Ready to connect who need our decision."
  );
  assert.equal(
    en["agent.quickAction.pipelineSummaryMessage"],
    "Summarize the current candidate pipeline for this role."
  );
  assert.equal(
    ko["agent.quickAction.runSearchMessage"],
    ORG_ROLE_RUN_SEARCH_ACTION.message
  );
  assert.equal(
    en["agent.quickAction.runSearchMessage"],
    "Find candidates we might want to send an intro request."
  );
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
