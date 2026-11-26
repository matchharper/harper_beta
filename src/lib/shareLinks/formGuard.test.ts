import assert from "node:assert/strict";
import test from "node:test";
import { PROFILE_LINK_BOX_LABEL, looksLikeApplicationMail, withProfileLinkBox } from "./formGuard";

const mailForm = {
  kind: "form" as const,
  title: "지원 메일 검토",
  items: [
    { id: "to", label: "받는 사람", type: "text", content: { value: "recruit@example-company.com" } },
    { id: "subject", label: "제목", type: "text", content: { value: "백엔드 엔지니어 지원" } },
    { id: "resume", label: "이력서", type: "document", content: { documentId: "00000000-0000-0000-0000-000000000000" } },
  ],
};

test("an application mail (a document to a company address) gets the link box, checked, once", () => {
  assert.equal(looksLikeApplicationMail(mailForm), true);
  const { form, added } = withProfileLinkBox(mailForm);
  assert.equal(added, true);
  const box = form.items.at(-1)!;
  assert.equal(box.label, PROFILE_LINK_BOX_LABEL);
  assert.equal(box.type, "checkbox");
  assert.deepEqual(box.content, { value: true });
  // Already there: left alone.
  assert.equal(withProfileLinkBox(form).added, false);
});

test("no box without a document, for personal addresses only, or on a suggestion", () => {
  assert.equal(withProfileLinkBox({ ...mailForm, items: mailForm.items.filter((item) => item.type !== "document") }).added, false);
  const personal = { ...mailForm, items: mailForm.items.map((item) => item.id === "to" ? { ...item, content: { value: "someone@gmail.com" } } : item) };
  assert.equal(withProfileLinkBox(personal).added, false);
  assert.equal(withProfileLinkBox({ ...mailForm, kind: "suggestion" as const }).added, false);
});

test("the box id never clashes with an existing item", () => {
  const taken = { ...mailForm, items: [...mailForm.items, { id: "harper_candidate_link", label: "다른 칸", type: "text", content: "" }] };
  const { form } = withProfileLinkBox(taken);
  assert.equal(form.items.at(-1)!.id, "harper_candidate_link_2");
});

test("a web application's review form (tied to a browser session) gets the box too", () => {
  const web = {
    kind: "form" as const,
    title: "웹 지원서 검토",
    items: [{ id: "q1", label: "Why this role?", type: "textarea", content: { value: "..." } }],
    relatedRefs: [{ type: "browser_session", id: "s1" }, { type: "role", id: "r1" }],
  };
  assert.equal(withProfileLinkBox(web).added, true);
  // A form about a role without a browser session or a company address (e.g. a résumé edit) does not.
  assert.equal(withProfileLinkBox({ ...web, relatedRefs: [{ type: "role", id: "r1" }] }).added, false);
});

test("the start form of delegated applications gets the box: a review may never come", () => {
  const start = {
    kind: "form" as const,
    title: "지원 시작",
    items: [
      { id: "submit_scope", label: "맡기는 범위", type: "select", content: { options: ["제출까지 맡기기", "제출 전에 한 번 보기"] } },
      { id: "save_login", label: "로그인 기억하기", type: "checkbox", content: { value: true } },
    ],
    relatedRefs: [{ type: "role", id: "r1" }, { type: "role", id: "r2" }],
  };
  const guarded = withProfileLinkBox(start);
  assert.equal(guarded.added, true);
  assert.equal(guarded.form.items.at(-1)!.label, PROFILE_LINK_BOX_LABEL);
  // Without roles it is not an application start.
  assert.equal(withProfileLinkBox({ ...start, relatedRefs: [] }).added, false);
});
