import assert from "node:assert/strict";
import Module from "node:module";
import { before, test } from "node:test";
import { OrgHttpError as HttpError } from "@/lib/org/httpError";
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
// Small PostgREST reader fixture: exercise the real route, service and source mapping.
const admin = {
  from(table: string) {
    let selected = (rows[table] ?? []) as any[];
    const field = (row: any, column: string) =>
      column.includes("->>")
        ? row.metadata?.[column.split("->>")[1]]
        : column.split(".").reduce((value, key) => value?.[key], row);
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        scopes.push([table, column, value]);
        // These fixtures belong to this workspace and contain company-visible progress.
        if (!["company_workspace_id", "open_to_company"].includes(column))
          selected = selected.filter((row) => field(row, column) === value);
        return query;
      },
      in: (column: string, value: unknown[]) => {
        scopes.push([table, column, value]);
        selected = selected.filter((row) => value.includes(field(row, column)));
        return query;
      },
      lte: (column: string, value: string) => {
        selected = selected.filter(
          (row) =>
            field(row, column) &&
            Date.parse(field(row, column)) <= Date.parse(value)
        );
        return query;
      },
      or: (filter: string) => {
        if (filter.startsWith("kind.eq."))
          selected = selected.filter(
            (row) =>
              row.kind === "intro_to_company" ||
              (row.kind === "org_candidate_activity" &&
                [
                  "candidate_message_delivered",
                  "candidate_response_received",
                  "candidate_contact_sent",
                ].includes(row.metadata?.eventType))
          );
        if (filter.startsWith("status.neq."))
          selected = selected.filter(
            (row) => row.status !== "confirmed" || !row.confirmed_start_at
          );
        return query;
      },
      not: (column: string) => {
        selected = selected.filter((row) => field(row, column) != null);
        return query;
      },
      order: () => query,
      limit: async (limit: number) => ({
        data: selected.slice(0, limit),
        error: null,
      }),
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
      fetchRoleRowsForWorkspace: async () => {
        if (!allowed) throw new HttpError(403, "Forbidden");
        return [{ role_id: roleId }, { role_id: secondRoleId }];
      },
      fetchOrgBoard: async (args: {
        roleId?: string;
        workspaceId: string;
        talentIds: string[];
      }) => {
        assert.equal(args.workspaceId, workspaceId);
        if (!allowed) throw new HttpError(403, "Forbidden");
        assert.ok(args.talentIds.includes(talentId));
        return {
          items: [
            ...(args.roleId === roleId
              ? [
                  {
                    roleId,
                    roleName: "Backend Engineer",
                    talentId,
                    recommendationId: "recommendation",
                    talent: { name: "Fixture Candidate" },
                  },
                ]
              : []),
            ...(args.roleId === secondRoleId
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
  mocks["./server"] = mocks["@/lib/org/server"];
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

test("All and role feeds distinguish outgoing questions and incoming standalone or linked messages", async () => {
  const original = rows.talent_progress;
  const cases = [
    [
      "question",
      {
        eventType: "candidate_contact_sent",
        requestId: "q",
        requestKind: "question",
      },
      "company_question",
    ],
    [
      "contact",
      {
        eventType: "candidate_contact_sent",
        requestId: "c",
        requestKind: "contact",
      },
      "company_message",
    ],
    [
      "resume",
      {
        eventType: "candidate_contact_sent",
        requestId: "r",
        requestKind: "resume",
      },
      "company_resume_request",
    ],
    [
      "new-message",
      { eventType: "candidate_message_delivered", relayId: "relay-1" },
      "candidate_message",
    ],
    [
      "reply-relay",
      {
        eventType: "candidate_message_delivered",
        relayId: "relay-2",
        requestId: "q",
      },
      "candidate_response",
    ],
    [
      "legacy-reply",
      { eventType: "candidate_response_received", requestId: "q" },
      "candidate_response",
    ],
  ] as const;
  rows.talent_progress = cases.map(([id, metadata]) => ({
    id,
    metadata,
    role_id: roleId,
    talent_id: talentId,
    kind: "org_candidate_activity",
    text: `Exact body: ${id}`,
    created_at: createdAt,
  }));
  try {
    for (const all of [false, true]) {
      const response = await request(all);
      assert.equal(response.status, 200);
      const { items } = await response.json();
      for (const [id, , expected] of cases) {
        const item = items.find((item: any) => item.id === id);
        assert.equal(item?.kind, expected);
        assert.equal(item?.text, `Exact body: ${id}`);
        assert.equal(item?.recommendationId, "recommendation");
      }
    }
  } finally {
    rows.talent_progress = original;
  }
});

test("server applies search and type filters and rejects malformed queries", async () => {
  const run = (suffix: string) =>
    GET({
      nextUrl: new URL(
        `https://example.test/api/org/activity?workspaceId=${workspaceId}${suffix}`
      ),
    } as NextRequest);
  const response = await run("&search=Research&kind=messages");
  assert.equal(response.status, 200);
  const page = await response.json();
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].roleId, secondRoleId);
  assert.equal(page.nextCursor, null);
  assert.equal((await run("&cursor=not-a-cursor")).status, 400);
  assert.equal((await run("&kind=unknown")).status, 400);
  assert.equal((await run(`&roleId=${hiddenRoleId}`)).status, 404);
});

test("role feed denies access before querying progress", async () => {
  allowed = false;
  const count = scopes.length;
  assert.equal((await request()).status, 403);
  assert.equal((await request(true)).status, 403);
  assert.equal(scopes.length, count);
});
