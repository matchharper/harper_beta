import test from "node:test";
import assert from "node:assert/strict";
import { prepareAttachments, readPinnedAttachment } from "./attachments";

test("review bytes survive source edits; deletion, ownership and hash mismatch stop reuse", async () => {
  const userId = "00000000-0000-4000-8000-000000000001";
  const documentId = "00000000-0000-4000-8000-000000000002";
  const snapshotId = "00000000-0000-4000-8000-000000000003";
  const conversationId = "00000000-0000-4000-8000-000000000004";
  const doc: any = { id: documentId, talent_id: userId, is_deleted: false, revision: 1, file_name: "resume.pdf", kind: "resume", content_type: "application/pdf", storage_path: "original", origin_type: "user_upload" };
  const rows: any[] = [];
  const files = new Map<string, Buffer>([["original", Buffer.from("reviewed bytes")]]);
  const admin: any = {
    rpc: async (_: string, p: any) => {
      let row = rows.find(row => row.idempotency_key === p.p_idempotency_key);
      if (!row) { row = { id: snapshotId, user_id: userId, conversation_id: conversationId, parent_id: null, kind: p.p_kind,
        idempotency_key: p.p_idempotency_key, revision: 1, status: "reserved", request: p.p_request, result: {}, provider_refs: {}, created_at: "2026-11-03", updated_at: "2026-11-03" }; rows.push(row); }
      return { data: structuredClone(row), error: null };
    },
    from(table: string) {
      const filters: [string, unknown][] = []; let values: any;
      const query: any = { select: () => query, eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
        update: (value: any) => { values = value; return query; }, maybeSingle: async () => {
          const row = (table === "talent_documents" ? [doc] : rows).find(row => filters.every(([key, value]) => row[key] === value));
          if (row && values) Object.assign(row, values);
          return { data: row ? structuredClone(row) : null, error: null };
        } };
      return query;
    },
    storage: { from: () => ({
      download: async (path: string) => ({ data: files.has(path) ? new Blob([new Uint8Array(files.get(path)!)]) : null, error: null }),
      upload: async (path: string, bytes: Buffer) => { files.set(path, Buffer.from(bytes)); return { error: null }; },
    }) },
  };
  const context = { admin, userId, conversationId, requestId: "review" };
  const [reviewed] = await prepareAttachments(context, [{ document_id: documentId, revision: 1 }]);
  assert.equal(reviewed.snapshotId, snapshotId);
  doc.revision = 2; files.set("original", Buffer.from("new unreviewed bytes"));
  const [selected] = await prepareAttachments(context, [{ document_id: documentId, revision: 1, snapshot_id: snapshotId }]);
  assert.equal(selected.bytes.toString(), "reviewed bytes");
  await assert.rejects(prepareAttachments(context, [{ document_id: documentId, revision: 1 }]), /revision changed/);
  await assert.rejects(readPinnedAttachment({ ...context, userId: conversationId }, snapshotId), /snapshot unavailable/);
  doc.is_deleted = true;
  await assert.rejects(readPinnedAttachment(context, snapshotId), /source was removed/);
  doc.is_deleted = false; files.set(`${userId}/agent-attachments/${snapshotId}`, Buffer.from("corrupt"));
  await assert.rejects(readPinnedAttachment(context, snapshotId), /integrity mismatch/);
});
