import assert from "node:assert/strict";
import test from "node:test";
import { WorkspaceBillingError } from "../billing/types";
import {
  readBillingActionNotice,
  billingActionNoticeSlack,
} from "../billing/notice";
import { buildAssistantMetadata, runOrgAgentToolLoop } from "./chat";
import { formatOrgAgentConversation } from "./context";
import { ORG_AGENT_GEMINI_FLASH_MODEL } from "./modelConfig";
import { formatOrgAgentSummarySource } from "./summarySource";
import { serializeOrgAgentToolResult } from "./promptFormat";
import { toOrgAgentMessage, type OrgAgentMessageRow } from "./store";

function fixture(): Parameters<typeof runOrgAgentToolLoop>[0] {
  return {
    actorId: "actor",
    actorLabel: "팀원",
    currentUserMessageId: 1,
    admin: new Proxy(
      {},
      {
        get() {
          throw Error("Unexpected DB access");
        },
      }
    ),
    conversation: {
      id: "conversation",
      role_id: null,
      company_workspace_id: "workspace",
    },
    context: {
      workspace: { workspaceId: "workspace" },
      roles: [],
      companyText: "합성 회사",
      rolesText: "-",
      conversationText: "-",
      conversationMessages: [],
      summariesText: "-",
      recentContactsText: "-",
      recentRecommendationsText: "-",
      contextNotesText: "-",
      completeRoleRequestIds: [],
      defaultLongTextObservations: [],
      inProgressRoleCreationsText: "-",
      pendingUpdateText: "-",
      recentToolContextText: "-",
    },
    mentions: [],
    model: ORG_AGENT_GEMINI_FLASH_MODEL,
    readAudience: "company_safe",
    scopeKey: "billing-notice-test",
    source: "chat",
    slackThreadId: null,
    user: { id: "actor" },
    userMessage: "요청을 진행해 주세요.",
  } as unknown as Parameters<typeof runOrgAgentToolLoop>[0];
}

// The loop boundary is tool-independent; the real-model frozen cases separately
// exercise Intro and connection tools with the same server-authored error.
async function run(error: Error | null, calls = 1) {
  const completions: unknown[] = [];
  let step = 0;
  const result = await runOrgAgentToolLoop(fixture(), {
    complete: async (args) => {
      completions.push(structuredClone(args.messages));
      return {
        model: args.model,
        response: {
          choices: [
            {
              message:
                step++ === 0
                  ? {
                      content: "",
                      tool_calls: Array.from({ length: calls }, (_, i) => ({
                        id: `action-${i}`,
                        type: "function",
                        function: { name: "get_talents", arguments: "{}" },
                      })),
                    }
                  : {
                      content: error
                        ? "요청을 완료하지 못했어요."
                        : "확인했어요.",
                    },
            },
          ],
        },
      };
    },
    executeTool: async () => {
      if (error) throw error;
      return { items: [] };
    },
  });
  return { result, completions, metadata: buildAssistantMetadata(result) };
}

test("credit failures produce one display notice, never billing facts in the completion/tool result", async () => {
  const { result, completions, metadata } = await run(
    new WorkspaceBillingError("credits_exhausted"),
    2
  );
  assert.deepEqual(metadata.billingNotice, { code: "credits_exhausted" });
  assert.equal(result.state.toolResults.length, 2);
  assert.ok(
    result.state.toolResults.every(
      (r) => r.status === "error" && r.summary === "도구 실행 실패"
    )
  );
  const input = JSON.stringify(completions);
  assert.match(input, /The tool could not be completed/);
  assert.doesNotMatch(input, /credits_exhausted|billingNotice|크레딧/);
  assert.doesNotMatch(result.reply, /credits_exhausted|크레딧/);
  assert.equal(
    billingActionNoticeSlack(readBillingActionNotice(metadata)!, "en").blocks
      .length,
    1
  );
});

test("successful requests and unrelated failures never create a credit notice", async () => {
  for (const error of [
    null,
    new Error("Network failed"),
    new WorkspaceBillingError("billing_unavailable"),
  ]) {
    assert.equal((await run(error)).metadata.billingNotice, undefined);
  }
});

test("stored notice survives web rendering but is absent from future conversation and summary inputs", async () => {
  const { result, metadata } = await run(
    new WorkspaceBillingError("credits_exhausted")
  );
  const row = {
    id: 2,
    role: "assistant",
    content: result.reply,
    metadata,
    mentions: [],
    created_at: "2026-10-07T00:00:00Z",
    message_type: "chat",
    status: "completed",
    company_user_id: null,
    company_workspace_id: "workspace",
    conversation_id: "conversation",
    model: null,
    role_id: null,
    thinking_logs: [],
  } as unknown as OrgAgentMessageRow;
  const visible = toOrgAgentMessage(row);
  assert.deepEqual(readBillingActionNotice(visible.metadata), {
    code: "credits_exhausted",
  });
  const input = formatOrgAgentConversation(
    {
      messages: [{ ...visible, slackThreadId: null, slackUserId: null }],
      hasMore: false,
      nextCursor: null,
    },
    null
  );
  assert.equal(input.conversationMessages[0].content, result.reply);
  assert.doesNotMatch(
    JSON.stringify(input),
    /billingNotice|credits_exhausted|크레딧/
  );
  assert.equal(
    formatOrgAgentSummarySource([row]).source,
    `[2] assistant: ${result.reply}`
  );
  const history = serializeOrgAgentToolResult("read_conversation_history", {
    type: "thread",
    threads: [{ threadId: "thread", messages: [visible] }],
  });
  assert.match(history, /요청을 완료하지 못했어요/);
  assert.doesNotMatch(history, /billingNotice|credits_exhausted|크레딧/);
});
