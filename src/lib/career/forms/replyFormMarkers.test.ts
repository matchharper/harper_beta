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

function admin(tables: { messages: Record<string, unknown>[]; runs: Record<string, unknown>[]; open?: Record<string, unknown>[] }) {
  const calls: string[] = [];
  return {
    calls,
    client: {
      rpc: async (name: string) => {
        calls.push(`rpc ${name}`);
        return { data: tables.open ?? tables.messages.filter(row => row.message_type === "career_form"), error: null };
      },
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
const reply = (id: number, created_at: string, content: string) =>
  ({ ...base, id, created_at, role: "assistant", message_type: "chat", content });
const read = (db: ReturnType<typeof admin>, at: string) =>
  readUnshownReviewFormIds(db.client, { userId: "u", conversationId: "c", now: Date.parse(at) });

test("open review forms that no reply has shown are returned", async () => {
  const db = admin({
    messages: [
      reviewForm(2, "2026-11-26T04:59:00Z"),
      reply(10, "2026-11-26T05:00:00Z", "확인해 주세요.\n\n[[form:2]]"),
      reviewForm(3, "2026-11-26T05:01:00Z"),
      reviewForm(4, "2026-11-26T05:02:00Z", { hidden: true }),
      reviewForm(5, "2026-11-26T05:03:00Z", { relatedRefs: [] }),
      reviewForm(6, "2026-11-26T05:04:00Z", { revision: 2, formId: 3 }),
      reviewForm(7, "2026-11-26T05:05:00Z", { kind: "suggestion" }),
      reviewForm(8, "2026-11-10T05:05:00Z"),
    ],
    runs: [{ ...base, id: "run", kind: "browser_run", status: "completed", created_at: "2026-11-26T05:00:30Z" }],
  });
  // 2 was shown by a reply; 4-7 are not new application reviews; 8 is older than the 7-day window.
  assert.deepEqual(await read(db, "2026-11-26T05:10:00Z"), [3]);
  assert.ok(db.calls.includes("rpc read_open_career_forms"));
});

test("a form held while other preparations ran still comes with a later reply", async () => {
  // 11/27 real run: forms 155 and 160 were saved while other browsers prepared, so two replies passed them by.
  const messages = [
    reviewForm(155, "2026-11-27T02:25:42Z"),
    reply(156, "2026-11-27T02:25:56Z", "준비하고 있어요."),
    reviewForm(160, "2026-11-27T02:29:46Z"),
    reply(162, "2026-11-27T02:30:05Z", "계속 준비하고 있어요."),
    reviewForm(164, "2026-11-27T02:32:21Z"),
    reply(170, "2026-11-27T02:40:00Z", "확인해 주세요.\n\n[[form:164]]"),
  ];
  const running = admin({ messages, runs: [{ ...base, id: "run", kind: "browser_run", status: "running", created_at: "2026-11-27T02:35:00Z" }] });
  assert.deepEqual(await read(running, "2026-11-27T02:41:00Z"), [], "held while another preparation runs");
  const quiet = admin({ messages, runs: [{ ...base, id: "run", kind: "browser_run", status: "completed", created_at: "2026-11-27T02:35:00Z" }] });
  assert.deepEqual(await read(quiet, "2026-11-27T02:41:00Z"), [155, 160]);
  // An answered form is no longer open, so it is not brought back.
  const answered = admin({ messages, open: [messages[2]], runs: [] });
  assert.deepEqual(await read(answered, "2026-11-27T02:41:00Z"), [160]);
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
