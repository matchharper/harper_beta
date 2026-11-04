import assert from "node:assert/strict";
import test from "node:test";
import {
  formatTalentConversationReferencesForLlm,
  formatTalentMessageContentForLlmPrompt,
} from "./opportunityFeedbackNote";
import { buildCareerConversationPromptPlan } from "./prompts/conversationPlan";
import { CareerCapabilityRuntime } from "./capabilities/runtime";

test("provider receives displayed forms as reference context, actual prose and user replies as conversation", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  const form = {
    formId: 455327,
    revision: 1,
    kind: "form",
    title: "지원 최종 확인",
    items: [
      {
        id: "answer",
        type: "text",
        label: "지원 답변",
        content: { value: "검토할 초안" },
      },
    ],
    positive: { id: "submit", label: "지원", message: "이 내용으로 지원해줘." },
  };
  const rows = [
    {
      role: "assistant" as const,
      message_type: "chat",
      content: "준비한 내용을 확인해 주세요.",
    },
    {
      role: "assistant" as const,
      message_type: "career_form",
      content: "",
      payload: { ...form, presentationDeferred: true },
    },
    {
      role: "assistant" as const,
      message_type: "career_form_presentation",
      content: "",
      payload: form,
    },
    {
      role: "assistant" as const,
      message_type: "browser_session",
      content: "",
      payload: { session_id: "browser-1" },
    },
    {
      role: "assistant" as const,
      message_type: "career_form",
      content: "",
      payload: { ...form, title: "Hidden form sentinel", hidden: true },
    },
    {
      role: "user" as const,
      message_type: "career_form_response",
      content: "이 내용으로 지원해줘.",
      payload: {
        formId: form.formId,
        revision: form.revision,
        requestId: "reply-1",
        actionId: "submit",
        values: { answer: "제가 수정한 답변" },
        formSnapshot: form,
      },
    },
  ];
  const messages = rows
    .map((row) => ({
      role: row.role,
      content: formatTalentMessageContentForLlmPrompt(row),
    }))
    .filter((message) => message.content.trim());
  assert.equal(messages.length, 2);
  assert.match(messages[1].content, /제가 수정한 답변/);
  const promptArgs = {
    channel: "chat" as const,
    isOnboardingDone: true,
    profile: null,
    structuredProfileText: "",
    talentContextSection: "",
    runtimeInstruction: formatTalentConversationReferencesForLlm(rows),
  };
  assert.equal(
    promptArgs.runtimeInstruction.split("Form 455327").length - 1,
    1
  );
  try {
    const { runCareerChatAssistant } = await import("./llm");
    for (const progressive of [false, true]) {
      let requests = 0;
      globalThis.fetch = async (url, init) => {
        assert.ok(String(url).startsWith("https://api.openai.com/"));
        const body = JSON.parse(String(init?.body));
        const input = body.input as {
          role: string;
          content: string | { text: string }[];
        }[];
        const text = (item: (typeof input)[number]) =>
          typeof item.content === "string"
            ? item.content
            : item.content.map((part) => part.text).join("\n");
        const assistant = input
          .filter((item) => item.role === "assistant")
          .map(text);
        assert.deepEqual(assistant, ["준비한 내용을 확인해 주세요."]);
        const system = input
          .filter((item) => ["system", "developer"].includes(item.role))
          .map(text)
          .join("\n");
        assert.match(system, /Interface items shown in this conversation/);
        assert.match(system, /Form 455327, revision 1/);
        assert.match(system, /검토할 초안/);
        assert.match(system, /Browser session: browser-1/);
        assert.doesNotMatch(
          system,
          /Saved form|presented with suggest_form|Hidden form sentinel/
        );
        assert.match(
          input
            .filter((item) => item.role === "user")
            .map(text)
            .join("\n"),
          /이 내용으로 지원해줘\./
        );
        requests++;
        return Response.json({
          id: "reference-test",
          model: "gpt-6.1-sol",
          status: "completed",
          output: [
            {
              type: "message",
              role: "assistant",
              content: [{ type: "output_text", text: "확인했습니다." }],
            },
          ],
          usage: { input_tokens: 1, output_tokens: 1 },
        });
      };
      const runtime = progressive
        ? new CareerCapabilityRuntime({
            mode: "progressive",
            eligibleTools: [],
            promptArgs: () => promptArgs,
          })
        : undefined;
      const step = runtime?.resolveStep(false);
      assert.equal(
        await runCareerChatAssistant({
          primaryModel: "gpt-6.1-sol",
          messages,
          tools: step?.tools ?? [],
          toolRuntime: runtime,
          systemBlocks:
            step?.systemBlocks ??
            buildCareerConversationPromptPlan(promptArgs).promptBlocks,
          executeTool: async () => {
            throw new Error("No execution expected");
          },
        }),
        "확인했습니다."
      );
      assert.equal(requests, 1);
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});
