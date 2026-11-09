import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { projectCareerWorkActivity } from "@/lib/career/work/activity";
import { toTalentMessageResponse } from "@/lib/talentOnboarding/models";
import { parseCareerForm } from "@/lib/career/forms/schema";

const conversationId = "00000000-0000-4000-8000-000000000001";
function harness({
  owned = true,
  anonymous = false,
  completionError = false,
  deliveredIds = [40],
  deliveredEventIds = [] as string[],
  waitingForReply = false,
  idleWithForm = false,
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
      return { data: idleWithForm ? [{ payload: { formId: 99, revision: 1, kind: "form", state: "open", title: "검토",
        items: [{ id: "answer", label: "답변", type: "text", content: "" }] } }] : [], error: null };
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
          return { data: call.columns === "*" ? [] : { id: 42 }, error: null };
        if (call.filters.or) return { count: 0, error: null };
        if (call.filters.status === "completed")
          return {
            data: { id: "finished", updated_at: "2026-11-04T00:00:00Z" },
            error: completionError ? { message: "offline" } : null,
          };
        if (call.filters.kind === "delegated_work")
          return { count: 0, error: null };
        if (idleWithForm) return { count: 0, data: [], error: null };
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
            { id: "active", input_message_ids: [40, 41, 42], delivered_input_message_ids: deliveredIds,
              delivered_event_ids: deliveredEventIds, activity: { logs: ["프로필 확인 중"], waitingForReply } },
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
        in() { return this; },
        or(value: string) { call.filters.or = value; return this; },
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
  const compiledModule = {
    exports: {} as {
      GET: (req: unknown) => Promise<{ status: number; body: any }>;
    },
  };
  vm.runInNewContext(source, {
    module: compiledModule,
    exports: compiledModule.exports,
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
      if (name === "@/lib/talentOnboarding/models")
        return { toTalentMessageResponse };
      if (name === "@/lib/career/forms/schema")
        return { parseCareerForm };
      throw new Error(`Unexpected import ${name}`);
    },
  });
  return {
    calls,
    get: () =>
      compiledModule.exports.GET({
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

test("unanswered forms remain available without presenting idle work as stoppable automation", async () => {
  const result = await harness({ idleWithForm: true }).get();
  assert.equal(result.body.forms.length, 1);
  assert.equal(result.body.pending, 0);
  assert.equal(result.body.canStop, false);
});

test("saved inputs remain pending until their execution checkpoint includes them", async () => {
  const waiting = harness();
  assert.deepEqual(Array.from((await waiting.get()).body.pendingInputMessageIds), [41, 42]);
  const received = harness({ deliveredIds: [40, 41, 42] });
  assert.deepEqual(Array.from((await received.get()).body.pendingInputMessageIds), []);
  const query = waiting.calls.find(call => call.columns?.includes("delivered_input_message_ids:"));
  assert.ok(query?.columns?.includes("input_message_ids:request->input_message_ids"));
});

test("initial startup and waiting for the user do not present inputs as blocked", async () => {
  for (const options of [{ deliveredIds: [] }, { waitingForReply: true }]) {
    const result = await harness(options).get();
    assert.equal(result.body.hasActiveInputTurn, false);
    assert.deepEqual(Array.from(result.body.pendingInputMessageIds), []);
  }
  const running = await harness({ deliveredIds: [], deliveredEventIds: ["browser-return"] }).get();
  assert.equal(running.body.hasActiveInputTurn, true);
  assert.deepEqual(Array.from(running.body.pendingInputMessageIds), [40, 41, 42]);
});
