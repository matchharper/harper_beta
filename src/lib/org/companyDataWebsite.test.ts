import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  applyWebsiteCompanyDataChanges,
  normalizeWebsiteCompanyDataStringList,
  resolveWebsiteCompanyDataRpcChanges,
  WEBSITE_COMPANY_DATA_KEYS,
} from "./companyDataWebsite";

function createWebsiteMutationAdminFixture(args: {
  companyData?: Record<string, unknown> | null;
  companyDbById?: Record<number, Record<string, unknown>>;
  internalRoles?: Record<string, Record<string, unknown>>;
  roles?: Record<string, Record<string, unknown>>;
  workspace: Record<string, unknown>;
}) {
  const rpcCalls: Array<{ args: Record<string, unknown>; name: string }> = [];
  const rowsFor = (
    table: string,
    filters: Record<string, unknown>,
    inFilters: Record<string, unknown[]>
  ) => {
    if (table === "company_workspace") return [args.workspace];
    if (table === "company_data")
      return args.companyData ? [args.companyData] : [];
    if (table === "company_db") {
      const id = Number(filters.id);
      const row = args.companyDbById?.[id];
      return row ? [row] : [];
    }
    if (table === "company_roles") {
      const ids = new Set((inFilters.role_id ?? []).map(String));
      return Object.values(args.roles ?? {}).filter((row) =>
        ids.has(String(row.role_id))
      );
    }
    if (table === "company_internal_roles") {
      const ids = new Set((inFilters.role_id ?? []).map(String));
      return Object.values(args.internalRoles ?? {}).filter((row) =>
        ids.has(String(row.role_id))
      );
    }
    throw new Error(`Unexpected fixture table: ${table}`);
  };
  const from = (table: string) => {
    const filters: Record<string, unknown> = {};
    const inFilters: Record<string, unknown[]> = {};
    const result = () => ({
      data: rowsFor(table, filters, inFilters),
      error: null,
    });
    const builder: Record<string, unknown> = {};
    Object.assign(builder, {
      eq(column: string, value: unknown) {
        filters[column] = value;
        return builder;
      },
      in(column: string, values: unknown[]) {
        inFilters[column] = values;
        return builder;
      },
      maybeSingle() {
        const response = result();
        return Promise.resolve({
          data: response.data[0] ?? null,
          error: response.error,
        });
      },
      select() {
        return builder;
      },
      then(
        resolve: (value: unknown) => unknown,
        reject: (error: unknown) => unknown
      ) {
        return Promise.resolve(result()).then(resolve, reject);
      },
    });
    return builder;
  };
  return {
    admin: {
      from,
      async rpc(name: string, rpcArgs: Record<string, unknown>) {
        rpcCalls.push({ args: rpcArgs, name });
        return {
          data: { changed_count: 1, status: "updated" },
          error: null,
        };
      },
    },
    rpcCalls,
  };
}

test("website keys stay within the SQL mutation allowlist", () => {
  const sql = readFileSync(
    new URL(
      "../../../supabase/migrations/20260805030000_company_data_changes_rpc.sql",
      import.meta.url
    ),
    "utf8"
  );
  for (const key of WEBSITE_COMPANY_DATA_KEYS) {
    assert.match(sql, new RegExp(`when '${key}'`), `${key} missing from SQL`);
  }
});

test("only treats commas and newlines as stored company-list delimiters", () => {
  assert.deepEqual(
    normalizeWebsiteCompanyDataStringList(
      "UI/UX, B2B·SaaS\nA|B, Developer Tools"
    ),
    ["UI/UX", "B2B·SaaS", "A|B", "Developer Tools"]
  );
});

test("uses mirrored physical expectations and builds one deterministic event", () => {
  const snapshots = new Map([
    [
      "company_name:workspace",
      {
        expectedPhysical: { company_db: "Old DB", workspace: "Old" },
        value: "Old",
      },
    ],
  ]);
  const resolved = resolveWebsiteCompanyDataRpcChanges({
    actorLabel: "김호진",
    changes: [{ key: "company_name", value: "New" }],
    snapshots,
  });

  assert.deepEqual(resolved.rpcChanges, [
    {
      expected_physical: { company_db: "Old DB", workspace: "Old" },
      key: "company_name",
      role_id: null,
      value: "New",
    },
  ]);
  assert.equal(resolved.eventContent, '김호진 · company_name: - "Old" + "New"');
});

test("repairs a stale physical mirror when the canonical value is unchanged", () => {
  const snapshots = new Map([
    [
      "company_description:workspace",
      {
        expectedPhysical: { company_db: "오래된 소개", workspace: null },
        value: null,
      },
    ],
  ]);
  const resolved = resolveWebsiteCompanyDataRpcChanges({
    actorLabel: "김호진",
    changes: [{ key: "company_description", value: null }],
    snapshots,
  });

  assert.deepEqual(resolved.rpcChanges, [
    {
      expected_physical: { company_db: "오래된 소개", workspace: null },
      key: "company_description",
      role_id: null,
      value: null,
    },
  ]);
  assert.equal(
    resolved.eventContent,
    '김호진 · company_description: - "오래된 소개" + 없음'
  );
});

test("uses the canonical role request snapshot and skips no-ops", () => {
  const snapshots = new Map([
    [
      "role_request:role-1",
      { expected: "criteria", label: "Backend", value: "criteria" },
    ],
  ]);
  const resolved = resolveWebsiteCompanyDataRpcChanges({
    actorLabel: "김호진",
    changes: [{ key: "role_request", roleId: "role-1", value: "criteria" }],
    snapshots,
  });

  assert.deepEqual(resolved.rpcChanges, []);
  assert.equal(resolved.eventContent, null);
});

test("preserves an explicit stale expected value for the RPC conflict check", () => {
  const snapshots = new Map([
    [
      "role_request:role-1",
      { expected: "current", label: "Backend", value: "current" },
    ],
  ]);
  const resolved = resolveWebsiteCompanyDataRpcChanges({
    actorLabel: "김호진",
    changes: [
      {
        expected: "stale",
        key: "role_request",
        roleId: "role-1",
        value: "current",
      },
    ],
    snapshots,
  });

  assert.deepEqual(resolved.rpcChanges, [
    {
      expected: "stale",
      key: "role_request",
      role_id: "role-1",
      value: "current",
    },
  ]);
});

test("rejects duplicate and incorrectly scoped website targets", () => {
  const snapshots = new Map([
    ["pitch:workspace", { expected: "old", value: "old" }],
  ]);
  assert.throws(
    () =>
      resolveWebsiteCompanyDataRpcChanges({
        actorLabel: "김호진",
        changes: [
          { key: "pitch", value: "one" },
          { key: "pitch", value: "two" },
        ],
        snapshots,
      }),
    /Duplicate website update target/
  );
  assert.throws(
    () =>
      resolveWebsiteCompanyDataRpcChanges({
        actorLabel: "김호진",
        changes: [{ key: "role_name", value: "Backend" }],
        snapshots,
      }),
    /invalid website update scope/
  );
});

test("reassociation snapshots the target company_db mirror, not the old one", async () => {
  const fixture = createWebsiteMutationAdminFixture({
    companyDbById: {
      1: { name: "Old association" },
      2: { name: "Target mirror" },
    },
    workspace: {
      company_db_id: 1,
      company_name: "Workspace canonical",
      company_workspace_id: "workspace-1",
    },
  });

  await applyWebsiteCompanyDataChanges({
    actorLabel: "김호진",
    admin: fixture.admin as never,
    changes: [{ key: "company_name", value: "Workspace canonical" }],
    targetCompanyDbId: 2,
    workspaceId: "workspace-1",
  });

  assert.equal(fixture.rpcCalls.length, 1);
  assert.equal(
    fixture.rpcCalls[0]?.name,
    "reassociate_company_workspace_db_v1"
  );
  assert.deepEqual(fixture.rpcCalls[0]?.args, {
    p_changes: [
      {
        expected_physical: {
          company_db: "Target mirror",
          workspace: "Workspace canonical",
        },
        key: "company_name",
        role_id: null,
        value: "Workspace canonical",
      },
    ],
    p_event_content:
      '김호진 · company_name: - "Target mirror" + "Workspace canonical"',
    p_expected_company_db_id: 1,
    p_target_company_db_id: 2,
    p_workspace_id: "workspace-1",
  });
});

test("records an association-only change and supports a null detach target", async () => {
  const fixture = createWebsiteMutationAdminFixture({
    workspace: {
      company_db_id: 1,
      company_name: "Workspace canonical",
      company_workspace_id: "workspace-1",
    },
  });

  await applyWebsiteCompanyDataChanges({
    actorLabel: "김호진",
    admin: fixture.admin as never,
    changes: [{ key: "company_name", value: "Workspace canonical" }],
    targetCompanyDbId: null,
    workspaceId: "workspace-1",
  });

  assert.deepEqual(fixture.rpcCalls, [
    {
      args: {
        p_changes: [],
        p_event_content: "김호진 · 회사 데이터 연결 변경",
        p_expected_company_db_id: 1,
        p_target_company_db_id: null,
        p_workspace_id: "workspace-1",
      },
      name: "reassociate_company_workspace_db_v1",
    },
  ]);
});

test("external-to-internal request snapshots an absent child and timestamps use UTC milliseconds", async () => {
  const fixture = createWebsiteMutationAdminFixture({
    internalRoles: {},
    roles: {
      "role-1": {
        expires_at: null,
        name: "Backend",
        posted_at: "2026-08-05T12:34:56.123456+09:00",
        role_id: "role-1",
        source_type: "external",
      },
    },
    workspace: {
      company_db_id: null,
      company_name: "Harper",
      company_workspace_id: "workspace-1",
    },
  });

  await applyWebsiteCompanyDataChanges({
    actorLabel: "김호진",
    admin: fixture.admin as never,
    changes: [
      { key: "role_source_type", roleId: "role-1", value: "internal" },
      { key: "role_request", roleId: "role-1", value: "new request" },
      {
        key: "role_posted_at",
        roleId: "role-1",
        value: "2026-08-05T03:34:57.000Z",
      },
    ],
    workspaceId: "workspace-1",
  });

  assert.deepEqual(
    (fixture.rpcCalls[0]?.args.p_changes as Array<Record<string, unknown>>).map(
      ({ expected, key }) => ({ expected, key })
    ),
    [
      { expected: "external", key: "role_source_type" },
      { expected: null, key: "role_request" },
      { expected: "2026-08-05T03:34:56.123Z", key: "role_posted_at" },
    ]
  );
});
