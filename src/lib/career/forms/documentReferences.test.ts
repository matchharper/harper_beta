import assert from "node:assert/strict";
import test from "node:test";
import { executeSuggestForm, respondToCareerForm } from "./server";
import { getCareerFormContent } from "./schema";

const userId = "00000000-0000-4000-8000-000000000001";
const conversationId = "00000000-0000-4000-8000-000000000002";
const documentId = "00000000-0000-4000-8000-000000000003";

function fixture() {
  const document = { id: documentId, talent_id: userId, is_deleted: false, revision: 1, file_name: "Application resume", origin_type: "harper_authored_document" };
  const rows: any[] = [];
  const snapshots: any[] = [];
  const admin: any = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const query: any = {
        select: () => query, order: () => query, limit: () => query,
        eq: (key: string, value: unknown) => { filters[key] = value; return query; },
        in: (_key: string, ids: string[]) => { assert.deepEqual(ids, [documentId]); return query; },
        contains: (_key: string, value: unknown) => { filters.payload = value; return query; },
        then: (resolve: (value: unknown) => unknown) => {
          assert.equal(table, "talent_documents");
          assert.equal(filters.talent_id, userId);
          assert.equal(filters.is_deleted, false);
          return Promise.resolve({ data: document.is_deleted ? [] : [document], error: null }).then(resolve);
        },
        maybeSingle: async () => ({ data: table === "talent_conversations" ? { id: conversationId }
          : table === "talent_documents" ? (filters.id === document.id && filters.talent_id === document.talent_id && !document.is_deleted ? structuredClone(document) : null)
          : table === "talent_external_operations" ? snapshots.find(row => row.id === filters.id && row.user_id === filters.user_id) ?? null
          : rows.find(row => row.message_type === filters.message_type) ?? null, error: null }),
      };
      return query;
    },
    rpc: async (name: string, args: any) => {
      if (name === "read_career_form_status") return { data: "open", error: null };
      assert.equal(name, "write_career_form");
      const row = { id: 42 + rows.length, role: args.p_action === "respond" ? "user" : "assistant", user_id: userId, conversation_id: conversationId,
        message_type: args.p_action === "respond" ? "career_form_response" : "career_form", content: args.p_content,
        payload: { ...args.p_payload, formId: 42, revision: 1 }, created_at: "2026-11-05T00:00:00Z" };
      rows.push(row);
      return { data: row, error: null };
    },
  };
  const input = { action: "create", form: { kind: "form", title: "Application questions", items: [
    { id: "resume", label: "Resume", type: "document", content: { documentId, revision: 1 } },
    { id: "visa", label: "Visa sponsorship", type: "text", content: { value: "" } },
  ] } };
  return { document, rows, snapshots, input, scope: { admin, userId, conversationId, requestId: "test-form" } };
}

test("document and question presentation does not need PDF generation; a separate text answer still saves", async (t) => {
  const { scope, input, rows } = fixture();
  t.mock.method(globalThis, "fetch", async () => { throw new Error("No renderer or storage request is allowed for presentation"); });
  const result = await executeSuggestForm({ ...scope, input });
  assert.equal(result.form?.items.length, 2);
  assert.deepEqual(getCareerFormContent(result.form!.items[0]), { documentId, revision: 1, fileName: "Application resume" });
  assert.ok(result.modelOutput.includes(documentId) && result.modelOutput.includes("revision: 1"));
  assert.equal(rows.length, 1);
  const response = await respondToCareerForm({ ...scope, input: { conversationId, formId: 42, revision: 1,
    values: { visa: "No" }, requestId: "answer-1" } });
  assert.ok(response.content.includes("Visa sponsorship: No"));
  assert.equal(rows.length, 2);
});

test("a document edited after presentation cannot silently become the approved attachment", async (t) => {
  const { scope, input, document, rows } = fixture();
  await executeSuggestForm({ ...scope, input });
  document.revision = 2;
  t.mock.method(globalThis, "fetch", async () => { throw new Error("Revision conflict must precede export"); });
  await assert.rejects(respondToCareerForm({ ...scope, input: { conversationId, formId: 42, revision: 1,
    values: { resume: documentId }, requestId: "answer-2" } }), /Attachment revision changed/);
  assert.equal(rows.length, 1);
});

test("deleted and stale document references cannot create a misleading review", async () => {
  const { scope, input, document, rows } = fixture();
  document.revision = 2;
  await assert.rejects(executeSuggestForm({ ...scope, input }), /Document revision changed/);
  document.is_deleted = true;
  await assert.rejects(executeSuggestForm({ ...scope, input }), /Document not found/);
  assert.equal(rows.length, 0);
});

test("existing pinned files retain their reviewed revision without reading or rendering bytes", async (t) => {
  const { scope, input, document, snapshots } = fixture();
  const snapshotId = "00000000-0000-4000-8000-000000000004";
  const snapshot = { id: snapshotId, user_id: userId, conversation_id: conversationId, parent_id: null,
    kind: "attachment_snapshot", status: "ready", revision: 2, idempotency_key: "pinned", created_at: "2026-11-05", updated_at: "2026-11-05",
    request: { document_id: documentId, revision: 1, name: "Reviewed resume.pdf" }, result: {}, provider_refs: { storage_path: "unused" } };
  snapshots.push(snapshot);
  document.revision = 2;
  Object.assign(input.form.items[0].content, { snapshot_id: snapshotId });
  t.mock.method(globalThis, "fetch", async () => { throw new Error("Presentation only needs saved metadata"); });
  const result = await executeSuggestForm({ ...scope, input });
  assert.deepEqual(getCareerFormContent(result.form!.items[0]), {
    documentId, revision: 1, fileName: "Reviewed resume.pdf", snapshot_id: snapshotId,
  });
  snapshot.request.revision = 2;
  await assert.rejects(executeSuggestForm({ ...scope, input }), /snapshot does not match/);
  snapshot.user_id = conversationId;
  await assert.rejects(executeSuggestForm({ ...scope, input }), /snapshot unavailable/);
});
