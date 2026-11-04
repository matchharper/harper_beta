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
  }
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
