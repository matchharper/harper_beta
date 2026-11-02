import assert from "node:assert/strict";
import test from "node:test";
import Module from "node:module";
import { NextRequest } from "next/server";

test("Stop API preserves partial work, ownership, concurrent metadata and pre-SSE cancellation", async () => {
  const modules = Module as unknown as { _load: (...args: any[]) => any };
  const originalLoad = modules._load;
  let user: { id: string } | null = { id: "owner" };
  let race = true;
  const rows: any[] = [
    { id: 42, user_id: "owner", conversation_id: "chat", role: "user", content: "Save my resume", payload: { original: true }, thinking_logs: [] },
    { id: 90, user_id: "owner", conversation_id: "chat", role: "assistant", content: "Visible partial text", payload: { careerTurnSourceMessageId: 89 }, thinking_logs: [] },
  ];
  const cancelled: number[] = [];
  const admin = { from: (table: string) => {
    const filters: Array<(row: any) => boolean> = [];
    let patch: any, inserted: any;
    const get = (row: any, key: string) => key.split("->>").reduce((v, part) => v?.[part], row);
    const perform = () => {
      if (inserted) { const row = { ...inserted, id: rows.length + 100, created_at: "2026-10-31T00:00:00Z" }; rows.push(row); return { data: [row], error: null }; }
      const found = (table === "talent_conversations" ? [{ id: "chat", user_id: "owner" }] : rows)
        .filter(row => filters.every(filter => filter(row)));
      if (patch && race) {
        race = false; found[0].payload = { ...found[0].payload, concurrent: "preserved" };
        return { data: [], error: null };
      }
      if (patch) found.forEach(row => Object.assign(row, patch));
      return { data: structuredClone(found), error: null };
    };
    const q: any = {
      select: () => q, order: () => q, limit: () => q,
      eq: (key: string, value: any) => { filters.push(row => String(get(row, key)) === String(value)); return q; },
      neq: (key: string, value: any) => { filters.push(row => get(row, key) !== value); return q; },
      gt: (key: string, value: any) => { filters.push(row => get(row, key) > value); return q; },
      is: (key: string, value: any) => { filters.push(row => get(row, key) === value); return q; },
      filter: (key: string, _op: string, value: any) => { filters.push(row => JSON.stringify(get(row, key)) === value); return q; },
      update: (value: any) => { patch = value; return q; }, insert: (value: any) => { inserted = value; return q; },
      maybeSingle: async () => { const result = perform(); return { ...result, data: result.data[0] ?? null }; },
      single: async () => { const result = perform(); return { ...result, data: result.data[0] ?? null }; },
      then: (resolve: any, reject: any) => Promise.resolve(perform()).then(resolve, reject),
    };
    return q;
  } };
  const mocks: Record<string, any> = {
    "@/lib/supabaseServer": { getRequestUser: async () => user },
    "@/lib/talentOnboarding/server": {
      getTalentSupabaseAdmin: () => admin,
      toTalentMessageResponse: (row: any) => ({ id: row.id, role: row.role, content: row.content,
        thinkingLogs: row.thinking_logs, turnStopped: row.payload?.careerTurnStopped === true }),
    },
    "@/lib/career/turnCancellation.server": { cancelCareerTurnWork: async (scope: any) => { cancelled.push(scope.sourceMessageId); } },
  };
  modules._load = function (request: string, ...args: any[]) {
    return mocks[request] ?? originalLoad.call(this, request, ...args);
  };
  try {
    const { POST } = await import("./route");
    const stop = (body: any) => POST(new NextRequest("http://localhost/api/talent/chat/stop", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }));
    const body = { conversationId: "chat", userMessageId: 42, assistantMessage: { content: "Visible partial text", thinkingLogs: ["Reading a document"] } };
    const response = await stop(body);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.userMessage.turnStopped, true);
    assert.deepEqual(rows[0].payload, { original: true, concurrent: "preserved", careerTurnStopped: true });
    assert.deepEqual(result.userMessage.thinkingLogs, []);
    assert.equal(result.assistantMessage.content, "Visible partial text");
    assert.notEqual(result.assistantMessage.id, 90, "another request's identical text must not be reused");
    const count = rows.length;
    assert.equal((await stop(body)).status, 200);
    assert.equal(rows.length, count, "repeated Stop does not duplicate the partial answer");
    assert.deepEqual(cancelled, [42, 42]);
    const exactContent = "\n  Indented partial reply\n\n";
    rows.push({ id: 400, user_id: "owner", conversation_id: "chat", role: "assistant", content: exactContent,
      payload: { careerTurnSourceMessageId: 42 }, thinking_logs: [] });
    const exactCount = rows.length;
    const exact = await stop({ ...body, assistantMessage: { content: exactContent } });
    assert.equal(exact.status, 200);
    assert.equal((await exact.json()).assistantMessage.content, exactContent);
    assert.equal(rows.length, exactCount, "already saved text must not be duplicated after trimming");

    user = { id: "other" };
    assert.equal((await stop(body)).status, 404);
    assert.equal((await stop({ conversationId: "chat", clientRequestId: "00000000-0000-4000-8000-000000000001" })).status, 404);
    assert.equal(rows.length, exactCount);
    user = null;
    assert.equal((await stop(body)).status, 401);

    user = { id: "owner" };
    const early = await stop({ conversationId: "chat", clientRequestId: "00000000-0000-4000-8000-000000000001" });
    assert.equal(early.status, 200);
    assert.equal((await early.json()).userMessage, null);
    assert.equal(rows.at(-1).message_type, "career_turn_stop");
    assert.equal(rows.at(-1).payload.hidden, true);
  } finally { modules._load = originalLoad; }
});
