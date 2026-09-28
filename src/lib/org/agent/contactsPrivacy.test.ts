import assert from "node:assert/strict";
import test from "node:test";
import { readOrgAgentContacts, restrictUnsharedContactEvidence } from "./contacts";

test("pre-acceptance correspondence does not expose address, raw Career source, or private document", () => {
  const row = {
    id: "request", role_id: "role", talent_id: "talent",
    talent: { name: "Synthetic", email: "private@example.invalid" },
    talent_source_message_id: 91, document_id: "private-document",
    delivery_body: "회사의 질문", draft_revision: 2,
    relays: [{ id: "relay", relay_content: "회사에 공유하도록 허락한 답변" }],
  };
  const result = restrictUnsharedContactEvidence(row, new Set(["role:talent"]));
  assert.deepEqual(result.talent, { name: "Synthetic", email: null });
  assert.equal(result.talent_source_message_id, null);
  assert.equal(result.document_id, null);
  assert.equal(result.delivery_body, row.delivery_body);
  assert.equal(result.draft_revision, 2);
  assert.deepEqual(result.relays, row.relays);
  assert.equal(row.talent.email, "private@example.invalid", "input is not mutated");
  assert.equal(restrictUnsharedContactEvidence(row, new Set(["other:talent"])), row, "scope is role-specific");
  assert.equal(restrictUnsharedContactEvidence(row, new Set()), row, "existing shared-contact behavior is preserved");
});

test("actual contact reader skips private source queries and returns only delivered relay evidence before sharing", async () => {
  const id = "00000000-0000-4000-8000-000000000401";
  const sent = "2026-09-24T03:00:00Z";
  const row = {
    id, role_id: "role", talent_id: "talent", contact_kind: "contact",
    talent: { name: "Synthetic", email: "private@example.invalid" },
    role: { name: "Backend", status: "active" },
    talent_source_message_id: 91, document_id: "private-document",
    workflow_status: "awaiting_talent", delivery_body: "회사의 질문", delivery_subject: "질문",
    relays: [{ id: "relay", created_at: sent, source_talent_message_id: 91,
      deliveries: [{ type: "company_contact_company_delivery", status: "sent", sent_at: sent, updated_at: sent, payload: { delivery: { body: "공유를 허락한 답변" } } }],
    }],
  };
  const queried: string[] = [];
  const admin = { from(table: string) {
    queried.push(table);
    const data = table === "company_user_workspace" ? { id: "membership", authority: "owner" }
      : table === "company_intro_candidates" ? [{ role_id: "role", talent_id: "talent", status: "awaiting_talent" }]
        : table === "company_talent_requests" ? [row]
          : table === "company_talent_relays" ? row.relays.map((relay) => ({ ...relay, company_talent_request_id: id })) : undefined;
    if (data === undefined) throw Error(`Private or unexpected table read: ${table}`);
    const query: any = { then: (resolve: any, reject: any) => Promise.resolve({ data, error: null }).then(resolve, reject) };
    for (const method of ["select", "eq", "in", "is", "order", "limit", "range", "maybeSingle"]) query[method] = () => query;
    return query;
  } };
  const result = await readOrgAgentContacts({ admin: admin as any, user: { id: "user" } as any, workspaceId: "workspace", contactRefs: [`contact:${id}`] });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].candidate.email, null);
  const serialized = JSON.stringify(result);
  assert.ok(serialized.includes("공유를 허락한 답변"));
  assert.ok(!serialized.includes("private@example.invalid"));
  assert.ok(!serialized.includes("private-document"));
  assert.ok(!queried.includes("talent_messages"));
  assert.ok(!queried.includes("talent_documents"));
});
