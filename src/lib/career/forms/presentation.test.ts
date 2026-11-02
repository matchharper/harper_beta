import assert from "node:assert/strict";
import test from "node:test";
import { createCareerFormPresenter } from "./server";
import type { CareerForm } from "./schema";

const form: CareerForm = {
  formId: 40, revision: 1, kind: "suggestion", title: "지원 준비 질문",
  items: [{ id: "experience", type: "textarea", label: "관련 경험", content: "" }],
};

function setup() {
  const order: string[] = [];
  const writes: Record<string, unknown>[] = [];
  let id = 50;
  const admin = { rpc: async (_name: string, input: Record<string, unknown>) => {
    writes.push(input);
    order.push(`save:${input.p_form_id}`);
    return { data: { id: id++, role: "assistant", message_type: "career_form_presentation",
      content: "", payload: input.p_payload, created_at: "2026-10-30T12:00:00Z" }, error: null };
  }};
  const presenter = createCareerFormPresenter(
    { admin: admin as never, userId: "user", conversationId: "conversation" },
    message => { order.push(`emit:${message.careerForm?.formId}`); }, "turn:1"
  );
  return { presenter, order, writes };
}

test("forms created before and after progress stay queued until all replies are saved", async () => {
  const { presenter, order, writes } = setup();
  await presenter.presentForm(form);
  await presenter.presentForm({ ...form, formId: 41 });
  assert.equal(presenter.hasPending(), true);
  assert.equal(order.length, 0);
  order.push("save:assistant-progress");
  order.push("tool:next");
  await presenter.presentForm({ ...form, formId: 42 });
  assert.deepEqual(order, ["save:assistant-progress", "tool:next"]);
  assert.equal(writes.length, 0, "no form is visible while tools and text are still running");
  order.push("save:final-reply", "save:completion-message");
  await presenter.flush();
  assert.deepEqual(order, ["save:assistant-progress", "tool:next", "save:final-reply", "save:completion-message",
    "save:40", "emit:40", "save:41", "emit:41", "save:42", "emit:42"]);
  assert.equal(presenter.hasPending(), false);
  assert.equal(writes[0].p_request_id, "presentation:turn:1:40:1");
  await presenter.flush();
  assert.equal(writes.length, 3);
});

test("a final saved reply also releases a form when no earlier prose was generated", async () => {
  const { presenter, order } = setup();
  await presenter.presentForm(form);
  order.push("save:final-reply");
  await presenter.flush();
  assert.deepEqual(order, ["save:final-reply", "save:40", "emit:40"]);
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
