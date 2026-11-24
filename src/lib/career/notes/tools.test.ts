import assert from "node:assert/strict";
import test from "node:test";

// The tool module reaches the LLM client, which needs a key to construct; nothing calls it.
async function noteTools() {
  process.env.OPENAI_API_KEY ??= "synthetic-no-network";
  return (await import("./tools")).CAREER_NOTE_TOOLS;
}

const NOTE_ID = "b4ecb18b-dfbf-462d-9637-4930b62e42c0";

// Every table read answers with no rows; RPC calls are recorded.
function fakeAdmin(rpcCalls: Record<string, unknown>[]) {
  const chain: any = new Proxy(function () {}, {
    get(_target, prop) {
      if (prop === "then") return (resolve: (value: unknown) => void) => resolve({ data: [], error: null });
      if (prop === "maybeSingle" || prop === "single") return async () => ({ data: null, error: null });
      return chain;
    },
    apply: () => chain,
  });
  return {
    from: () => chain,
    rpc: async (_name: string, args: Record<string, unknown>) => {
      rpcCalls.push(args);
      return { data: { id: NOTE_ID, kind: "work", title: "t", content: "c", revision: 1, matching_id: null, company_workspace_id: null }, error: null };
    },
  };
}
const context = (admin: unknown) => ({ admin, userId: "00000000-0000-0000-0000-000000000001", toolCallId: "call-1" }) as never;

test("upsert_note without an action says which actions exist instead of reaching the database", async () => {
  const CAREER_NOTE_TOOLS = await noteTools();
  const calls: Record<string, unknown>[] = [];
  await assert.rejects(
    CAREER_NOTE_TOOLS.upsert_note.execute!({ kind: "work", title: "t", content: "c" }, context(fakeAdmin(calls))),
    /action must be create, update or delete/
  );
  assert.equal(calls.length, 0);
});

test("a blank matchingId is treated as omitted when writing a note", async () => {
  const CAREER_NOTE_TOOLS = await noteTools();
  const calls: Record<string, unknown>[] = [];
  await CAREER_NOTE_TOOLS.upsert_note.execute!({ action: "create", kind: "work", title: "t", content: "c", matchingId: "" }, context(fakeAdmin(calls)));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].p_matching, null);
});

test("a note or matching ID that is not a UUID is reported as unavailable", async () => {
  const CAREER_NOTE_TOOLS = await noteTools();
  const calls: Record<string, unknown>[] = [];
  await assert.rejects(CAREER_NOTE_TOOLS.read_notes.execute!({ matchingId: "none" }, context(fakeAdmin(calls))), /^Error: Matching none is unavailable\.$/);
  await assert.rejects(CAREER_NOTE_TOOLS.read_notes.execute!({ noteId: "none" }, context(fakeAdmin(calls))), /^Error: Note none is unavailable\.$/);
  await assert.rejects(
    CAREER_NOTE_TOOLS.upsert_note.execute!({ action: "update", noteId: "latest", append: "x" }, context(fakeAdmin(calls))),
    /^Error: Note latest is unavailable\.$/
  );
  assert.equal(calls.length, 0);
});
