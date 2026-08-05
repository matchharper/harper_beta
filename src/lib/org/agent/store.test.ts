import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeOrgAgentMessageMetadata,
  resolveAdoptableSlackUserMessageIdentity,
} from "@/lib/org/agent/messageIdempotency";
import { isOrgAgentRetainedDataActivationActive } from "@/lib/org/agent/retention";

const activatedAt = "2026-08-05T00:00:00.000Z";

test("retained get_more_data lease is active for T1 through T3", () => {
  for (const startedUserTurns of [1, 2, 3]) {
    assert.equal(
      isOrgAgentRetainedDataActivationActive({
        activatedAt,
        now: new Date("2026-08-05T01:00:00.000Z"),
        startedUserTurns,
      }),
      true
    );
  }
  assert.equal(
    isOrgAgentRetainedDataActivationActive({
      activatedAt,
      now: new Date("2026-08-05T01:00:00.000Z"),
      startedUserTurns: 4,
    }),
    false
  );
});

test("retained get_more_data lease expires after 24 hours", () => {
  assert.equal(
    isOrgAgentRetainedDataActivationActive({
      activatedAt,
      now: new Date("2026-08-06T00:00:00.001Z"),
      startedUserTurns: 1,
    }),
    false
  );
});

test("only a duplicate Slack user message receives an adoptable exact identity", () => {
  const common = {
    content: "채용 기준을 바꿔 주세요",
    conversationId: "conversation-1",
    errorCode: "23505",
    messageType: "slack",
    role: "user",
    slackMessageTs: "1722816060.100",
    slackThreadId: "thread-1",
    workspaceId: "workspace-1",
  };

  assert.deepEqual(resolveAdoptableSlackUserMessageIdentity(common), {
    content: common.content,
    conversationId: common.conversationId,
    messageType: "slack",
    role: "user",
    slackMessageTs: common.slackMessageTs,
    slackThreadId: common.slackThreadId,
    workspaceId: common.workspaceId,
  });
  assert.equal(
    resolveAdoptableSlackUserMessageIdentity({
      ...common,
      role: "assistant",
    }),
    null
  );
  assert.equal(
    resolveAdoptableSlackUserMessageIdentity({
      ...common,
      errorCode: "other",
    }),
    null
  );
  assert.equal(
    resolveAdoptableSlackUserMessageIdentity({
      ...common,
      slackMessageTs: "",
    }),
    null
  );
});

test("adopted Slack metadata is enriched without discarding sync metadata", () => {
  const merged = mergeOrgAgentMessageMetadata(
    { retained: "yes", source: "slack_thread_event" },
    { slackUserName: "김호진", source: "org_agent_slack_user" }
  );

  assert.equal(merged.changed, true);
  assert.deepEqual(merged.metadata, {
    retained: "yes",
    slackUserName: "김호진",
    source: "org_agent_slack_user",
  });
  assert.equal(
    mergeOrgAgentMessageMetadata(merged.metadata, {}).changed,
    false
  );
});
