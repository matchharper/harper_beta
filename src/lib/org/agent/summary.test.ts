import assert from "node:assert/strict";
import test from "node:test";
import {
  formatOrgAgentSummarySource,
  MAX_SUMMARY_SOURCE_CHARS,
  RECENT_RAW_MESSAGE_LIMIT,
} from "@/lib/org/agent/summarySource";
import type { OrgAgentMessageRow } from "@/lib/org/agent/store";

function message(id: number): OrgAgentMessageRow {
  return {
    company_user_id: null,
    company_workspace_id: "workspace-1",
    content: `${id}:${"긴 대화 ".repeat(500)}`,
    conversation_id: "conversation-1",
    created_at: `2026-08-31T00:${String(id).padStart(2, "0")}:00.000Z`,
    id,
    mentions: [],
    message_type: "slack",
    metadata: {},
    model: null,
    role: "user",
    role_id: null,
    slack_thread_id: "thread-1",
    slack_user_id: "U1",
    status: "completed",
    thinking_logs: [],
  };
}

test("summary source advances only through messages that fit the character budget", () => {
  const rows = Array.from({ length: 14 }, (_, index) => message(index + 1));
  const formatted = formatOrgAgentSummarySource(rows);

  assert.equal(RECENT_RAW_MESSAGE_LIMIT, 24);
  assert.ok(formatted.includedRows.length > 0);
  assert.ok(formatted.includedRows.length < rows.length);
  assert.ok(formatted.source.length <= MAX_SUMMARY_SOURCE_CHARS);
  assert.equal(
    formatted.includedRows.at(-1)?.id,
    formatted.includedRows.length
  );
  assert.notEqual(formatted.includedRows.at(-1)?.id, rows.at(-1)?.id);
});
