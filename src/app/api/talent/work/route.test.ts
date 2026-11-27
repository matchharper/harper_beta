import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { projectCareerWorkActivity } from "@/lib/career/work/activity";
import { toTalentMessageResponse } from "@/lib/talentOnboarding/models";
import { parseCareerForm } from "@/lib/career/forms/schema";
import { readCareerApplicationProgress } from "@/lib/career/applicationProgress/read.server";
import type { CareerApplicationProgress } from "@/lib/career/applicationProgress/types";

const conversationId = "00000000-0000-4000-8000-000000000001";
function harness({
  owned = true,
  anonymous = false,
  completionError = false,
  deliveredIds = [40],
  deliveredEventIds = [] as string[],
  waitingForReply = false,
  idleWithForm = false,
  progress = "ok" as "ok" | "fail",
  turnCreatedAt = undefined as string | undefined,
  parkedTurn = true,
  closingSessions = [] as string[],
} = {}) {
  const progressCalls: Array<{ userId: string; conversationId: string; openForms: unknown; turnStartedAt: unknown;
    waitingForReply: unknown; closingBrowserSessionIds: unknown }> = [];
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
      return { data: idleWithForm ? [{ created_at: "2026-11-04T00:00:00Z", payload: { formId: 99, revision: 1, kind: "form", state: "open", title: "검토",
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
              delivered_event_ids: deliveredEventIds, activity: { logs: ["프로필 확인 중"], waitingForReply },
              ...(turnCreatedAt ? { created_at: turnCreatedAt } : {}) },
            ...(parkedTurn ? [{ id: "waiting", activity: { waitingForReply: true } }] : []),
            { id: "cleanup", cleanup: true },
            // A Stop's browser cleanups; one of them already waits on nothing and still names its browser.
            ...closingSessions.map((session, index) => ({ id: `browser-cleanup-${index}`, cleanup_browser_session: session,
              activity: { waitingForReply: true } })),
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
      if (name === "@/lib/career/applicationProgress/read.server")
        return {
          readCareerApplicationProgress: async (args: { userId: string; conversationId: string; openForms: PromiseLike<unknown>; turnStartedAt: PromiseLike<unknown>;
            waitingForReply: PromiseLike<unknown>; closingBrowserSessionIds: PromiseLike<unknown> }) => {
            progressCalls.push({ userId: args.userId, conversationId: args.conversationId, openForms: await args.openForms, turnStartedAt: await args.turnStartedAt,
              waitingForReply: await args.waitingForReply, closingBrowserSessionIds: await args.closingBrowserSessionIds });
            if (progress === "fail") throw new Error("progress read failed");
            return [{ id: "role-1", status: "running" }];
          },
        };
      throw new Error(`Unexpected import ${name}`);
    },
  });
  return {
    calls,
    progressCalls,
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

test("application progress comes with each poll, and a failed progress read leaves only that list empty", async () => {
  const ok = harness({ idleWithForm: true });
  const result = await ok.get();
  assert.equal(result.status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(result.body.applications)), [{ id: "role-1", status: "running" }]);
  // The open forms are read once and handed over parsed, with their row time.
  assert.equal(ok.progressCalls.length, 1);
  assert.equal(ok.progressCalls[0].userId, "owner");
  assert.equal(ok.progressCalls[0].conversationId, conversationId);
  const [open] = ok.progressCalls[0].openForms as { formId: number; createdAt: string }[];
  assert.equal(open.formId, 99);
  assert.equal(open.createdAt, "2026-11-04T00:00:00Z");

  const failed = harness({ progress: "fail" });
  const degraded = await failed.get();
  assert.equal(degraded.status, 200);
  assert.deepEqual(Array.from(degraded.body.applications), []);
  assert.equal(degraded.body.pending, 3);
  assert.equal(degraded.body.completionCursor, "finished:2026-11-04T00:00:00Z");
});

test("only a working turn holds a stopped run back from failing", async () => {
  const working = harness({ turnCreatedAt: "2026-11-04T00:00:00Z" });
  await working.get();
  assert.equal(working.progressCalls[0].turnStartedAt, "2026-11-04T00:00:00Z");
  const waiting = harness({ turnCreatedAt: "2026-11-04T00:00:00Z", waitingForReply: true });
  await waiting.get();
  assert.equal(waiting.progressCalls[0].turnStartedAt, null);
});

test("a turn on hold in the chat and a Stop's queued browser cleanups reach the progress read", async () => {
  // A turn on hold behind a newer request: a paused application points to the chat.
  const parked = harness({ turnCreatedAt: "2026-11-04T00:00:00Z", waitingForReply: true });
  await parked.get();
  assert.equal(parked.progressCalls[0].waitingForReply, true);
  // Nothing parked: the working turn is not a wait, and cleanups never count as one.
  const working = harness({ turnCreatedAt: "2026-11-04T00:00:00Z", parkedTurn: false, closingSessions: ["session-1"] });
  await working.get();
  assert.equal(working.progressCalls[0].waitingForReply, false);
  assert.equal(working.progressCalls[0].turnStartedAt, "2026-11-04T00:00:00Z");
  // Each browser a Stop is closing, once; no cleanup, no ids.
  const stopping = harness({ closingSessions: ["session-1", "session-2", "session-1"] });
  await stopping.get();
  assert.deepEqual(Array.from(stopping.progressCalls[0].closingBrowserSessionIds as string[]), ["session-1", "session-2"]);
  const idle = harness();
  await idle.get();
  assert.deepEqual(Array.from(idle.progressCalls[0].closingBrowserSessionIds as string[]), []);
});

test("progress reads narrow queries: this conversation, the last 7 days, selected JSON paths only", async () => {
  const userId = "00000000-0000-4000-8000-0000000000f1";
  const roleId = "00000000-0000-4000-8000-0000000000a1";
  const now = new Date("2026-11-26T10:00:00Z");
  const calls: { table: string; columns: string; filters: Record<string, unknown>; limit?: number }[] = [];
  const data: Record<string, unknown[]> = {
    talent_messages: [
      { messageType: "career_form", createdAt: "2026-11-26T09:00:00Z", formId: 7, revision: 1, kind: "form", relatedRefs: [{ type: "role", id: roleId }] },
      { messageType: "career_form_response", createdAt: "2026-11-26T09:01:00Z", formId: 7, revision: 1, submitScope: "submit" },
    ],
    talent_external_operations: [
      { id: "00000000-0000-4000-8000-0000000000c1", kind: "browser_session", status: "running", createdAt: "2026-11-26T09:02:00Z", updatedAt: "2026-11-26T09:02:00Z", roleRefs: [roleId] },
      { id: "00000000-0000-4000-8000-0000000000d1", kind: "browser_run", parentId: "00000000-0000-4000-8000-0000000000c1", status: "running", mode: "prepare",
        createdAt: "2026-11-26T09:02:00Z", updatedAt: "2026-11-26T09:02:00Z", roleRefs: [roleId] },
    ],
    company_roles: [{ role_id: roleId, name: " 백엔드 엔지니어 ", status: "active", is_expired: false, company_workspace: { company_name: "A사" } }],
  };
  let failTable: string | undefined;
  const admin = {
    from(table: string) {
      const call = { table, columns: "", filters: {} as Record<string, unknown>, limit: undefined as number | undefined };
      calls.push(call);
      const query: any = {
        select(columns: string) { call.columns = columns; return query; },
        eq(column: string, value: unknown) { call.filters[column] = value; return query; },
        in(column: string, values: unknown[]) { call.filters[`${column}:in`] = values; return query; },
        gte(column: string, value: unknown) { call.filters[`${column}:gte`] = value; return query; },
        not(column: string, operator: string, value: unknown) { call.filters[`${column}:not`] = `${operator}.${value}`; return query; },
        order() { return query; },
        limit(value: number) { call.limit = value; return query; },
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve(resolve(failTable === table ? { data: null, error: { message: "offline" } } : { data: data[table], error: null }));
        },
      };
      return query;
    },
  };
  const read = () => readCareerApplicationProgress({ admin: admin as any, userId, conversationId, openForms: Promise.resolve([]),
    turnStartedAt: Promise.resolve(null), now });
  const list: CareerApplicationProgress[] = await read();
  assert.equal(list.length, 1);
  assert.equal(list[0].companyName, "A사");
  assert.equal(list[0].title, "백엔드 엔지니어");
  assert.equal(list[0].status, "running");
  // Forms, operations and the person's Stops first; then the roles they name.
  assert.deepEqual(calls.map((call) => call.table), ["talent_messages", "talent_external_operations", "talent_messages", "company_roles"]);
  for (const call of calls.slice(0, 3)) {
    assert.equal(call.filters.user_id, userId);
    assert.equal(call.filters.conversation_id, conversationId);
    assert.equal(call.filters["created_at:gte"], "2026-11-19T10:00:00.000Z");
    assert.ok(call.limit && call.limit <= 400);
    // Form items and run reports can be hundreds of KB; only paths are selected, never whole JSON columns.
    assert.ok(!call.columns.split(",").some((column) => ["payload", "request", "result", "provider_refs", "*"].includes(column)), call.columns);
  }
  // Why a form was closed: a Stop's closing leaves its step to do.
  assert.ok(calls[0].columns.split(",").includes("reason:payload->>reason"));
  assert.deepEqual(calls[1].filters["kind:in"], ["browser_session", "browser_run", "email_send"]);
  assert.equal(calls[2].filters.message_type, "career_turn_stop");
  assert.deepEqual(calls[3].filters["role_id:in"], [roleId]);

  // No application, no role lookup; a failed read rejects so the route can leave the list empty.
  calls.length = 0;
  data.talent_messages = [];
  data.talent_external_operations = [];
  assert.deepEqual(await read(), []);
  assert.deepEqual(calls.map((call) => call.table), ["talent_messages", "talent_external_operations", "talent_messages"]);
  failTable = "talent_external_operations";
  await assert.rejects(read(), /Application operations unavailable/);
});

test("only the person's own Stop reads as stopped: its Stop record or a work it cancelled, not Harper's own cancellation", async () => {
  const userId = "00000000-0000-4000-8000-0000000000f1";
  const roleIds = ["00000000-0000-4000-8000-0000000000a1", "00000000-0000-4000-8000-0000000000a2",
    "00000000-0000-4000-8000-0000000000a3", "00000000-0000-4000-8000-0000000000a4", "00000000-0000-4000-8000-0000000000a5"];
  const works = ["00000000-0000-4000-8000-0000000000e2", "00000000-0000-4000-8000-0000000000e3", "00000000-0000-4000-8000-0000000000e4"];
  const now = new Date("2026-11-26T10:00:00Z");
  const calls: { table: string; columns: string; filters: Record<string, unknown>; limit?: number }[] = [];
  // One failed submission per role. A's request was ended by the person's Stop (its record lists that message). B's
  // pending request was cancelled by Harper (manage_work, cancel_career_pending_reply): the same careerTurnStopped flag
  // on its message, but no Stop record. C's delegated work was cancelled by the person's Stop (its note). D's request is
  // still going (its work runs). E's work was cancelled by Harper (manage_work cancel, its own note; no Stop record).
  const run = (index: number, extra: Record<string, unknown>) => ({ id: `00000000-0000-4000-8000-0000000000d${index}`, kind: "browser_run",
    status: "failed", mode: "execute", createdAt: "2026-11-26T09:02:00Z", updatedAt: "2026-11-26T09:03:00Z", roleRefs: [roleIds[index]], ...extra });
  const operations = [run(0, { sourceMessageId: "301" }), run(1, { sourceMessageId: "302" }),
    run(2, { sourceMessageId: "303", workId: works[0] }), run(3, { sourceMessageId: "304", workId: works[1] }),
    run(4, { sourceMessageId: "305", workId: works[2] })];
  const admin = {
    from(table: string) {
      const call = { table, columns: "", filters: {} as Record<string, unknown>, limit: undefined as number | undefined };
      calls.push(call);
      const result = () => {
        if (table === "company_roles") return [];
        if (table === "talent_messages") {
          if (call.filters.message_type === "career_turn_stop")
            return [{ createdAt: "2026-11-26T09:03:00Z", sourceMessageIds: [301] }, { createdAt: "2026-11-26T08:00:00Z", sourceMessageIds: null }];
          // The flag alone, as both the person's Stop and Harper's cancellation leave it.
          return call.columns.includes("careerTurnStopped") ? [{ id: 301, stopped: true }, { id: 302, stopped: true }] : [];
        }
        if (call.filters.kind === "delegated_work")
          return [{ id: works[0], status: "cancelled", note: "User stopped the conversation work" }, { id: works[1], status: "running" },
            { id: works[2], status: "cancelled", note: "Posting closed; stopping this application" }];
        return operations;
      };
      const query: any = {
        select(columns: string) { call.columns = columns; return query; },
        eq(column: string, value: unknown) { call.filters[column] = value; return query; },
        in(column: string, values: unknown[]) { call.filters[`${column}:in`] = values; return query; },
        gte(column: string, value: unknown) { call.filters[`${column}:gte`] = value; return query; },
        gt() { return query; },
        like() { return query; },
        not() { return query; },
        order() { return query; },
        limit(value: number) { call.limit = value; return query; },
        then(resolve: (value: unknown) => unknown) { return Promise.resolve(resolve({ data: result(), error: null })); },
      };
      return query;
    },
  };
  const list = await readCareerApplicationProgress({ admin: admin as any, userId, conversationId, openForms: Promise.resolve([]),
    turnStartedAt: Promise.resolve(null), now });
  const byRole = new Map(list.map((item) => [item.id, item]));
  assert.deepEqual(byRole.get(roleIds[0])?.failure, { reason: "stopped" });
  assert.deepEqual(byRole.get(roleIds[1])?.failure, { reason: "error" }, "Harper cancelled it; the person did not stop it");
  assert.deepEqual(byRole.get(roleIds[2])?.failure, { reason: "stopped" });
  assert.deepEqual(byRole.get(roleIds[3])?.failure, { reason: "error" });
  assert.deepEqual(byRole.get(roleIds[4])?.failure, { reason: "error" }, "Harper cancelled that work; the person did not stop it");

  // The person's Stops of this conversation's week, only their time and the requests each ended.
  const stops = calls.find((call) => call.filters.message_type === "career_turn_stop");
  assert.equal(stops?.columns, "createdAt:created_at,sourceMessageIds:payload->sourceMessageIds");
  assert.deepEqual(stops?.filters, { user_id: userId, conversation_id: conversationId, message_type: "career_turn_stop",
    "created_at:gte": "2026-11-19T10:00:00.000Z" });
  assert.ok(stops?.limit && stops.limit <= 100);
  assert.equal(calls.filter((call) => call.columns.includes("careerTurnStopped")).length, 0, "the flag is not read");
  // The work behind each application's newest run, by id, with the note its cancellation left.
  const work = calls.find((call) => call.filters.kind === "delegated_work");
  assert.equal(work?.columns, "id,status,note:result->>note,updatedAt:updated_at");
  assert.deepEqual(work?.filters, { user_id: userId, conversation_id: conversationId, kind: "delegated_work", "id:in": works });
  assert.equal(work?.limit, 3);
});

test("while an application is stopped, the person's messages naming it during the running turn pick it up, unless a Stop ended them", async () => {
  const userId = "00000000-0000-4000-8000-0000000000f1";
  const roleIds = ["00000000-0000-4000-8000-0000000000a1", "00000000-0000-4000-8000-0000000000a2", "00000000-0000-4000-8000-0000000000a3"];
  const now = new Date("2026-11-26T09:11:00Z");
  const calls: { table: string; columns: string; filters: Record<string, unknown>; limit?: number }[] = [];
  const mention = (text: string, mentions: unknown[]) =>
    `${text}\n\n[[HARPER_OPPORTUNITY_MENTIONS_V1:${encodeURIComponent(JSON.stringify(mentions))}]]`;
  // One Stop at 09:03 cut off all three submissions. The person asked to go on with B at 09:05 and stopped that request
  // too (the 09:06 Stop lists it). At 09:10 they asked to go on with A (the panel's message names its role), which
  // started the turn now running, and named C only as a company during it.
  const operations = roleIds.map((roleId, index) => ({ id: `00000000-0000-4000-8000-0000000000d${index}`, kind: "browser_run",
    status: "failed", mode: "execute", createdAt: "2026-11-26T09:02:00Z", updatedAt: "2026-11-26T09:03:00Z", roleRefs: [roleId],
    sourceMessageId: String(301 + index) }));
  const stops = [{ createdAt: "2026-11-26T09:06:00Z", sourceMessageIds: [311] }, { createdAt: "2026-11-26T09:03:00Z", sourceMessageIds: [301, 302, 303] }];
  const requests = [
    { id: 312, createdAt: "2026-11-26T09:10:30Z", content: mention("C 회사 어때?", [{ label: "C사", roleId: roleIds[2], targetKind: "company" }]) },
    { id: 311, createdAt: "2026-11-26T09:05:00Z", content: mention("B사 · 디자이너 진행을 이어서 해 줘.", [{ label: "B사 · 디자이너", roleId: roleIds[1] }]) },
    { id: 310, createdAt: "2026-11-26T09:10:00Z", content: mention("A사 · 백엔드 진행을 이어서 해 줘.", [{ label: "A사 · 백엔드", roleId: roleIds[0] }]) },
  ];
  let stopped = true;
  const admin = {
    from(table: string) {
      const call = { table, columns: "", filters: {} as Record<string, unknown>, limit: undefined as number | undefined };
      calls.push(call);
      const result = () => {
        if (table === "company_roles") return [];
        if (table === "talent_messages")
          return call.filters.message_type === "career_turn_stop" ? (stopped ? stops : []) : call.filters.role === "user" ? requests : [];
        return operations.map((row) => (stopped ? row : { ...row, sourceMessageId: null }));
      };
      const query: any = {
        select(columns: string) { call.columns = columns; return query; },
        eq(column: string, value: unknown) { call.filters[column] = value; return query; },
        in(column: string, values: unknown[]) { call.filters[`${column}:in`] = values; return query; },
        gte(column: string, value: unknown) { call.filters[`${column}:gte`] = value; return query; },
        gt(column: string, value: unknown) { call.filters[`${column}:gt`] = value; return query; },
        like(column: string, value: unknown) { call.filters[`${column}:like`] = value; return query; },
        not() { return query; },
        order() { return query; },
        limit(value: number) { call.limit = value; return query; },
        then(resolve: (value: unknown) => unknown) { return Promise.resolve(resolve({ data: result(), error: null })); },
      };
      return query;
    },
  };
  const read = (turnStartedAt: string | null) => readCareerApplicationProgress({ admin: admin as any, userId, conversationId,
    openForms: Promise.resolve([]), turnStartedAt: Promise.resolve(turnStartedAt), now });
  const byRole = new Map((await read("2026-11-26T09:10:00Z")).map((item) => [item.id, item]));
  assert.equal(byRole.get(roleIds[0])?.failure, undefined, "asked to go on, and that turn runs");
  assert.equal(byRole.get(roleIds[0])?.status, "waiting");
  assert.deepEqual(byRole.get(roleIds[1])?.failure, { reason: "stopped" }, "that request was stopped too");
  assert.deepEqual(byRole.get(roleIds[2])?.failure, { reason: "stopped" }, "a company mention is not this application");

  // Read last, from the earliest Stop that still holds and the running turn's start: only the person's messages
  // carrying a mention, a few columns.
  const request = calls.find((call) => call.filters.role === "user");
  assert.equal(calls.at(-1), request);
  assert.equal(request?.columns, "id,createdAt:created_at,content");
  assert.deepEqual(request?.filters, { user_id: userId, conversation_id: conversationId, role: "user",
    "created_at:gt": "2026-11-26T09:03:00Z", "created_at:gte": "2026-11-26T09:10:00Z", "content:like": "%HARPER_OPPORTUNITY_MENTIONS_V1%" });
  assert.ok(request?.limit && request.limit <= 50);

  // That turn ended with nothing recorded for A: the Stop holds again, and no turn means nothing more to read.
  calls.length = 0;
  assert.deepEqual(new Map((await read(null)).map((item) => [item.id, item])).get(roleIds[0])?.failure, { reason: "stopped" });
  assert.equal(calls.filter((call) => call.filters.role === "user").length, 0);
  // Nothing stopped, nothing more to read.
  stopped = false;
  calls.length = 0;
  assert.ok((await read("2026-11-26T09:10:00Z")).every((item) => item.failure?.reason !== "stopped"));
  assert.equal(calls.filter((call) => call.filters.role === "user").length, 0);
});

test("a stopped application asked to go on stays while that turn runs: a day past its newest record, and past another's later stop", async () => {
  const userId = "00000000-0000-4000-8000-0000000000f1";
  const roleA = "00000000-0000-4000-8000-0000000000a1";
  const roleB = "00000000-0000-4000-8000-0000000000a2";
  const sessionB = "00000000-0000-4000-8000-0000000000c2";
  const hours = (value: number) => new Date(Date.UTC(2026, 10, 26, 0, 0) + value * 3_600_000).toISOString();
  const mention = (text: string, mentions: unknown[]) =>
    `${text}\n\n[[HARPER_OPPORTUNITY_MENTIONS_V1:${encodeURIComponent(JSON.stringify(mentions))}]]`;
  // The person's Stop at 00:00 cut off A's submission. At 23:50 they pressed "이어서 하기" on A; that turn still runs at
  // 24:10 and has recorded nothing for A yet, so A's newest record is more than a day old.
  const runA = { id: "00000000-0000-4000-8000-0000000000d1", kind: "browser_run", status: "failed", mode: "execute",
    createdAt: hours(-0.1), updatedAt: hours(0), roleRefs: [roleA], sourceMessageId: "301" };
  // B's browser waited for a login and the person closed it at 24:00: B is stopped since then.
  const sessionClosed = { id: sessionB, kind: "browser_session", status: "closed", createdAt: hours(23.9), updatedAt: hours(24), roleRefs: [roleB] };
  const runB = { id: "00000000-0000-4000-8000-0000000000d2", kind: "browser_run", parentId: sessionB, status: "completed", mode: "prepare",
    createdAt: hours(23.9), updatedAt: hours(24), roleRefs: [roleB], needsUser: true, submitted: "no", verificationCode: "none" };
  const stops = [{ createdAt: hours(0), sourceMessageIds: [301] }];
  const requests = [{ id: 310, createdAt: hours(23 + 50 / 60), content: mention("A사 · 백엔드 진행을 이어서 해 줘.", [{ label: "A사 · 백엔드", roleId: roleA }]) }];
  type Row = Record<string, unknown>;
  // The fake applies the time and content filters, as PostgREST would.
  const fake = (operations: Row[]) => ({
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const keep: ((row: Row) => boolean)[] = [];
      const query: any = {
        select() { return query; },
        eq(column: string, value: unknown) { filters[column] = value; return query; },
        in() { return query; },
        gte(_: string, value: string) { keep.push((row) => Date.parse(String(row.createdAt)) >= Date.parse(value)); return query; },
        gt(_: string, value: string) { keep.push((row) => Date.parse(String(row.createdAt)) > Date.parse(value)); return query; },
        like(_: string, value: string) { keep.push((row) => String(row.content ?? "").includes(value.replaceAll("%", ""))); return query; },
        not() { return query; },
        order() { return query; },
        limit() { return query; },
        then(resolve: (value: unknown) => unknown) {
          const rows = table === "company_roles" ? [] : table === "talent_messages"
            ? filters.message_type === "career_turn_stop" ? stops : filters.role === "user" ? requests : []
            : filters.kind === "delegated_work" ? [] : operations;
          return Promise.resolve(resolve({ data: rows.filter((row) => keep.every((test) => test(row))), error: null }));
        },
      };
      return query;
    },
  });
  const read = (operations: Row[], turnStartedAt: string | null) => readCareerApplicationProgress({ admin: fake(operations) as any,
    userId, conversationId, openForms: Promise.resolve([]), turnStartedAt: Promise.resolve(turnStartedAt), now: new Date(hours(24 + 10 / 60)) });
  const statusOf = (list: CareerApplicationProgress[], id: string) => list.find((item) => item.id === id)?.status;

  assert.equal(statusOf(await read([runA], requests[0].createdAt), roleA), "waiting", "asked to go on, and that turn runs");
  const both = await read([runA, sessionClosed, runB], requests[0].createdAt);
  assert.equal(statusOf(both, roleA), "waiting", "B's later stop does not move the request window past A's go-on");
  assert.deepEqual(both.find((item) => item.id === roleB)?.failure, { reason: "stopped" });
  // Once that turn ends with nothing recorded for A, A is stopped again and, a day past its newest record, no longer shown.
  const after = await read([runA, sessionClosed, runB], null);
  assert.equal(statusOf(after, roleA), undefined);
  assert.equal(statusOf(after, roleB), "failed");
});
