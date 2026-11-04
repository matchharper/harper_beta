import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { projectCareerWorkActivity } from "@/lib/career/work/activity";

const conversationId = "00000000-0000-4000-8000-000000000001";
function harness({
  owned = true,
  anonymous = false,
  completionError = false,
} = {}) {
  const calls: Array<{
    table: string;
    columns?: string;
    filters: Record<string, unknown>;
  }> = [];
  const admin = {
    rpc: async (name: string, args: any) => {
      assert.equal(name, "read_open_career_forms");
      assert.equal(args.p_user_id, "owner");
      assert.equal(args.p_conversation_id, conversationId);
      return { data: [], error: null };
    },
    from(table: string) {
      const call = {
        table,
        columns: "",
        filters: {} as Record<string, unknown>,
      };
      calls.push(call);
      const result = () => {
        assert.equal(call.filters.user_id, "owner");
        if (table === "talent_conversations")
          return { data: owned ? { id: conversationId } : null, error: null };
        assert.equal(call.filters.conversation_id, conversationId);
        if (table === "talent_messages")
          return { data: { id: 42 }, error: null };
        if (call.filters.status === "completed")
          return {
            data: { id: "finished", updated_at: "2026-11-04T00:00:00Z" },
            error: completionError ? { message: "offline" } : null,
          };
        if (call.filters.kind === "delegated_work")
          return { count: 0, error: null };
        assert.ok(call.columns.includes("result->activity"));
        assert.ok(
          !call.columns
            .split(",")
            .some((column) => ["request", "result", "*"].includes(column)),
          "polling must not load execution payloads"
        );
        return {
          count: 3,
          data: [
            { id: "active", activity: { logs: ["프로필 확인 중"] } },
            { id: "waiting", activity: { waitingForReply: true } },
            { id: "cleanup", cleanup: true },
          ],
          error: null,
        };
      };
      const query: any = {
        select(columns: string) {
          call.columns = columns;
          return this;
        },
        eq(column: string, value: unknown) {
          call.filters[column] = value;
          return this;
        },
        neq() {
          return this;
        },
        not() {
          return this;
        },
        is() {
          return this;
        },
        order() {
          return this;
        },
        limit() {
          return this;
        },
        maybeSingle() {
          return Promise.resolve(result());
        },
        then(resolve: (data: unknown) => unknown) {
          return Promise.resolve(resolve(result()));
        },
      };
      return query;
    },
  };
  const source = ts.transpileModule(
    readFileSync(new URL("./route.ts", import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText;
  const module = {
    exports: {} as {
      GET: (req: unknown) => Promise<{ status: number; body: any }>;
    },
  };
  vm.runInNewContext(source, {
    module,
    exports: module.exports,
    console,
    require: (name: string) => {
      if (name === "next/server")
        return {
          NextResponse: {
            json: (body: unknown, init?: { status: number }) => ({
              body,
              status: init?.status ?? 200,
            }),
          },
        };
      if (name === "zod") return { z };
      if (name === "@/lib/supabaseServer")
        return {
          getRequestUser: async () => (anonymous ? null : { id: "owner" }),
        };
      if (name === "@/lib/talentOnboarding/admin")
        return { getTalentSupabaseAdmin: () => admin };
      if (name === "@/lib/career/work/activity")
        return { projectCareerWorkActivity };
      if (name === "@/lib/career/forms/schema")
        return { parseCareerForm: () => null };
      throw new Error(`Unexpected import ${name}`);
    },
  });
  return {
    calls,
    get: () =>
      module.exports.GET({
        nextUrl: new URL(
          `http://localhost/api/talent/work?conversationId=${conversationId}&userId=other`
        ),
      }),
  };
}

test("work projection includes durable completion, keeps active work, and excludes waiting and cleanup", async () => {
  const result = await harness().get();
  assert.equal(result.status, 200);
  assert.equal(result.body.completionCursor, "finished:2026-11-04T00:00:00Z");
  assert.equal(result.body.canStop, true);
  assert.deepEqual(JSON.parse(JSON.stringify(result.body.activities)), [
    { id: "active", logs: ["프로필 확인 중"] },
  ]);
  assert.equal(result.body.pending, 3);
  assert.equal(result.body.latestMessageId, 42);
});

test("unknown status returns an error and unauthorized conversations are never read", async () => {
  assert.equal((await harness({ completionError: true }).get()).status, 503);
  const missing = harness({ owned: false });
  assert.equal((await missing.get()).status, 404);
  assert.equal(missing.calls.length, 1);
  const anonymous = harness({ anonymous: true });
  assert.equal((await anonymous.get()).status, 401);
  assert.equal(anonymous.calls.length, 0);
});
