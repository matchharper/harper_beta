import assert from "node:assert/strict";
import test from "node:test";
import { executeSuggestForm } from "./server";
import type { CareerForm } from "./schema";

const reviewForm = (formId: number, title: string, items: CareerForm["items"]): CareerForm => ({
  formId, revision: 1, kind: "form", title, items,
  positive: { id: "apply", label: "Apply", message: "Apply with these answers." },
  negative: { id: "hold", label: "Do not apply", message: "Do not apply." },
});
const response = (id: number, form: CareerForm, values: Record<string, unknown>, actionId = "apply") => ({
  id, created_at: `2026-11-1${id}T01:00:00Z`,
  payload: { formId: form.formId, revision: 1, requestId: `r${id}`, formSnapshot: form, actionId, values },
});

const older = reviewForm(1, "Review your A application", [
  { id: "visa", type: "select", label: "Do you require visa sponsorship? *", content: { options: [{ id: "y", label: "Yes" }, { id: "n", label: "No" }] } },
  { id: "salary", type: "text", label: "Salary expectation", content: {} },
  { id: "terms", type: "checkbox", label: "I agree to the privacy policy", content: { value: true } },
]);
const newer = reviewForm(2, "Review your B application", [
  { id: "salary", type: "text", label: "Salary expectation (required)", content: {} },
  { id: "manager", type: "text", label: "Name of your supervisor", content: {} },
  { id: "military", type: "text", label: "병역 사항", content: {} },
]);
const declined = reviewForm(3, "Review your C application", [
  { id: "visa", type: "text", label: "Work permit status", content: {} },
]);

function adminFor(rows: unknown[]) {
  const query: any = new Proxy({}, { get: (_target, prop) => {
    if (prop === "then") return (resolve: (value: unknown) => void) => resolve({ data: rows, error: null });
    if (prop === "maybeSingle") return async () => ({ data: { id: "conversation" }, error: null });
    return () => query;
  } });
  return { from: () => query } as any;
}
const rows = [
  response(5, declined, { visa: "Needs a permit" }, "hold"),
  response(4, newer, { salary: "$120,000", manager: "Kim", military: "군필" }),
  response(3, older, { visa: "n", salary: "$100,000", terms: true }),
];
const run = (query?: string) => executeSuggestForm({ admin: adminFor(rows), userId: "user", conversationId: "conversation",
  input: { action: "answers", ...(query ? { query } : {}) } }) as Promise<{ modelOutput: string; answers: { label: string; answer: string }[] }>;

test("answers returns the newest confirmed answer per question without consent boxes or declined reviews", async () => {
  const result = await run();
  assert.deepEqual(result.answers.map(({ label, answer }) => [label, answer]), [
    ["Salary expectation (required)", "$120,000"],
    ["Name of your supervisor", "Kim"],
    ["병역 사항", "군필"],
    ["Do you require visa sponsorship? *", "No"],
  ]);
  assert.match(result.modelOutput, /grant no consent or approval/);
  assert.match(result.modelOutput, /form 2 "Review your B application", 2026-11-14 10:00/);
  assert.doesNotMatch(result.modelOutput, /privacy policy|Needs a permit/);
});

test("answers query matches Latin words from a word start and Korean words anywhere", async () => {
  assert.deepEqual((await run("visa sponsorship")).answers.map(entry => entry.answer), ["No"]);
  assert.deepEqual((await run("병역")).answers.map(entry => entry.answer), ["군필"]);
  assert.match((await run("relocation")).modelOutput, /^No earlier submitted form answers matching "relocation"/);
});
