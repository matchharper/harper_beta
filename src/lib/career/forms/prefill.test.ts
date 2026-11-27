import assert from "node:assert/strict";
import test from "node:test";
import { prefillFromEarlierAnswers } from "./prefill";
import { executeSuggestForm } from "./server";
import { getCareerFormContent, type CareerForm, type CareerFormDraft } from "./schema";

const key = (label: string) => label.trim().toLowerCase();
const from = (answers: { formId: number; label: string; answer: string }[]) => ({ answers: async () => ({ answers }), questionKey: key });
const unread = { answers: async () => assert.fail("nothing to fill, so earlier answers are not read"), questionKey: key };
const value = (form: CareerFormDraft, id: string) => getCareerFormContent(form.items.find((item) => item.id === id)!).value;

const review: CareerFormDraft = {
  kind: "form", title: "A사 웹 지원 검토",
  relatedRefs: [{ type: "browser_session", id: "s1" }, { type: "role", id: "r1" }],
  items: [
    { id: "birth", type: "text", label: "Birth year", content: { value: "" } },
    { id: "auth", type: "select", label: "Are you legally authorized to work here?", content: { options: [{ id: "y", label: "Yes" }, { id: "n", label: "No" }] } },
    { id: "sponsor", type: "select", label: "Visa sponsorship", content: { options: ["Required", "Not required"] } },
    { id: "github", type: "text", label: "GitHub", content: { value: "https://github.com/written-by-harper" } },
    { id: "why", type: "textarea", label: "Why this team?", content: "" },
    { id: "privacy", type: "consent", label: "Privacy consent", content: {} },
    { id: "resume", type: "document", label: "Resume", content: {} },
    { id: "source", type: "multiselect", label: "Sources", content: { options: ["Blog", "Event"] } },
  ],
};
const earlier = [
  { formId: 7, label: "Birth year", answer: "1990" },
  { formId: 5, label: "birth year", answer: "1991" },
  { formId: 6, label: "Are you legally authorized to work here?", answer: "yes" },
  { formId: 6, label: "Visa sponsorship", answer: "Maybe later" },
  { formId: 4, label: "GitHub", answer: "https://github.com/older" },
  { formId: 4, label: "Why this team?", answer: "B사 팀이 좋아서" },
  { formId: 4, label: "Privacy consent", answer: "true" },
  { formId: 4, label: "Resume", answer: "resume.pdf" },
  { formId: 4, label: "Sources", answer: "Blog" },
];

test("a web application review fills empty text and select items from the newest earlier answer and says so", async () => {
  const { form, filled, note } = await prefillFromEarlierAnswers(review, from(earlier));
  assert.deepEqual(filled, [{ label: "Birth year", formId: 7 }, { label: "Are you legally authorized to work here?", formId: 6 }]);
  assert.equal(value(form, "birth"), "1990");
  // A select takes the option whose label is the answer; an answer no option carries leaves it empty.
  assert.equal(value(form, "auth"), "y");
  assert.equal(value(form, "sponsor"), undefined);
  assert.deepEqual(getCareerFormContent(form.items[1]).options, getCareerFormContent(review.items[1]).options);
  // The writer's own value stays; long answers, consents, documents and multiselects are never filled.
  assert.equal(value(form, "github"), "https://github.com/written-by-harper");
  for (const id of ["why", "privacy", "resume", "source"])
    assert.deepEqual(form.items.find((item) => item.id === id), review.items.find((item) => item.id === id));
  assert.equal(note, "Filled from earlier answers: Birth year ← form 7; Are you legally authorized to work here? ← form 6. These are the user's answers to the same question in those forms, not consent or approval; update the form to clear one that does not fit this application.");
  // The draft the writer sent is not changed in place.
  assert.equal(value(review, "birth"), "");
});

test("a start form gets the facts but none of its own choices", async () => {
  const start: CareerFormDraft = {
    kind: "form", title: "지원 시작", relatedRefs: [{ type: "role", id: "r1" }, { type: "role", id: "r2" }],
    items: [
      { id: "apply_postings", type: "multiselect", label: "지원할 공고", content: { options: [{ id: "r1", label: "A사" }, { id: "r2", label: "B사" }], value: ["r1", "r2"] } },
      { id: "submit_scope", type: "select", label: "맡기는 범위", content: { options: ["제출까지 맡기기", "제출 전에 한 번 보기"] } },
      { id: "account_site", type: "select", label: "지원 사이트 계정", content: { options: ["계정 있음", "새로 만들기", "이 공고 빼기"] } },
      { id: "salary", type: "text", label: "희망 연봉", content: "" },
      { id: "save_login", type: "checkbox", label: "로그인 기억하기", content: { value: true } },
    ],
  };
  const { form, filled } = await prefillFromEarlierAnswers(start, from([
    { formId: 3, label: "맡기는 범위", answer: "제출 전에 한 번 보기" },
    { formId: 3, label: "지원 사이트 계정", answer: "이 공고 빼기" },
    { formId: 3, label: "희망 연봉", answer: "8,000만 원" },
  ]));
  assert.deepEqual(filled, [{ label: "희망 연봉", formId: 3 }]);
  assert.equal(value(form, "salary"), "8,000만 원");
  assert.equal(value(form, "submit_scope"), undefined);
  assert.equal(value(form, "account_site"), undefined);
});

test("forms that are not an application start or web review, or have nothing empty to fill, are left alone unread", async () => {
  const plain: CareerFormDraft = { kind: "form", title: "경력 질문", items: [{ id: "birth", type: "text", label: "Birth year", content: "" }] };
  const roleOnly: CareerFormDraft = { ...plain, relatedRefs: [{ type: "role", id: "r1" }] };
  const mail: CareerFormDraft = { kind: "form", title: "지원 메일", relatedRefs: [{ type: "browser_session", id: "s1" }, { type: "role", id: "r1" }], items: [
    { id: "to", type: "text", label: "받는 사람", content: { value: "recruit@company-a.example" } },
    { id: "resume", type: "document", label: "이력서", content: {} },
    { id: "cc", type: "text", label: "참조", content: "" },
  ] };
  const filledIn: CareerFormDraft = { ...review, items: review.items.filter((item) => item.id === "github") };
  for (const draft of [plain, roleOnly, mail, filledIn, { ...review, kind: "suggestion" as const }]) {
    const result = await prefillFromEarlierAnswers(draft, unread);
    assert.equal(result.form, draft);
    assert.deepEqual([result.filled, result.note], [[], ""]);
  }
});

test("a failed read of earlier answers leaves the form as written", async (t) => {
  t.mock.method(console, "warn", () => {});
  const result = await prefillFromEarlierAnswers(review, { answers: async () => { throw new Error("read failed"); }, questionKey: key });
  assert.equal(result.form, review);
  assert.equal(result.note, "");
});

test("suggest_form create fills a web review from this conversation's confirmed answers by the answers reader's question key", async () => {
  const approved: CareerForm = { formId: 2, revision: 1, kind: "form", title: "Review your A application", items: [
    { id: "salary", type: "text", label: "Salary expectation (required)", content: {} },
    { id: "relocate", type: "select", label: "Willing to relocate?", content: { options: [{ id: "y", label: "Yes" }, { id: "n", label: "No" }] } },
  ], positive: { id: "apply", label: "Apply", message: "Apply." }, negative: { id: "hold", label: "Hold", message: "Do not apply." } };
  const declined: CareerForm = { ...approved, formId: 3, title: "Review your B application", items: [
    { id: "permit", type: "text", label: "Work permit status", content: {} },
  ] };
  const rows = [
    { id: 11, created_at: "2026-11-27T02:00:00Z", payload: { formId: 3, revision: 1, requestId: "r3", formSnapshot: declined, actionId: "hold", values: { permit: "Needs a permit" } } },
    { id: 10, created_at: "2026-11-27T01:00:00Z", payload: { formId: 2, revision: 1, requestId: "r2", formSnapshot: approved, actionId: "apply", values: { salary: "$120,000", relocate: "n" } } },
  ];
  const query: any = new Proxy({}, { get: (_target, prop) => {
    if (prop === "then") return (resolve: (value: unknown) => void) => resolve({ data: rows, error: null });
    if (prop === "maybeSingle") return async () => ({ data: { id: "conversation" }, error: null });
    return () => query;
  } });
  const writes: any[] = [];
  const admin = { from: () => query, rpc: async (_name: string, input: any) => {
    writes.push(input);
    return { data: { id: 12, role: "assistant", message_type: "career_form", content: "", payload: { ...input.p_payload, formId: 12, revision: 1 } }, error: null };
  } };
  const result = await executeSuggestForm({ admin: admin as never, userId: "user", conversationId: "conversation", input: { action: "create", form: {
    kind: "form", title: "Review your C application", relatedRefs: [{ type: "browser_session", id: "s3" }, { type: "role", id: "role-c" }], items: [
      { id: "salary", type: "text", label: "Salary expectation", content: { value: "" } },
      { id: "relocate", type: "select", label: "Willing to relocate? *", content: { options: [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }] } },
      { id: "permit", type: "text", label: "Work permit status", content: { value: "" } },
    ] } } });
  const saved = writes[0].p_payload as CareerFormDraft;
  assert.equal(value(saved, "salary"), "$120,000");
  assert.equal(value(saved, "relocate"), "no");
  // A declined review's values were never confirmed by the user.
  assert.equal(value(saved, "permit"), "");
  assert.match(result.modelOutput, /^Filled from earlier answers: Salary expectation ← form 2; Willing to relocate\? \* ← form 2\./m);
  assert.match(result.modelOutput, /salary \| Salary expectation \| text\n {2}value: \$120,000/);
});

test("an update is saved as written, so a filled answer the writer cleared stays cleared", async () => {
  const approved: CareerForm = { formId: 2, revision: 1, kind: "form", title: "Review your A application", items: [
    { id: "salary", type: "text", label: "Salary expectation", content: {} },
  ], positive: { id: "apply", label: "Apply", message: "Apply." } };
  const rows = [
    { id: 10, created_at: "2026-11-27T01:00:00Z", payload: { formId: 2, revision: 1, requestId: "r2", formSnapshot: approved, actionId: "apply", values: { salary: "$120,000" } } },
  ];
  const query: any = new Proxy({}, { get: (_target, prop) => {
    if (prop === "then") return (resolve: (value: unknown) => void) => resolve({ data: rows, error: null });
    if (prop === "maybeSingle") return async () => ({ data: { id: "conversation" }, error: null });
    return () => query;
  } });
  const writes: any[] = [];
  const admin = { from: () => query, rpc: async (_name: string, input: any) => {
    writes.push(input);
    return { data: { id: 12, role: "assistant", message_type: "career_form", content: "", payload: { ...input.p_payload, formId: 12, revision: 2 } }, error: null };
  } };
  const result = await executeSuggestForm({ admin: admin as never, userId: "user", conversationId: "conversation", input: {
    action: "update", formId: 12, expectedRevision: 1, form: {
      kind: "form", title: "Review your C application", relatedRefs: [{ type: "browser_session", id: "s3" }, { type: "role", id: "role-c" }],
      items: [{ id: "salary", type: "text", label: "Salary expectation", content: { value: "" } }] } } });
  assert.equal(value(writes[0].p_payload as CareerFormDraft, "salary"), "");
  assert.doesNotMatch(result.modelOutput, /Filled from earlier answers/);
});
