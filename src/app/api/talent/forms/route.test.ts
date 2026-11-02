import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";
import {
  careerFormResponseInputSchema,
  type CareerForm,
  type CareerSuggestionAnswer,
} from "@/lib/career/forms/schema";
import * as formServer from "@/lib/career/forms/server";
import { formatTalentMessageContentForLlmPrompt } from "@/lib/career/opportunityFeedbackNote";

const conversationId = "11111111-1111-4111-8111-111111111111";
const form: CareerForm = {
  formId: 42,
  revision: 2,
  kind: "suggestion",
  items: [
    {
      id: "question",
      label: "담당 범위",
      description: "개인의 기여를 정확히 쓰기 위해 확인합니다.",
      type: "textarea",
      content: "",
    },
    {
      id: "accept",
      label: "첫 수정안",
      type: "change",
      content: { originalText: "원문 A", suggestedText: "수정안 A" },
      positive: { id: "yes", label: "적용", message: "이 수정안을 적용해줘." },
    },
    {
      id: "reject",
      label: "둘째 수정안",
      type: "change",
      content: { originalText: "원문 B", suggestedText: "수정안 B" },
      negative: {
        id: "no",
        label: "적용하지 않기",
        message: "이 부분은 원문을 유지해줘.",
      },
    },
    { id: "skip", label: "추가 경험", type: "textarea", content: "" },
  ],
};
const answers: CareerSuggestionAnswer[] = [
  {
    itemId: "question",
    message: "평가 데이터셋 구축을 맡았습니다.\n학습은 다른 팀원이 맡았습니다.",
    values: {},
  },
  {
    itemId: "accept",
    actionId: "yes",
    values: { accept: "사용자가 직접 수정한 문장" },
  },
  { itemId: "reject", actionId: "no", values: { reject: "수정안 B" } },
  { itemId: "skip", skipped: true, message: "건너뛰기", values: {} },
];

// Actual endpoint, schemas, persistence projection and LLM-input formatter run.
// Only authentication and database transport are fixture-backed.
function harness(savedForm = form, anonymous = false) {
  const messages = new Map<string, any>();
  const row = {
    id: 42,
    user_id: "owner",
    conversation_id: conversationId,
    role: "assistant",
    message_type: "career_form",
    payload: savedForm,
    content: "",
    created_at: "2026-10-30T00:00:00Z",
  };
  const admin = {
    from(table: string) {
      const filters: Record<string, any> = {};
      const query: any = {
        select: () => query,
        eq: (key: string, value: unknown) => {
          filters[key] = value;
          return query;
        },
        contains: (_key: string, value: Record<string, unknown>) => {
          Object.assign(filters, value);
          return query;
        },
        order: () => query,
        limit: () => query,
        maybeSingle: async () => ({
          data:
            table === "talent_messages" &&
            filters.user_id === "owner" &&
            filters.conversation_id === conversationId &&
            filters.formId === savedForm.formId &&
            filters.revision === savedForm.revision
              ? row
              : null,
          error: null,
        }),
      };
      return query;
    },
    async rpc(_name: string, input: Record<string, any>) {
      const key = input.p_request_id;
      if (!messages.has(key))
        messages.set(key, {
          ...row,
          id: 100 + messages.size,
          role: "user",
          message_type: "career_form_response",
          content: input.p_content,
          payload: input.p_payload,
        });
      return { data: messages.get(key), error: null };
    },
  };
  const dependencies: Record<string, unknown> = {
    "next/server": {
      NextResponse: {
        json: (body: unknown, init?: { status: number }) => ({
          body,
          status: init?.status ?? 200,
        }),
      },
    },
    zod: { z },
    "@/lib/supabaseServer": {
      getRequestUser: async () => (anonymous ? null : { id: "owner" }),
    },
    "@/lib/talentOnboarding/admin": { getTalentSupabaseAdmin: () => admin },
    "@/lib/career/forms/schema": { careerFormResponseInputSchema },
    "@/lib/career/forms/server": formServer,
  };
  const loaded = {
    exports: {} as {
      POST: (request: {
        json: () => Promise<unknown>;
      }) => Promise<{ status: number; body: any }>;
    },
  };
  const source = ts.transpileModule(
    readFileSync(new URL("./route.ts", import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText;
  vm.runInNewContext(source, {
    module: loaded,
    exports: loaded.exports,
    console,
    require: (name: string) => {
      if (!(name in dependencies))
        throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return {
    messages,
    post: (body: unknown) => loaded.exports.POST({ json: async () => body }),
  };
}
const batch = () => ({
  conversationId,
  formId: form.formId,
  revision: form.revision,
  values: {},
  answers,
  requestId: "one-completed-batch",
});

test("one complete suggestion batch saves the exact message for ordinary chat without a queue dependency", async () => {
  const app = harness();
  const result = await app.post(batch());
  assert.equal(result.status, 200);
  assert.equal(app.messages.size, 1);
  assert.deepEqual(result.body.message.formResponse.answers, answers);
  const message = result.body.message;
  assert.ok(message.content.includes(answers[0].message!));
  assert.match(message.content, /이 수정안을 적용해줘/);
  assert.match(message.content, /이 부분은 원문을 유지해줘/);
  assert.match(message.content, /사용자가 직접 수정한 문장/);
  assert.match(message.content, /건너뛰기/);
  const providerInput = formatTalentMessageContentForLlmPrompt(message);
  assert.match(providerInput, /4 item responses submitted together/);
  assert.ok(providerInput.includes(answers[0].message!));
  assert.match(providerInput, /개인의 기여를 정확히/);
  assert.match(providerInput, /action yes.*적용/);
  assert.match(providerInput, /action no.*적용하지 않기/);
  assert.match(providerInput, /추가 경험 \[skip\] — skipped/);
  assert.equal((providerInput.match(/The exact form shown/g) ?? []).length, 1);
  assert.doesNotMatch(providerInput, /"formSnapshot"|"answers"/);
});

test("incomplete, duplicate, mixed or invalid item responses never write", async () => {
  const app = harness();
  const invalid = [
    { ...batch(), answers: undefined, ...answers[0] },
    { ...batch(), answers: answers.slice(0, 3) },
    { ...batch(), answers: [...answers.slice(0, 3), answers[0]] },
    {
      ...batch(),
      answers: answers.map((a) =>
        a.itemId === "skip" ? { ...a, itemId: "missing" } : a
      ),
    },
    {
      ...batch(),
      answers: answers.map((a) =>
        a.itemId === "accept" ? { ...a, actionId: "invented" } : a
      ),
    },
    {
      ...batch(),
      answers: answers.map((a) =>
        a.itemId === "question" ? { ...a, values: { accept: "other item" } } : a
      ),
    },
    { ...batch(), itemId: "question", message: "separate reply" },
    { ...batch(), revision: 99 },
    { ...batch(), conversationId: "22222222-2222-4222-8222-222222222222" },
  ];
  for (const input of invalid)
    assert.equal((await app.post(input)).status, 400);
  assert.equal(app.messages.size, 0);
  assert.equal((await harness(form, true).post(batch())).status, 401);
});

test("retry reuses the saved batch message for the same ordinary chat reply", async () => {
  const app = harness();
  const saved = await app.post(batch());
  assert.equal(saved.status, 200);
  assert.equal(app.messages.size, 1);
  const retried = await app.post(batch());
  assert.equal(retried.status, 200);
  assert.equal(app.messages.size, 1);
  assert.equal(retried.body.message.id, saved.body.message.id);
});

test("ordinary review forms continue to save their action immediately", async () => {
  const review: CareerForm = {
    ...form,
    kind: "form",
    positive: {
      id: "send",
      label: "제출",
      message: "확인한 내용으로 제출해줘.",
    },
  };
  const app = harness(review);
  const result = await app.post({
    conversationId,
    formId: review.formId,
    revision: review.revision,
    actionId: "send",
    values: {},
    requestId: "review-action",
  });
  assert.equal(result.status, 200);
  assert.equal(app.messages.size, 1);
  assert.equal(result.body.message.content, review.positive!.message);
  assert.equal(result.body.message.formResponse.answers, undefined);
});
