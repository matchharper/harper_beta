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

test("a form is durably presented before a tool wait or checkpoint, without a final flush", async () => {
  const { presenter, order, writes } = setup();
  await presenter.presentForm(form);
  assert.deepEqual(order, ["save:40", "emit:40"]);
  assert.equal(presenter.hasPending(), true, "the turn knows it has delivered an artifact");
  order.push("tool:wait");
  await presenter.presentForm({ ...form, formId: 41 });
  assert.equal(writes.length, 2);
  assert.equal(writes[0].p_request_id, "presentation:turn:1:40:1");
  await presenter.flush();
  assert.equal(writes.length, 2, "flush cannot duplicate presentations");
  assert.equal(presenter.hasPending(), false);
});

test("a new presenter after a checkpoint does not own the previous form's visibility", async () => {
  const first = setup();
  await first.presenter.presentForm(form);
  const resumed = setup();
  await resumed.presenter.flush();
  assert.equal(first.writes.length, 1);
  assert.equal(resumed.writes.length, 0);
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
