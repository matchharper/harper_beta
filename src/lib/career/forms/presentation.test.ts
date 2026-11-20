import assert from "node:assert/strict";
import test from "node:test";
import { executeSuggestForm, suggestFormTool } from "./server";
import type { CareerForm } from "./schema";
import { formatTalentMessageContentForLlmPrompt } from "../opportunityFeedbackNote";
const form: CareerForm = { formId: 40, revision: 1, kind: "form", title: "지원 준비 질문",
  items: [{ id: "experience", type: "textarea", label: "관련 경험", content: "" }] };
test("create/update save deferred forms, never emit a presentation; removed contracts reject", async () => {
  const writes: any[] = [];
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { id: "conversation" }, error: null }) };
  const admin = { from: () => query, rpc: async (_name: string, input: any) => {
    writes.push(input); return { data: { id: 40, role: "assistant", message_type: "career_form", payload: { ...input.p_payload, formId: 40, revision: writes.length }, content: "" }, error: null };
  }};
  for (const [action, draft] of [["create", form], ["update", form], ["create", JSON.stringify(form)]] as const) {
    const result = await executeSuggestForm({ admin: admin as never, userId: "user", conversationId: "conversation",
      input: { action, formId: 40, expectedRevision: 1, form: draft }, onMessage: () => assert.fail("Tool must not display a form") });
    assert.match(result.modelOutput!, /Saved; not displayed/);
    assert.equal(writes.at(-1).p_payload.presentationDeferred, true);
    assert.equal((result as any).message, undefined);
  }
  for (const input of [{ action: "present", formId: 40 }, { action: "create", form: { ...form, kind: "suggestion" } },
    { action: "create", form: JSON.stringify({ ...form, kind: "suggestion" }) },
    { action: "create", form: "{invalid" }, { action: "create", form: JSON.stringify({ ...form, items: [form.items[0], form.items[0]] }) }])
    await assert.rejects(executeSuggestForm({ admin: admin as never, userId: "user", conversationId: "conversation", input }));
  assert.equal(writes.length, 3);
  assert.deepEqual(writes[0].p_payload.items, writes[2].p_payload.items);
});

test("the model can save independent actions with their own button and request", async () => {
  const fields = suggestFormTool.function.parameters.properties.form.properties;
  assert.ok(fields.kind.enum.includes("suggestion"));
  assert.deepEqual(fields.items.items.properties.positive.required, ["id", "label", "message"]);
  const draft = { kind: "suggestion", items: [
    { id: "resume", label: "이력서 다듬기", type: "action", content: {},
      positive: { id: "revise", label: "다듬기", message: "지원용 이력서를 다듬어 줘." } },
    { id: "contact", label: "채용 문의 메일", type: "action", content: {},
      positive: { id: "draft", label: "작성하기", message: "채용 담당자에게 보낼 메일 초안을 작성해 줘." } },
  ] };
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { id: "conversation" }, error: null }) };
  const admin = { from: () => query, rpc: async (_name: string, input: any) => ({
    data: { id: 41, role: "assistant", message_type: "career_form", content: "",
      payload: { ...input.p_payload, formId: 41, revision: 1 } }, error: null,
  }) };
  const result = await executeSuggestForm({ admin: admin as never, userId: "user", conversationId: "conversation",
    input: { action: "create", form: draft } });
  assert.deepEqual(result.form?.items, draft.items);
  for (const item of draft.items) assert.ok(result.modelOutput?.includes(item.positive.message));
  const clicked = draft.items[1];
  const turn = formatTalentMessageContentForLlmPrompt({
    role: "user", message_type: "career_form_response", content: "",
    payload: { formId: 41, revision: 1, requestId: "draft-contact", values: {}, formSnapshot: result.form,
      answers: [{ itemId: clicked.id, actionId: clicked.positive.id, values: {} }] },
  }, { currentInput: true });
  assert.ok(turn.includes(clicked.positive.message));
  assert.ok(!turn.includes(draft.items[0].positive.message));
});

test("history hides deferred source revisions but includes their presentation snapshots", async () => {
  const { fetchMessages } = await import("@/lib/talentOnboarding/messageStore");
  const payload = { ...form, presentationDeferred: true };
  const rows = [
    { id: 40, message_type: "career_form", payload },
    { id: 41, message_type: "chat", content: "질문을 확인해주세요." },
    { id: 42, message_type: "career_form_presentation", payload },
  ];
  const query = { select: () => query, eq: () => query,
    order: async () => ({ data: rows, error: null }) };
  const messages = await fetchMessages({ admin: { from: () => query } as never, conversationId: "conversation" });
  assert.deepEqual(messages.map(message => message.id), [41, 42]);
});
