import assert from "node:assert/strict";
import test from "node:test";
import { serializeTalentPendingRequest } from "@/lib/companyTalentRequests/presentation";

function request(expectsDocument: boolean) {
  return {
    company_workspace_id: "workspace-id",
    created_at: "2026-08-06T00:00:00.000Z",
    document_id: null,
    expects_document: expectsDocument,
    expires_at: "2026-08-20T00:00:00.000Z",
    id: "request-id",
    recommendation_id: "recommendation-id",
    request_context:
      "현재 바로 이직하실 생각이 있으신지, 아니라면 어느 시기부터 어느 정도로 새 기회를 찾아보고 계신지",
    role: { name: "Forward Deployed Engineer" },
    role_id: "role-id",
    talent_id: "talent-id",
    workflow_status: "awaiting_talent",
    workspace: { company_name: "Wonderful" },
  };
}

test("candidate question context discloses the requesting company and role", () => {
  const serialized = serializeTalentPendingRequest(request(false));

  assert.match(serialized ?? "", /company: Wonderful/);
  assert.match(serialized ?? "", /role: Forward Deployed Engineer/);
  assert.match(serialized ?? "", /현재 바로 이직하실 생각/);
  assert.match(serialized ?? "", /어느 정도로 새 기회를/);
});

test("candidate resume context also discloses the requesting company and role", () => {
  const serialized = serializeTalentPendingRequest(request(true));

  assert.match(serialized ?? "", /company: Wonderful/);
  assert.match(serialized ?? "", /role: Forward Deployed Engineer/);
  assert.match(serialized ?? "", /share a current resume/);
});
