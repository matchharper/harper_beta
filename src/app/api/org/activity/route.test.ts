import assert from "node:assert/strict";
import Module from "node:module";
import { before, test } from "node:test";
import type { NextRequest } from "next/server";

const workspaceId = "10000000-0000-4000-8000-000000000001";
const roleId = "20000000-0000-4000-8000-000000000001";
const secondRoleId = "20000000-0000-4000-8000-000000000002";
const hiddenRoleId = "20000000-0000-4000-8000-000000000003";
const talentId = "30000000-0000-4000-8000-000000000001";
const createdAt = "2026-10-21T00:00:00Z";
let allowed = true;
const scopes: Array<[string, string, unknown]> = [];
const rows: Record<string, unknown[]> = {
  talent_progress: [
    {
      id: "presented",
      role_id: roleId,
      talent_id: talentId,
      kind: "intro_to_company",
      created_at: createdAt,
    },
    {
      id: "reply",
      role_id: roleId,
      talent_id: talentId,
      kind: "org_candidate_activity",
      metadata: { eventType: "candidate_response_received" },
      text: "Available next week.",
      created_at: createdAt,
    },
    {
      id: "private",
      role_id: roleId,
      talent_id: "not-visible",
      kind: "intro_to_company",
      created_at: createdAt,
    },
    {
      id: "unknown",
      role_id: roleId,
      talent_id: talentId,
      kind: "org_candidate_activity",
      metadata: null,
      created_at: createdAt,
    },
  ],
  company_intro_candidates: [
    {
      id: "ready",
      role_id: roleId,
      talent_id: talentId,
      status: "ready",
      candidate_sent_at: null,
      talent_decision_at: null,
    },
    {
      id: "accepted",
      role_id: roleId,
      talent_id: talentId,
      status: "connected",
      candidate_sent_at: createdAt,
      talent_decision_at: createdAt,
    },
  ],
  meeting_schedules: [
    {
      id: "draft",
      role_id: roleId,
      talent_id: talentId,
      status: "draft",
      active_round_id: null,
    },
    {
      id: "confirmed",
      role_id: roleId,
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
      in: (column: string, value: unknown) => {
        scopes.push([table, column, value]);
        return query;
      },
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
      fetchOrgBoard: async (args: { roleId?: string; workspaceId: string }) => {
        assert.equal(args.workspaceId, workspaceId);
        if (!allowed) throw new HttpError(403, "Forbidden");
        return {
          items: [
            {
              roleId,
              roleName: "Backend Engineer",
              talentId,
              recommendationId: "recommendation",
              talent: { name: "Fixture Candidate" },
            },
            ...(!args.roleId
              ? [
                  {
                    roleId: secondRoleId,
                    roleName: "Research Engineer",
                    talentId,
                    recommendationId: "second-recommendation",
                    talent: { name: "Fixture Candidate" },
                  },
                ]
              : []),
          ],
        };
      },
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
const request = (all = false) =>
  GET({
    nextUrl: new URL(
      `https://example.test/api/org/activity?workspaceId=${workspaceId}${all ? "" : `&roleId=${roleId}`}`
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
          name === table &&
          column === "role_id" &&
          Array.isArray(value) &&
          value.length === 1 &&
          value[0] === roleId
      )
    );
});

test("All merges visible roles and keeps the same candidate scoped to each role", async () => {
  rows.talent_progress.push(
    {
      id: "second-role-reply",
      role_id: secondRoleId,
      talent_id: talentId,
      kind: "org_candidate_activity",
      metadata: { eventType: "candidate_response_received" },
      text: "Research role reply",
      created_at: createdAt,
    },
    {
      id: "hidden-role-reply",
      role_id: hiddenRoleId,
      talent_id: talentId,
      kind: "org_candidate_activity",
      metadata: { eventType: "candidate_response_received" },
      text: "Not visible",
      created_at: createdAt,
    }
  );
  const response = await request(true);
  assert.equal(response.status, 200);
  const {
    items,
  }: { items: import("@/lib/org/homeActivity").OrgHomeActivity[] } =
    await response.json();
  assert.equal(
    items.find((item) => item.id === "second-role-reply")?.recommendationId,
    "second-recommendation"
  );
  assert.equal(
    items.find((item) => item.id === "second-role-reply")?.roleName,
    "Research Engineer"
  );
  assert.equal(
    items.find((item) => item.id === "reply")?.recommendationId,
    "recommendation"
  );
  assert.ok(!items.some((item) => item.roleId === hiddenRoleId));
  assert.equal(
    items.find((item) => item.kind === "meeting_confirmed")?.meetingStartsAt,
    createdAt
  );
  for (const table of Object.keys(rows))
    assert.ok(
      scopes.some(
        ([name, column, value]) =>
          name === table &&
          column === "role_id" &&
          Array.isArray(value) &&
          value.includes(roleId) &&
          value.includes(secondRoleId) &&
          !value.includes(hiddenRoleId)
      )
    );
});

test("role feed denies access before querying progress", async () => {
  allowed = false;
  const count = scopes.length;
  assert.equal((await request()).status, 403);
  assert.equal((await request(true)).status, 403);
  assert.equal(scopes.length, count);
});
