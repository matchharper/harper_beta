import assert from "node:assert/strict";
import test from "node:test";
import { formatToolResultText } from "@/lib/llm/promptText";
import { CAREER_COMPANY_TOOLS } from "./tools";

const follow = {
  id: "follow-1",
  talent_id: "user-1",
  company_db_id: 101,
  company_workspace_id: null,
  scope: "company",
  revision: 3,
  instruction: "Platform engineering roles",
  followed_at: "2026-11-01T00:00:00Z",
  unfollowed_at: null,
  conversation_id: "conversation-1",
  company: { name: "Example" },
  scan_state: { privateScanMarker: true },
};
const execute = CAREER_COMPANY_TOOLS.follow_company.execute!;

test("batch updates and unfollows retain per-item revision, owner and retry identity", async () => {
  for (const action of ["update", "unfollow"]) {
    const calls: any[] = [];
    const admin = {
      from() {
        let id: string;
        return {
          select() {
            return this;
          },
          eq(key: string, value: string) {
            if (key === "id") id = value;
            else assert.deepEqual([key, value], ["talent_id", "owner"]);
            return this;
          },
          async maybeSingle() {
            return { data: { ...follow, id: id! }, error: null };
          },
        };
      },
      async rpc(name: string, args: any) {
        assert.equal(name, "write_career_company_follow");
        calls.push(args);
        if (args.p_input.expected_revision === 1)
          return {
            data: null,
            error: { message: "Follow changed; read its current revision" },
          };
        return {
          data: {
            ...follow,
            id: args.p_input.follow_id,
            revision: 4,
            unfollowed_at:
              action === "unfollow" ? "2026-11-11T00:00:00Z" : null,
          },
          error: null,
        };
      },
    };
    const companies = [
      {
        follow_id: "first",
        expected_revision: 3,
        instruction: "Platform roles",
      },
      { follow_id: "stale", expected_revision: 1 },
    ];
    const context = { admin, userId: "owner", resumeRequestId: "reply" };
    const result = (await execute({ action, companies }, context)) as any;
    assert.deepEqual(
      result.results.map((r: any) => r.ok),
      [true, false]
    );
    assert.equal(result.follows[0].id, "first");
    assert.equal(result.failures[0].followId, "stale");
    assert.match(formatToolResultText(result), /current revision/);
    assert.match(
      formatToolResultText(result),
      action === "unfollow" ? /unfollowed/ : /following/
    );
    await execute({ action, companies: [...companies].reverse() }, context);
    assert.equal(calls[0].p_request_id, calls[3].p_request_id);
    assert.equal(calls[1].p_request_id, calls[2].p_request_id);
    assert.equal(calls[0].p_input.expected_revision, 3);
    assert.equal(calls[0].p_input.action, action);
    const before = calls.length;
    await assert.rejects(
      execute({ action, companies: [{ follow_id: "first" }] }, context)
    );
    assert.equal(calls.length, before);
  }
});

test("batch reads use one owned inventory and independent cursors and failures", async () => {
  let reads = 0;
  const owner = "11111111-1111-4111-8111-111111111111";
  const admin = {
    async rpc(_name: string, args: any) {
      reads++;
      assert.ok(args.sql_query.includes(owner));
      return {
        data: [
          {
            companies: [
              {
                id: "first",
                name: "One",
                revision: 3,
                followedAt: "2026-11-01T00:00:00Z",
              },
              {
                id: "second",
                name: "Two",
                revision: 4,
                followedAt: "2026-11-01T00:00:00Z",
              },
            ],
            roles: Array.from({ length: 32 }, (_, i) => ({
              id: `role-${i}`,
              name: "Engineer",
              company: "One",
              followIds: ["first"],
              source: "external",
            })),
          },
        ],
        error: null,
      };
    },
  };
  const result = (await execute(
    {
      action: "read",
      companies: [
        { follow_id: "first", offset: 30 },
        { follow_id: "second" },
        { follow_id: "missing" },
      ],
    },
    { admin, userId: owner }
  )) as any;
  assert.equal(reads, 1);
  assert.deepEqual(
    result.results.map((r: any) => r.ok),
    [true, true, false]
  );
  assert.equal(result.results[0].roles.length, 2);
  assert.equal(result.results[1].roles.length, 0);
  assert.match(formatToolResultText(result), /revision 3/);
  assert.match(formatToolResultText(result), /missing.*unavailable/);
});

test("list reads the authenticated user's follows without writing, including history and pagination", async () => {
  for (const includeUnfollowed of [false, true]) {
    const filters: unknown[][] = [];
    const query = {
      select() {
        return this;
      },
      eq(...args: unknown[]) {
        filters.push(args);
        return this;
      },
      is(...args: unknown[]) {
        filters.push(args);
        return this;
      },
      order() {
        return this;
      },
      async range(start: number, end: number) {
        assert.deepEqual([start, end], [30, 59]);
        return { data: [follow], error: null, count: 90 };
      },
    };
    const admin = {
      from(table: string) {
        assert.equal(table, "talent_company_follow");
        return query;
      },
      rpc() {
        assert.fail("Listing follows must not write");
      },
    };
    const result = (await execute(
      { action: "list", include_unfollowed: includeUnfollowed, offset: 30 },
      { admin, userId: "user-1" }
    )) as { follows: unknown[]; nextOffset: number; modelOutput: string };
    assert.deepEqual(
      filters,
      includeUnfollowed
        ? [["talent_id", "user-1"]]
        : [
            ["talent_id", "user-1"],
            ["unfollowed_at", null],
          ]
    );
    assert.deepEqual(result.follows, [follow]);
    assert.equal(result.nextOffset, 60);
    const text = formatToolResultText(result);
    assert.equal(text, result.modelOutput);
    assert.match(text, /Follow follow-1; revision 3/);
    assert.match(text, /offset 60/);
    assert.ok(!text.includes("privateScanMarker"));
    assert.ok(!text.includes("company_db_id"));
  }
});

test("company search batches alternate names without counting matches and preserves paging and model output", async () => {
  const ranges: number[][] = [];
  const query = {
    select(columns: string, options?: unknown) {
      assert.equal(options, undefined, "Search must not request a full count");
      assert.ok(columns.includes("company_workspace_id"));
      return this;
    },
    or(filter: string) {
      assert.equal(
        filter,
        'company_name.imatch."example",linkedin_url.imatch."example",company_name.imatch."예시",linkedin_url.imatch."예시"'
      );
      return this;
    },
    order() {
      return this;
    },
    async range(start: number, end: number) {
      ranges.push([start, end]);
      return {
        data: Array.from({ length: start === 0 ? 21 : 1 }, (_, index) => ({
          company_workspace_id: `00000000-0000-4000-8000-${String(start + index + 1).padStart(12, "0")}`,
          company_db_id: 12345,
          company_name: "Example Labs 예시",
          homepage_url: "https://example.invalid",
          linkedin_url: "https://linkedin.com/company/example-labs",
        })),
        error: null,
      };
    },
  };
  const admin = {
    from(table: string) {
      assert.equal(table, "company_workspace");
      return query;
    },
  };
  for (const offset of [0, 20]) {
    const result = (await CAREER_COMPANY_TOOLS.search_companies.execute!(
      { queries: ["Example", "예시", "Example"], offset },
      { admin, userId: "owner" }
    )) as any;
    assert.equal(result.nextOffset, offset === 0 ? 20 : null);
    assert.equal(result.companies.length, offset === 0 ? 20 : 1);
    assert.deepEqual(result.companies[0].matchedQueries, ["Example", "예시"]);
    assert.equal(result.companies[0].companyDbId, 12345);
    assert.equal(result.companies[0].website, "https://example.invalid");
    const text = formatToolResultText(result);
    assert.match(text, /Example Labs 예시; company_workspace_id/);
    assert.match(text, /https:\/\/linkedin.com\/company\/example-labs/);
    assert.match(text, /Matched queries: Example, 예시/);
    assert.ok(!text.includes("company_db_id"));
    assert.ok(!text.includes("12345"));
    assert.ok(!text.includes("example.invalid"));
  }
  assert.deepEqual(ranges, [
    [0, 20],
    [20, 40],
  ]);
});

test("company search exposes queries and rejects malformed searches before reading the directory", async () => {
  const search = CAREER_COMPANY_TOOLS.search_companies;
  const schema = search.parameters as any;
  assert.deepEqual(schema.required, ["queries"]);
  assert.equal(schema.properties.query, undefined);
  assert.equal(schema.properties.queries.items.type, "string");
  const context = {
    userId: "owner",
    admin: {
      from() {
        assert.fail("Unexpected directory read");
      },
    },
  };
  for (const input of [
    { queries: [] },
    { queries: [""] },
    { queries: ["  "] },
    { queries: "Example" },
    { queries: ["Example"], offset: -1 },
    { queries: ["Example"], offset: 0.5 },
  ]) {
    await assert.rejects(search.execute!(input, context));
  }
  await assert.rejects(
    search.execute!({ queries: ["Example"] }),
    /Authenticated Career user required/
  );
});

test("batch follow preserves partial results and per-company request identity across reordered retries", async () => {
  const first = "00000000-0000-4000-8000-000000000001";
  const second = "00000000-0000-4000-8000-000000000002";
  const calls: any[] = [];
  let stored = false;
  const admin = {
    async rpc(name: string, args: any) {
      assert.equal(name, "write_career_company_follow");
      assert.equal(args.p_user_id, "owner");
      assert.equal(args.p_conversation_id, "conversation");
      calls.push(args);
      if (args.p_input.company_workspace_id === second)
        return {
          data: null,
          error: { message: "Company workspace unavailable" },
        };
      stored = true;
      return {
        data: { ...follow, company_workspace_id: first, scope: "workspace" },
        error: null,
      };
    },
  };
  const companies = [
    { company_workspace_id: first, instruction: "AI engineering" },
    { company_workspace_id: second },
  ];
  const context = {
    admin,
    userId: "owner",
    conversationId: "conversation",
    resumeRequestId: "reply-1",
  };
  const result = (await execute(
    { action: "follow", companies },
    context
  )) as any;
  assert.equal(stored, true);
  assert.equal(result.follows.length, 1);
  assert.deepEqual(result.failures, [
    { companyWorkspaceId: second, error: "Company workspace unavailable" },
  ]);
  const text = formatToolResultText(result);
  assert.match(text, /Follow follow-1/);
  assert.match(text, /Follow failed for company_workspace_id/);
  assert.ok(!text.includes("company_db_id"));
  await execute(
    { action: "follow", companies: [...companies].reverse() },
    context
  );
  assert.equal(calls[0].p_request_id, calls[3].p_request_id);
  assert.equal(calls[1].p_request_id, calls[2].p_request_id);
  assert.equal(calls[0].p_input.scope, "workspace");
  assert.equal(calls[0].p_input.instruction, "AI engineering");
  const count = calls.length;
  await assert.rejects(
    execute(
      {
        action: "follow",
        companies: [
          { company_workspace_id: first },
          { company_workspace_id: "invalid" },
        ],
      },
      context
    )
  );
  assert.equal(
    calls.length,
    count,
    "malformed batch is rejected before any write"
  );
});

test("new follow schema offers names or workspace IDs without company_db IDs", () => {
  const schema = CAREER_COMPANY_TOOLS.follow_company.parameters as any;
  assert.equal(schema.properties.companies.items.required, undefined);
  assert.equal(
    schema.properties.companies.items.properties.company_name.type,
    "string"
  );
  assert.equal(schema.properties.company_db_id, undefined);
  assert.equal(schema.properties.scope, undefined);
  assert.equal(schema.properties.follow_id, undefined);
  assert.equal(schema.properties.expected_revision, undefined);
  assert.equal(schema.properties.companies.items.properties.follow_id.type, "string");
  assert.equal(schema.properties.companies.items.properties.expected_revision.type, "integer");
});

test("follow, update and unfollow retain the owner, exact scope, revision and repeatable request identity", async () => {
  for (const action of ["follow", "update", "unfollow"]) {
    const filters: unknown[][] = [],
      writes: Record<string, unknown>[] = [];
    const query = {
      select() {
        return this;
      },
      eq(...args: unknown[]) {
        filters.push(args);
        return this;
      },
      async maybeSingle() {
        return { data: follow, error: null };
      },
    };
    const admin = {
      from(table: string) {
        assert.equal(table, "talent_company_follow");
        return query;
      },
      async rpc(name: string, args: Record<string, unknown>) {
        assert.equal(name, "write_career_company_follow");
        writes.push(args);
        return {
          data: {
            ...follow,
            revision: 4,
            unfollowed_at:
              action === "unfollow" ? "2026-11-02T00:00:00Z" : null,
          },
          error: null,
        };
      },
    };
    const input =
      action === "follow"
        ? {
            action,
            company_db_id: 101,
            scope: "company",
            instruction: follow.instruction,
          }
        : {
            action,
            follow_id: follow.id,
            expected_revision: follow.revision,
            instruction: follow.instruction,
          };
    const context = {
      admin,
      userId: "user-1",
      conversationId: "conversation-1",
      resumeRequestId: "reply-1",
    };
    const result = await execute(input, context);
    await execute(input, context);
    assert.equal(writes.length, 2);
    assert.deepEqual(writes[0], writes[1]);
    assert.equal(writes[0].p_user_id, context.userId);
    assert.equal(writes[0].p_conversation_id, context.conversationId);
    assert.match(String(writes[0].p_request_id), /^reply-1:follow:/);
    assert.deepEqual(
      writes[0].p_input,
      action === "follow"
        ? input
        : {
            ...input,
            scope: "company",
            company_db_id: 101,
            company_workspace_id: null,
          }
    );
    assert.deepEqual(
      filters,
      action === "follow"
        ? []
        : [
            ["id", "follow-1"],
            ["talent_id", "user-1"],
            ["id", "follow-1"],
            ["talent_id", "user-1"],
          ]
    );
    assert.match(
      formatToolResultText(result),
      action === "unfollow" ? /unfollowed/ : /following/
    );
  }
});
