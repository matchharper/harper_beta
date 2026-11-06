import assert from "node:assert/strict";
import test from "node:test";
import { readSelectedOpportunityProgress } from "./selectedOpportunityProgress.server";
import { listWork, readWorkContext, workContext } from "./work/store";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const userId = id(1), conversationId = id(2), roleId = id(3);
function work(n: number, status = "waiting") {
  return { id: id(n), user_id: userId, conversation_id: conversationId, kind: "delegated_work", parent_id: null,
    idempotency_key: `application-${n}`, revision: 2, status, created_at: "2026-11-05T00:00:00Z", updated_at: "2026-11-05T01:00:00Z",
    request: { target: roleId, instruction: "Prepare the selected application", source_refs: [41] },
    result: { note: "Resume prepared; waiting for work authorization answer", refs: ["form-41"] }, provider_refs: { secret: "PRIVATE_TOKEN" } };
}
function fixture(works: ReturnType<typeof work>[] = [], saved: object | null = null, failedTable?: string) {
  const reads: Array<{ table: string; filters: Record<string, unknown> }> = [];
  const admin = { from(table: string) {
    const filters: Record<string, unknown> = {};
    reads.push({ table, filters });
    const predicates: Array<(row: any) => boolean> = [];
    let limit = Infinity;
    const value = (row: any, key: string) => key === "request->>target" ? row.request.target : row[key];
    const result = () => ({ error: table === failedTable ? { message: "Database unavailable" } : null,
      data: table === "talent_external_operations"
        ? works.filter(row => predicates.every(p => p(row))).sort((a, b) => b.id.localeCompare(a.id)).slice(0, limit)
        : table === "talent_opportunity_recommendation" ? saved : null });
    const query = { select: () => query, order: () => query,
      eq(key: string, expected: unknown) { filters[key] = expected; predicates.push(row => value(row, key) === expected); return query; },
      neq(key: string, expected: unknown) { predicates.push(row => value(row, key) !== expected); return query; },
      lt(key: string, before: string) { predicates.push(row => value(row, key) < before); return query; },
      limit(count: number) { limit = count; return query; },
      maybeSingle: async () => result(),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return query;
  } } as any;
  return { admin, userId, conversationId, reads };
}

test("empty work is explicit both in ordinary context and the selected role's history", async () => {
  const scope = fixture();
  assert.equal(await workContext(scope), "Unfinished work / suspended replies in this conversation: none.");
  const text = await readSelectedOpportunityProgress(scope, roleId);
  assert.equal(text, "Saved opportunity: none.\nWork history: none.");
});

test("matching work includes closed history and exact continuation references without crossing user, conversation or role", async () => {
  const scope = fixture([work(10), { ...work(11, "completed"), result: { note: "Submitted; confirmation received", refs: ["receipt-11"] } },
    { ...work(12), user_id: id(99) }, { ...work(13), conversation_id: id(99) },
    { ...work(14), request: { ...work(14).request, target: id(99) } }],
    { id: id(20), feedback: "positive", saved_stage: "applied" });
  const text = await readSelectedOpportunityProgress(scope, roleId);
  for (const fact of [id(10), id(11), "waiting", "completed", "Resume prepared", "confirmation received", "form-41", "receipt-11", `Saved opportunity ${id(20)}: applied.`, "revision 2", "2026-11-05 10:00"])
    assert.ok(text.includes(fact), fact);
  for (const excluded of [id(12), id(13), id(14), "PRIVATE_TOKEN"]) assert.ok(!text.includes(excluded));
  const selected = scope.reads.find(read => read.table === "talent_external_operations")!;
  assert.deepEqual(selected.filters, { user_id: userId, conversation_id: conversationId, kind: "delegated_work", "request->>target": roleId });
  assert.deepEqual(scope.reads.find(read => read.table === "talent_opportunity_recommendation")!.filters, { talent_id: userId, role_id: roleId });
});

test("a failed read is unknown, never no prior work or no saved opportunity", async () => {
  for (const table of ["talent_external_operations", "talent_opportunity_recommendation"]) {
    const text = await readSelectedOpportunityProgress(fixture([], null, table), roleId);
    assert.ok(text.includes("unknown (read failed)."));
    assert.ok(!text.includes(table === "talent_external_operations" ? "Work history: none." : "Saved opportunity: none."));
  }
});

test("partial work history keeps its target filter and continuation cursor", async () => {
  const scope = fixture(Array.from({ length: 22 }, (_, i) => work(i + 10, "completed")));
  const text = await readSelectedOpportunityProgress(scope, roleId);
  assert.ok(text.includes(`More: manage_work list; target ${roleId}; include_closed true; before ${id(12)}.`));
  assert.ok(!text.includes("Work history: none."));
  const next = await listWork(scope, id(12), true, roleId);
  assert.deepEqual(next.works.map(row => row.id), [id(11), id(10)]);
  assert.equal(next.nextCursor, null);
});

test("status indexes omit full instructions and reference work already supplied at the same revision", async () => {
  const row = work(10);
  row.request.instruction = "DETAILED_WORK_INSTRUCTION";
  const scope = fixture([row]);
  const index = await readWorkContext(scope);
  assert.ok(!index.text.includes("DETAILED_WORK_INSTRUCTION"));
  assert.ok(!index.text.includes("User sources:"));
  assert.ok(index.text.includes(row.result.note));
  const known = new Map(index.works.map(work => [work.id, work.revision]));
  const matching = await readSelectedOpportunityProgress(scope, roleId, known);
  assert.equal(matching, `Saved opportunity: none.\nWork in index above: ${row.id}.`);
  row.revision++;
  row.result.note = "New required answer arrived; preparation continues";
  const changed = await readSelectedOpportunityProgress(scope, roleId, known);
  assert.ok(changed.includes("revision 3"));
  assert.ok(changed.includes(row.result.note));
  assert.ok(!changed.includes("Work in index above:"));
});
