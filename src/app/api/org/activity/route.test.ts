import assert from "node:assert/strict";
import Module from "node:module";
import { before, test } from "node:test";
import type { NextRequest } from "next/server";

const workspaceId = "10000000-0000-4000-8000-000000000001";
const roleId = "20000000-0000-4000-8000-000000000001";
const talentId = "30000000-0000-4000-8000-000000000001";
const createdAt = "2026-10-21T00:00:00Z";
let allowed = true;
const scopes: Array<[string, string, unknown]> = [];
const rows: Record<string, unknown[]> = {
  talent_progress: [
    {
      id: "presented",
      talent_id: talentId,
      kind: "intro_to_company",
      created_at: createdAt,
    },
    {
      id: "reply",
      talent_id: talentId,
      kind: "org_candidate_activity",
      metadata: { eventType: "candidate_response_received" },
      text: "Available next week.",
      created_at: createdAt,
    },
    {
      id: "private",
      talent_id: "not-visible",
      kind: "intro_to_company",
      created_at: createdAt,
    },
    {
      id: "unknown",
      talent_id: talentId,
      kind: "org_candidate_activity",
      metadata: null,
      created_at: createdAt,
    },
  ],
  company_intro_candidates: [
    {
      id: "ready",
      talent_id: talentId,
      status: "ready",
      candidate_sent_at: null,
      talent_decision_at: null,
    },
    {
      id: "accepted",
      talent_id: talentId,
      status: "connected",
      candidate_sent_at: createdAt,
      talent_decision_at: createdAt,
    },
  ],
  meeting_schedules: [
    {
      id: "draft",
      talent_id: talentId,
      status: "draft",
      active_round_id: null,
    },
    {
      id: "confirmed",
      talent_id: talentId,
      status: "confirmed",
      confirmed_start_at: createdAt,
      updated_at: createdAt,
      title: "Interview",
      active_round_id: null,
    },
  ],
};
class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}
const admin = {
  from(table: string) {
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        scopes.push([table, column, value]);
        return query;
      },
      in: () => query,
      order: () => query,
      limit: async () => ({ data: rows[table] ?? [], error: null }),
    };
    return query;
  },
};
let GET: typeof import("./route").GET;
before(async () => {
  const mod = Module as any;
  const original = mod._load;
  const mocks: Record<string, unknown> = {
    "@/lib/server/candidateAccess": {
      requireAuthenticatedUser: async () => ({ id: "reviewer" }),
      getSupabaseAdmin: () => admin,
    },
    "@/lib/org/server": {
      OrgHttpError: HttpError,
      assertOrgRoleAccess: async (args: any) => {
        assert.equal(args.workspaceId, workspaceId);
        assert.equal(args.roleId, roleId);
        assert.equal(args.permission, "view");
        if (!allowed) throw new HttpError(403, "Forbidden");
      },
      fetchOrgBoard: async () => ({
        items: [
          {
            talentId,
            recommendationId: "recommendation",
            talent: { name: "Fixture Candidate" },
          },
        ],
      }),
    },
  };
  mod._load = function (request: string, parent: unknown, isMain: boolean) {
    return request in mocks
      ? mocks[request]
      : original.call(this, request, parent, isMain);
  };
  try {
    ({ GET } = await import("./route"));
  } finally {
    mod._load = original;
  }
});
const request = () =>
  GET({
    nextUrl: new URL(
      `https://example.test/api/org/activity?workspaceId=${workspaceId}&roleId=${roleId}`
    ),
  } as NextRequest);

test("role feed uses visible candidates and actual delivery/decision evidence", async () => {
  const response = await request();
  assert.equal(response.status, 200);
  const { items } = await response.json();
  assert.deepEqual(
    items.map((item: any) => item.kind).sort(),
    [
      "candidate_response",
      "intro_accepted",
      "intro_sent",
      "meeting_confirmed",
      "pending_connection",
    ].sort()
  );
  assert.ok(items.every((item: any) => item.talentId === talentId));
  assert.equal(
    items.find((item: any) => item.kind === "candidate_response").text,
    "Available next week."
  );
  assert.ok(
    scopes.some(
      ([table, column, value]) =>
        table === "talent_progress" &&
        column === "open_to_company" &&
        value === true
    )
  );
  for (const table of Object.keys(rows))
    assert.ok(
      scopes.some(
        ([name, column, value]) =>
          name === table && column === "role_id" && value === roleId
      )
    );
});

test("role feed denies access before querying progress", async () => {
  allowed = false;
  const count = scopes.length;
  assert.equal((await request()).status, 403);
  assert.equal(scopes.length, count);
});
