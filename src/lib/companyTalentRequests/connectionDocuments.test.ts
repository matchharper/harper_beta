import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchRelayableCompanyTalentConnections,
  formatRelayableCompanyTalentConnections,
} from "./server";

test("connection history distinguishes shared, absent and unknown resume evidence", async () => {
  const projections = new Map<string, string>();
  const rows: Record<string, unknown[]> = {
    talent_opportunity_recommendation: [
      {
        id: "recommendation-1",
        role_id: "role-1",
        feedback: "like",
        opportunity_type: "intro_request",
        created_at: "2026-10-01T00:00:00Z",
        role: {
          name: "Backend",
          status: "active",
          information: {},
          workspace: { company_name: "Synthetic" },
        },
      },
    ],
    talent_opportunity_tag: [],
    company_intro_candidates: [
      {
        recommendation_id: "recommendation-1",
        status: "connected",
        connected_at: "2026-10-01T00:00:00Z",
      },
    ],
    company_talent_requests: [],
    talent_progress: [],
    company_talent_relays: [
      {
        id: "r3",
        recommendation_id: "recommendation-1",
        relay_content: "No resume",
        document_id: null,
        created_at: "2026-10-03T00:00:00Z",
      },
      {
        id: "r2",
        recommendation_id: "recommendation-1",
        relay_content: "With resume",
        document_id: "document-1",
        created_at: "2026-10-02T00:00:00Z",
      },
      {
        id: "r1",
        recommendation_id: "recommendation-1",
        relay_content: "Unknown document evidence",
        created_at: "2026-10-01T00:00:00Z",
      },
    ],
  };
  const admin = {
    from(table: string) {
      assert.ok(table in rows);
      const query: any = {
        select(columns: string) {
          projections.set(table, columns);
          return query;
        },
        eq() {
          return query;
        },
        in() {
          return query;
        },
        or() {
          return query;
        },
        order() {
          return query;
        },
        limit() {
          return query;
        },
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve({ data: rows[table], error: null }).then(
            resolve
          );
        },
      };
      return query;
    },
  };
  const connections = await fetchRelayableCompanyTalentConnections({
    admin: admin as any,
    talentId: "synthetic-talent",
  });
  assert.equal(connections.length, 1);
  assert.ok(
    projections
      .get("company_talent_relays")
      ?.split(", ")
      .includes("document_id")
  );
  assert.deepEqual(
    connections[0].recentContacts.map((contact) => contact.documentId),
    [undefined, "document-1", null]
  );
  const formatted = formatRelayableCompanyTalentConnections(connections);
  assert.ok(formatted.includes("No resume (이 연락에 공유된 이력서 없음)"));
  assert.ok(
    formatted.includes("With resume (이 연락에 공유된 이력서 ID: document-1)")
  );
  assert.ok(
    formatted
      .split("\n")
      .find((line) => line.includes("Unknown document evidence"))
      ?.endsWith("Unknown document evidence")
  );
});
