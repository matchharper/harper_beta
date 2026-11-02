import assert from "node:assert/strict";
import test from "node:test";
import {
  careerFormDraftSchema,
  parseCareerForm,
  parseCareerFormResponse,
  type CareerForm,
} from "./schema";
import {
  buildCareerFormResponseMessage,
  formatCareerFormResponseForModel,
} from "./format";
import { extractGmailIntegrationMarker } from "./integrationMarker";
import { toTalentMessageResponse } from "@/lib/talentOnboarding/models";
import { toUiMessage } from "@/hooks/career/careerHelpers";
import { respondToCareerForm } from "./server";
import { formatTalentMessageContentForLlmPrompt, formatTalentMessageReferenceForLlm } from "@/lib/career/opportunityFeedbackNote";

const form: CareerForm = {
  formId: 42,
  revision: 1,
  kind: "form",
  title: "지원 내용",
  items: [
    {
      id: "location",
      type: "text",
      label: "사는 곳",
      content: { value: "부산" },
    },
    { id: "military", type: "text", label: "병역", content: "미기재" },
  ],
  positive: {
    id: "send",
    label: "이 내용으로 지원",
    message: "이 내용으로 지원해줘.",
  },
  negative: {
    id: "change",
    label: "수정할게",
    message: "내용을 수정하고 싶어.",
  },
};

test("form payload survives storage, response serialization and UI mapping", () => {
  const row = {
    id: 42,
    conversation_id: "conversation",
    user_id: "user",
    role: "assistant" as const,
    content: "",
    message_type: "career_form",
    payload: form as never,
    created_at: "2026-10-29T00:00:00Z",
  };
  const ui = toUiMessage(toTalentMessageResponse(row));
  assert.deepEqual(ui.careerForm, form);
  assert.match(
    formatTalentMessageReferenceForLlm(row),
    /Form 42, revision 1/
  );
  assert.equal(formatTalentMessageContentForLlmPrompt(row, { includeCreatedAt: true }), "");
  assert.match(formatTalentMessageReferenceForLlm(row), /미기재/);
  assert.equal(
    formatTalentMessageContentForLlmPrompt({
      ...row,
      payload: { ...form, hidden: true },
    }),
    ""
  );
  assert.equal(parseCareerForm({ ...form, revision: 0 }), undefined);
  assert.equal(
    careerFormDraftSchema.safeParse({
      ...form,
      items: [form.items[0], form.items[0]],
    }).success,
    false
  );
  assert.equal(
    careerFormDraftSchema.safeParse({
      ...form,
      items: [
        {
          ...form.items[0],
          type: "future-renderer",
          content: { arbitrary: "content" },
        },
      ],
    }).success,
    true
  );
});

test("click uses the exact displayed revision and stored action while preserving all edited values", async () => {
  let rpcArguments: Record<string, unknown> | undefined;
  const row = {
    id: 42,
    conversation_id: "11111111-1111-4111-8111-111111111111",
    user_id: "user",
    role: "assistant",
    content: "",
    message_type: "career_form",
    payload: form,
    created_at: "2026-10-29T00:00:00Z",
  };
  const filters: unknown[] = [];
  const builder: any = {
    select() {
      return this;
    },
    eq(...args: unknown[]) {
      filters.push(args);
      return this;
    },
    contains(...args: unknown[]) {
      filters.push(args);
      return this;
    },
    order() {
      return this;
    },
    limit() {
      return this;
    },
    async maybeSingle() {
      return { data: row, error: null };
    },
  };
  const admin: any = {
    from() {
      return builder;
    },
    async rpc(_name: string, args: Record<string, unknown>) {
      rpcArguments = args;
      return {
        data: {
          ...row,
          id: 99,
          role: "user",
          message_type: "career_form_response",
          payload: args.p_payload,
          content: args.p_content,
        },
        error: null,
      };
    },
  };
  const message = await respondToCareerForm({
    admin,
    userId: "user",
    conversationId: row.conversation_id,
    input: {
      conversationId: row.conversation_id,
      formId: 42,
      revision: 1,
      actionId: "send",
      values: { location: "", military: "사용자가 입력한 내용" },
      requestId: "request-1",
    },
  });
  assert.ok(
    filters.some(
      (value) =>
        JSON.stringify(value) === JSON.stringify(["payload", { revision: 1 }])
    )
  );
  assert.equal(
    message.content,
    "이 내용으로 지원해줘.\n사는 곳: \n병역: 사용자가 입력한 내용"
  );
  assert.deepEqual((rpcArguments?.p_payload as any).formSnapshot, form);
  assert.equal(
    parseCareerFormResponse(message.formResponse)?.values.location,
    ""
  );
  assert.match(
    formatCareerFormResponseForModel(message.formResponse!),
    /revision 1/
  );
  assert.match(
    formatCareerFormResponseForModel(message.formResponse!),
    /사용자가 입력한 내용/
  );
  assert.match(
    formatTalentMessageContentForLlmPrompt(message),
    /사용자가 입력한 내용/
  );
  assert.doesNotMatch(
    formatCareerFormResponseForModel(message.formResponse!),
    /"formId"/
  );
  await assert.rejects(
    () =>
      respondToCareerForm({
        admin,
        userId: "user",
        conversationId: row.conversation_id,
        input: {
          conversationId: row.conversation_id,
          formId: 42,
          revision: 1,
          actionId: "invented",
          values: {},
          requestId: "request-2",
        },
      }),
    /action not found/
  );
  assert.equal(
    buildCareerFormResponseMessage(form, "change", {}),
    "내용을 수정하고 싶어."
  );
});

test("Gmail markers only activate outside code and quoted source", () => {
  const protectedContent =
    "> [[integration:gmail]]\n`[[integration:gmail]]`\n```\n[[integration:gmail]]\n```";
  assert.deepEqual(extractGmailIntegrationMarker(protectedContent), {
    content: protectedContent,
    showGmailIntegration: false,
  });
  assert.deepEqual(
    extractGmailIntegrationMarker("연결해 주세요. [[integration:gmail]]"),
    { content: "연결해 주세요.", showGmailIntegration: true }
  );
});

test("suggestion explanations and free replies survive storage and reach the model without accepting an action", async () => {
  const suggestion: CareerForm = {
    formId: 42,
    revision: 2,
    kind: "suggestion",
    title: "경험 확인",
    items: [
      {
        id: "scope",
        label: "어떤 부분을 맡았나요?",
        description:
          "팀 결과와 본인의 기여를 구분해 이력서를 쓰기 위해 확인합니다.",
        type: "textarea",
        content: { reason: "현재 이력서에는 팀 성과만 있습니다." },
      },
    ],
  };
  const conversationId = "11111111-1111-4111-8111-111111111111";
  const row = {
    id: 42,
    conversation_id: conversationId,
    user_id: "user",
    role: "assistant",
    message_type: "career_form",
    payload: suggestion,
    content: "",
    created_at: "2026-10-29T00:00:00Z",
  };
  const writes: Record<string, unknown>[] = [];
  const builder: any = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    contains() {
      return this;
    },
    order() {
      return this;
    },
    limit() {
      return this;
    },
    async maybeSingle() {
      return { data: row, error: null };
    },
  };
  const admin: any = {
    from() {
      return builder;
    },
    async rpc(_name: string, args: Record<string, unknown>) {
      writes.push(args);
      return {
        data: {
          ...row,
          id: 99,
          role: "user",
          message_type: "career_form_response",
          payload: args.p_payload,
          content: args.p_content,
        },
        error: null,
      };
    },
  };
  const answer = {
    itemId: "scope",
    values: {},
    message:
      "저는 평가 데이터셋 구축을 맡았습니다.\n모델 학습은 다른 팀원이 담당했습니다.",
  };
  const input = {
    conversationId,
    formId: 42,
    revision: 2,
    values: {},
    answers: [answer],
    requestId: "reply-request",
  };
  const message = await respondToCareerForm({
    admin,
    userId: "user",
    conversationId,
    input,
  });
  assert.equal(message.content, `어떤 부분을 맡았나요?\n${answer.message}`);
  assert.equal(message.formResponse?.actionId, undefined);
  assert.equal(message.formResponse?.answers?.[0].message, answer.message);
  assert.deepEqual(toUiMessage(message).formResponse?.formSnapshot, suggestion);
  const providerInput = formatTalentMessageContentForLlmPrompt(message);
  assert.match(providerInput, /User completed form 42, revision 2/);
  assert.match(providerInput, /팀 결과와 본인의 기여를 구분해/);
  assert.match(providerInput, /현재 이력서에는 팀 성과만/);
  assert.ok(providerInput.includes(answer.message));
  assert.doesNotMatch(providerInput, /action undefined|"formSnapshot"/);
  const skipped = await respondToCareerForm({
    admin,
    userId: "user",
    conversationId,
    input: {
      ...input,
      requestId: "skip-request",
      answers: [{ ...answer, message: "건너뛰기", skipped: true }],
    },
  });
  assert.equal(skipped.formResponse?.answers?.[0].skipped, true);
  assert.match(
    formatTalentMessageContentForLlmPrompt(skipped),
    /\[scope\] — skipped/
  );
  const before = writes.length;
  for (const invalid of [
    { ...input, answers: [{ ...answer, itemId: "missing" }] },
    { ...input, answers: [{ ...answer, actionId: "invented" }] },
    { ...input, answers: [{ ...answer, message: undefined }] },
  ]) {
    await assert.rejects(
      respondToCareerForm({
        admin,
        userId: "user",
        conversationId,
        input: invalid,
      })
    );
  }
  assert.equal(
    writes.length,
    before,
    "invalid item/action commands cannot write a response"
  );
  row.payload = { ...suggestion, kind: "form" };
  await assert.rejects(
    respondToCareerForm({ admin, userId: "user", conversationId, input }),
    /Review forms use a saved action/
  );
});
