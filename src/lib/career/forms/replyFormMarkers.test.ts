import assert from "node:assert/strict";
import test from "node:test";
import { readUnshownReviewFormIds, shownFormIds, withFormMarkers } from "./replyFormMarkers";

test("a reply that forgot its review form shows it at the end", () => {
  assert.equal(withFormMarkers("준비했어요. 아래에서 확인해 주세요.", [41]), "준비했어요. 아래에서 확인해 주세요.\n\n[[form:41]]");
  assert.equal(withFormMarkers("두 곳 모두 준비했어요.", [41, 42]), "두 곳 모두 준비했어요.\n\n[[forms:[41,42]]]");
});

test("forms the reply already places are not shown twice", () => {
  const text = "확인해 주세요.\n\n[[forms:[41,42]]]\n\n나머지도 곧 올게요.";
  assert.deepEqual([...shownFormIds(text)], [41, 42]);
  assert.equal(withFormMarkers(text, [41, 42]), text);
  assert.equal(withFormMarkers("[[form:41]]", [41, 43]), "[[form:41]]\n\n[[form:43]]");
});

function admin(tables: { messages: Record<string, unknown>[]; runs: Record<string, unknown>[] }) {
  const calls: string[] = [];
  return {
    calls,
    client: {
      from(table: string) {
        const rows = table === "talent_messages" ? tables.messages : tables.runs;
        const filters: Array<(row: Record<string, unknown>) => boolean> = [];
        const chain: any = {
          select: () => chain,
          eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return chain; },
          gt: (key: string, value: string) => { calls.push(`gt ${key}`); filters.push(row => String(row[key]) > value); return chain; },
          gte: (key: string, value: string) => { filters.push(row => String(row[key]) >= value); return chain; },
          not: (key: string, _op: string, list: string) => { filters.push(row => !list.slice(1, -1).split(",").includes(String(row[key]))); return chain; },
          order: () => chain,
          limit: () => chain,
          maybeSingle: async () => ({ data: rows.filter(row => filters.every(f => f(row))).at(-1) ?? null, error: null }),
          then: (resolve: (value: unknown) => void) => resolve({ data: rows.filter(row => filters.every(f => f(row))), error: null }),
        };
        return chain;
      },
    } as never,
  };
}

const base = { user_id: "u", conversation_id: "c" };
const reviewForm = (id: number, created_at: string, extra: Record<string, unknown> = {}) => ({
  ...base, id, created_at, role: "assistant", message_type: "career_form",
  payload: { formId: id, revision: 1, kind: "form", relatedRefs: [{ type: "role", id: "r" }], ...extra },
});

test("review forms saved since the previous reply and shown by none are returned", async () => {
  const db = admin({
    messages: [
      { ...base, id: 1, created_at: "2026-11-26T05:00:00Z", role: "assistant", message_type: "chat" },
      reviewForm(2, "2026-11-26T04:59:00Z"),
      reviewForm(3, "2026-11-26T05:01:00Z"),
      reviewForm(4, "2026-11-26T05:02:00Z", { hidden: true }),
      reviewForm(5, "2026-11-26T05:03:00Z", { relatedRefs: [] }),
      reviewForm(6, "2026-11-26T05:04:00Z", { revision: 2, formId: 3 }),
      reviewForm(7, "2026-11-26T05:05:00Z", { kind: "suggestion" }),
    ],
    runs: [{ ...base, id: "run", kind: "browser_run", status: "completed", created_at: "2026-11-26T05:00:30Z" }],
  });
  assert.deepEqual(await readUnshownReviewFormIds(db.client, { userId: "u", conversationId: "c", now: Date.parse("2026-11-26T05:10:00Z") }), [3]);
  assert.ok(db.calls.includes("gt created_at"));
});

test("while another browser run is still preparing, forms wait for one bundled review", async () => {
  const db = admin({
    messages: [reviewForm(3, "2026-11-26T05:01:00Z")],
    runs: [{ ...base, id: "run", kind: "browser_run", status: "running", created_at: "2026-11-26T05:00:30Z" }],
  });
  assert.deepEqual(await readUnshownReviewFormIds(db.client, { userId: "u", conversationId: "c", now: Date.parse("2026-11-26T05:10:00Z") }), []);
  // A run left unfinished for more than 30 minutes no longer holds the form back.
  assert.deepEqual(await readUnshownReviewFormIds(db.client, { userId: "u", conversationId: "c", now: Date.parse("2026-11-26T05:40:00Z") }), [3]);
});
