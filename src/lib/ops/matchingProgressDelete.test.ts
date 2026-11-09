import assert from "node:assert/strict";
import Module from "node:module";
import { before, test } from "node:test";

// Deleting an item on the Ops matching timeline: a company note is deleted at
// its home (company_candidate_notes, with history), like on the company
// screen; any other progress row is deleted as before. No database is used.
type Call = { table: string; op: string; values?: unknown; filters: Array<[string, string, unknown]>; columns?: string };
let calls: Call[] = [];
let respond: (call: Call) => { data: unknown; error: unknown } = () => ({ data: [], error: null });
const admin = {
  from(table: string) {
    const call: Call = { table, op: "select", filters: [] };
    calls.push(call);
    const builder = {
      update(values: unknown) { call.op = "update"; call.values = values; return builder; },
      delete() { call.op = "delete"; return builder; },
      eq(column: string, value: unknown) { call.filters.push(["eq", column, value]); return builder; },
      is(column: string, value: unknown) { call.filters.push(["is", column, value]); return builder; },
      select(columns: string) { call.columns = columns; return builder; },
      then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) {
        return Promise.resolve().then(() => respond(call)).then(resolve, reject);
      },
    };
    return builder;
  },
};

let deleteOpsMatchingProgress: typeof import("./matching").deleteOpsMatchingProgress;
before(async () => {
  const mod = Module as any, original = mod._load;
  mod._load = function (name: string, ...rest: unknown[]) {
    if (name === "server-only") return {};
    if (name === "@/lib/server/candidateAccess") return { getSupabaseAdmin: () => admin };
    return original.call(this, name, ...rest);
  };
  ({ deleteOpsMatchingProgress } = await import("./matching"));
});

const note = "30000000-0000-4000-8000-000000000001";
const ids = { progressId: note, roleId: "role", talentId: "talent" };

test("a company note is closed in the notes table; the timeline copy is not deleted directly", async () => {
  calls = [];
  respond = (call) => ({ data: call.table === "company_candidate_notes" ? [{ id: note, role_id: "role", talent_id: "talent" }] : [], error: null });
  assert.deepEqual(await deleteOpsMatchingProgress(ids), { ok: true, progressId: note, roleId: "role", talentId: "talent" });
  assert.deepEqual(calls.map((call) => [call.table, call.op]), [["company_candidate_notes", "update"]]);
  const [update] = calls;
  assert.deepEqual(Object.keys(update.values as object), ["deleted_at"]);
  assert.ok(!Number.isNaN(Date.parse((update.values as { deleted_at: string }).deleted_at)));
  assert.deepEqual(update.filters, [["eq", "id", note], ["eq", "talent_id", "talent"], ["is", "deleted_at", null], ["eq", "role_id", "role"]]);
});

test("an Ops memo or other progress row is deleted as before", async () => {
  calls = [];
  respond = (call) => ({ data: call.table === "talent_progress" ? [{ id: note, role_id: "role", talent_id: "talent" }] : [], error: null });
  assert.deepEqual(await deleteOpsMatchingProgress(ids), { ok: true, progressId: note, roleId: "role", talentId: "talent" });
  assert.deepEqual(calls.map((call) => [call.table, call.op]), [["company_candidate_notes", "update"], ["talent_progress", "delete"]]);
  assert.deepEqual(calls[1].filters, [["eq", "id", note], ["eq", "talent_id", "talent"], ["eq", "role_id", "role"]]);

  // Without a Role, neither query is narrowed by Role.
  calls = [];
  await deleteOpsMatchingProgress({ progressId: note, talentId: "talent" });
  assert.ok(calls.every((call) => !call.filters.some(([, column]) => column === "role_id")));
});

test("nothing found, a note error and a company decision are refused", async () => {
  respond = () => ({ data: [], error: null });
  await assert.rejects(deleteOpsMatchingProgress(ids), /Progress를 찾을 수 없습니다/);
  calls = [];
  respond = (call) => ({ data: null, error: call.table === "company_candidate_notes" ? { message: "notes unavailable" } : null });
  await assert.rejects(deleteOpsMatchingProgress(ids), /notes unavailable/);
  assert.equal(calls.length, 1, "the copy is not deleted when the note could not be checked");
  calls = [];
  await assert.rejects(deleteOpsMatchingProgress({ ...ids, progressId: "company_decision:12" }), /회사 결정 기록은 지울 수 없습니다/);
  assert.equal(calls.length, 0);
});
