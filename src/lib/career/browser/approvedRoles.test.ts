import assert from "node:assert/strict";
import test from "node:test";
import { rolesNotChosen } from "./approvedRoles";

const role = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const startForm = (formId: number, roles: string[]) => ({
  formId, revision: 1, kind: "form", title: "지원 시작",
  items: [
    { id: "apply_postings", label: "지원할 공고", type: "multiselect",
      content: { options: roles.map((id) => ({ id, label: `A사 공고 ${id.slice(-2)}` })), value: roles } },
    { id: "submit_scope", label: "맡기는 범위", type: "select",
      content: { options: [{ id: "submit", label: "제출까지 맡기기" }, { id: "review", label: "제출 전에 보여 주기" }], value: "submit" } },
  ],
  positive: { id: "start", label: "시작", message: "시작해줘" },
  relatedRefs: roles.map((id) => ({ type: "role", id })),
});
const reviewForm = (formId: number, roleId: string) => ({
  formId, revision: 1, kind: "form", title: "지원 확인",
  items: [{ id: "answer", label: "지원 동기", type: "textarea", content: "" }],
  positive: { id: "submit", label: "제출", message: "제출해줘" },
  relatedRefs: [{ type: "role", id: roleId }],
});
const answer = (snapshot: { formId: number }, values: Record<string, unknown>) =>
  ({ formId: snapshot.formId, revision: 1, requestId: "r", actionId: "start", formSnapshot: snapshot, values });

test("a submission for a posting the start form left unselected, or never listed, is not chosen", () => {
  const start = startForm(41, [role(1), role(2), role(3)]);
  const authorization = [{ payload: answer(start, { apply_postings: [role(1), role(3)], submit_scope: "submit" }) }];
  assert.deepEqual(rolesNotChosen([role(1)], authorization), []);
  assert.deepEqual(rolesNotChosen([role(2)], authorization), [role(2)], "unselected by the person");
  assert.deepEqual(rolesNotChosen([role(9)], authorization), [role(9)], "an alternative found later");
  assert.deepEqual(rolesNotChosen([role(1), role(9), role(9)], authorization), [role(9)]);
});

test("a later answer tied to the alternative chooses it; a chat message or an answer without a list is not checked", () => {
  const start = startForm(51, [role(1)]);
  const listed = { payload: answer(start, { apply_postings: [role(1)] }) };
  assert.deepEqual(rolesNotChosen([role(9)], [listed, { payload: { responses: [answer(reviewForm(52, role(9)), { answer: "" })] } }]), []);
  assert.deepEqual(rolesNotChosen([role(9)], [listed, { payload: {} }]), [], "the person's own words, read by Harper");
  assert.deepEqual(rolesNotChosen([role(9)], [{ payload: answer(reviewForm(53, role(1)), { answer: "" }) }]), []);
  assert.deepEqual(rolesNotChosen([role(9)], []), []);
});
