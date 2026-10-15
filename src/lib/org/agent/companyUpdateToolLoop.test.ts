import assert from "node:assert/strict";
import test from "node:test";
import { runOrgAgentToolLoop } from "./chat";
import { buildCompanyUpdatePrompt } from "./companyUpdate";
import { parseCompanyMessages } from "./companyMessaging";

test("a Slack product event can progressively load messaging and commit multiple thread parts", async () => {
  let completions = 0;
  const audience = { channelDbId: "channel", channelId: "C1", jobId: "job" };
  const result = await runOrgAgentToolLoop({
    admin: {} as any, user: { id: "actor" } as any, actorId: "actor", actorLabel: "Teammate",
    conversation: { id: "conversation", company_workspace_id: "workspace", role_id: null } as any,
    currentUserMessageId: 1, mentions: [], model: "google/gemini-3.8-flash",
    capabilityMode: "progressive", source: "slack", responseLocale: "en", readAudience: "company_safe",
    scopeKey: "slack:thread", slackThreadId: "thread", companyMessageAudience: audience,
    userMessage: buildCompanyUpdatePrompt({ purpose: "Welcome the teammate", facts: {} }),
    context: { roles: [], workspace: { companyName: "Example" }, companyText: "Example", rolesText: "-",
      recentRecommendationsText: "-", recentContactsText: "-", summariesText: "-", conversationText: "-",
      conversationMessages: [], contextNotesText: "-", defaultLongTextObservations: [] } as any,
  }, {
    complete: async args => {
      completions++;
      const names = (args.tools ?? []).map((tool: any) => tool.function.name);
      assert.equal(names.includes("send_company_message"), completions > 1);
      const name = completions === 1 ? "load_capabilities" : "send_company_message";
      return { model: "google/gemini-3.8-flash", response: { choices: [{ message: { role: "assistant", content: null,
        tool_calls: [{ id: `call-${completions}`, type: "function", function: { name, arguments: JSON.stringify(completions === 1
          ? { capabilityIds: ["company_messaging"] }
          : { messages: [{ ref: "intro", text: "Welcome", threadRef: "thread" }, { ref: "topic", text: "Hiring discussion" }, { ref: "detail", text: "Details", replyTo: "topic" }] }) } }] } }] } } as any;
    },
    executeTool: async args => {
      assert.equal(args.name, "send_company_message");
      assert.deepEqual(args.companyMessageAudience, audience);
      const parts = parseCompanyMessages(args.input);
      assert.equal(parts.length, 3);
      args.state.companyMessageBatch = { batchId: "batch", messageIds: [2, 3, 4] };
      return { status: "committed" };
    },
  });
  assert.equal(completions, 2);
  assert.equal(result.reply, "");
  assert.equal(result.state.companyMessageBatch?.batchId, "batch");
});
