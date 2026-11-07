import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import type { User } from "@supabase/supabase-js";
import { manageTodoSuggestions, type ReadRoleStages } from "./todoSuggestionTool.server";
import { withCompanyAgentScope } from "@/lib/agentContacts/companyScope";

// Harper's own To-do suggestions: the tool's rules against an in-memory
// database, then one run through the shared tool loop and the real tool
// executor (toolExecution.ts) with a stand-in model. No network runs.

const workspaceId = "workspace-1";
const roleId = "role-1";
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-11-07T00:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const MODEL = "google/gemini-3.8-flash" as const;

type Row = Record<string, any>;
let tables: Record<string, Row[]> = {};
let inserts = 0;
let beforeInsert: (() => void) | null = null;

function from(table: string) {
  const filters: Array<(row: Row) => boolean> = [];
  let patch: Row | null = null;
  let insertRow: Row | null = null;
  let returning = false;
  let order: { column: string; ascending: boolean } | null = null;
  let limit = Infinity;
  const run = () => {
    if (insertRow) {
      beforeInsert?.();
      const row = { id: `s${++inserts}`, ...structuredClone(insertRow) };
      (tables[table] ??= []).push(row);
      return { data: [structuredClone(row)], error: null };
    }
    let rows = (tables[table] ??= []).filter((row) => filters.every((filter) => filter(row)));
    if (patch) {
      for (const row of rows) Object.assign(row, structuredClone(patch));
      return { data: returning ? structuredClone(rows) : null, error: null };
    }
    if (order) {
      const { column, ascending } = order;
      rows = [...rows].sort((a, b) => (a[column] > b[column] ? 1 : -1) * (ascending ? 1 : -1));
    }
    return { data: structuredClone(rows.slice(0, limit)), error: null };
  };
  const builder: any = {
    select: () => ((returning = Boolean(patch)), builder),
    insert: (values: Row) => ((insertRow = values), builder),
    update: (values: Row) => ((patch = values), builder),
    eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), builder),
    order: (column: string, options?: { ascending?: boolean }) => ((order = { column, ascending: options?.ascending !== false }), builder),
    limit: (count: number) => ((limit = count), builder),
    maybeSingle: async () => ({ data: (run().data as Row[] | null)?.[0] ?? null, error: null }),
    single: async () => {
      const row = (run().data as Row[] | null)?.[0];
      return row ? { data: row, error: null } : { data: null, error: new Error(`no ${table} row`) };
    },
    then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
  };
  return builder;
}
const admin: any = { from, rpc: async () => ({ data: null, error: null }) };
const user = { id: "member-1", app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: "2026-01-01" } as User;
const conversation = { id: "conversation-1", role_id: roleId };
/** The board as the company sees it: A is waiting for a decision, B is not on this Role. */
const stages: ReadRoleStages = async ({ talentIds }) =>
  new Map(talentIds.filter((id) => id === A).map((id) => [id, "pending_connection"]));

const call = (input: Record<string, unknown>, extra: Partial<Parameters<typeof manageTodoSuggestions>[0]> = {}) =>
  manageTodoSuggestions({ admin, user, workspaceId, conversation, harperInitiated: true, input, now: NOW, readStages: stages, ...extra });
const add = (extra: Row = {}) =>
  call({
    operation: "add",
    kind: "follow_up_candidate",
    title: "박도현 님이 3일째 답이 없어요. 한 번 더 물어볼까요?",
    plan: "박도현 님에게 면접 가능한 시간을 다시 물어보고, 답이 오면 알려 드릴게요.",
    talentIds: [A],
    ...extra,
  });
const suggestion = (id: string, extra: Row = {}) => ({
  id, company_workspace_id: workspaceId, role_id: roleId, kind: "widen_search", title: `title ${id}`, plan: "plan",
  talent_ids: [], talent_stages: {}, status: "pending", source: "harper",
  expires_at: new Date(NOW.getTime() + DAY).toISOString(), decided_at: null,
  created_at: new Date(NOW.getTime() - DAY).toISOString(), ...extra,
});
const rows = () => tables.company_todo_suggestions ?? [];

beforeEach(() => {
  inserts = 0;
  beforeInsert = null;
  tables = {
    company_roles: [{ role_id: roleId, company_workspace_id: workspaceId }],
    company_todo_suggestions: [],
    company_todo_suggestion_mutes: [],
  };
});

test("only in runs Harper starts itself, and only on a Role of this company", async () => {
  // A member's own conversation: ask the team directly instead.
  await assert.rejects(call({ operation: "list" }, { harperInitiated: false }), /only in runs Harper starts itself/);
  await assert.rejects(call({ operation: "add", kind: "follow_up_candidate", title: "t", plan: "p" }, { harperInitiated: false }), /only in runs Harper starts itself/);
  await assert.rejects(call({ operation: "list", roleId: "role-other" }), /not in this company/);
  await assert.rejects(call({ operation: "list" }, { conversation: { id: "c", role_id: null } }), /Name the Role/);
  await assert.rejects(call({ operation: "delete" }), /operation must be list, add or withdraw/);
});

test("add: Harper's sentence and plan on the To-do, with the candidate's current stage and an expiry", async () => {
  const result = await add();
  assert.equal(result.status, "created");
  assert.match(String(result.modelOutput), /Suggestion s1 added to Role role-1's To-do: "박도현 님이 3일째 답이 없어요. 한 번 더 물어볼까요\?"/);
  assert.match(String(result.modelOutput), /Approve sends your plan to the Role chat as their request/);
  const [row] = rows();
  assert.equal(row.status, "pending");
  assert.equal(row.source, "harper");
  assert.equal(row.conversation_id, "conversation-1");
  assert.deepEqual(row.talent_ids, [A]);
  // The To-do drops it on its own once A moves on.
  assert.deepEqual(row.talent_stages, { [A]: "pending_connection" });
  assert.equal(row.expires_at, new Date(NOW.getTime() + 3 * DAY).toISOString());
  const list = await call({ operation: "list" });
  assert.equal(list.open, 1);
  assert.match(String(list.modelOutput), /Open \(1 of at most 3\):\n- s1 \| follow_up_candidate/);
});

test("idempotent: the same kind about the same candidates is not added twice", async () => {
  await add();
  const again = await add({ title: "다른 말로 같은 제안" });
  assert.equal(again.status, "already_open");
  assert.equal(again.suggestionId, "s1");
  assert.equal(rows().length, 1);
});

test("the team's answers hold: muted kinds and recent dismissals are refused", async () => {
  tables.company_todo_suggestion_mutes.push({ role_id: roleId, kind: "follow_up_candidate" });
  await assert.rejects(add(), /asked you to stop suggesting "follow_up_candidate"/);
  tables.company_todo_suggestion_mutes = [];
  rows().push(suggestion("old-dismissed", { kind: "follow_up_candidate", talent_ids: [A], status: "dismissed", decided_at: new Date(NOW.getTime() - 3 * DAY).toISOString() }));
  await assert.rejects(add(), /answered "not now" to this suggestion \(old-dismissed\)/);
  // Fourteen days later it may come back; an expired open copy does not block it either.
  rows()[0].decided_at = new Date(NOW.getTime() - 15 * DAY).toISOString();
  rows().push(suggestion("expired-copy", { kind: "follow_up_candidate", talent_ids: [A], expires_at: new Date(NOW.getTime() - 1).toISOString() }));
  assert.equal((await add()).status, "created");
});

test("at most 3 open per Role; withdrawing one makes room", async () => {
  for (const id of ["o1", "o2", "o3"]) rows().push(suggestion(id, { kind: `kind_${id}` }));
  rows().push(suggestion("expired", { kind: "kind_expired", expires_at: new Date(NOW.getTime() - 1).toISOString() }));
  await assert.rejects(add(), /already has 3 open suggestions[\s\S]*\(o1, o2, o3\)/);
  const withdrawn = await call({ operation: "withdraw", suggestionId: "o2" });
  assert.equal(withdrawn.status, "withdrawn");
  assert.equal(rows().find((row) => row.id === "o2")!.status, "withdrawn");
  assert.equal((await call({ operation: "withdraw", suggestionId: "o2" })).status, "already_withdrawn");
  assert.equal((await add()).status, "created");
});

test("withdraw only an open suggestion on this Role", async () => {
  rows().push(suggestion("answered", { status: "approved", decided_at: NOW.toISOString() }));
  await assert.rejects(call({ operation: "withdraw", suggestionId: "answered" }), /already answered by the team \(approved\)/);
  await assert.rejects(call({ operation: "withdraw", suggestionId: "missing" }), /not on Role role-1's To-do/);
  await assert.rejects(call({ operation: "withdraw" }), /suggestionId is required/);
});

test("candidates must be on this Role's list as the company sees it", async () => {
  await assert.rejects(add({ talentIds: [A, B] }), new RegExp(`Not on this Role's candidate list as the company sees it: ${B}`));
  assert.equal(rows().length, 0);
});

test("input mistakes come back to Harper as fixable messages, and nothing is written", async () => {
  await assert.rejects(add({ kind: "Follow Up" }), /kind must be a short lowercase label[\s\S]*Nothing changed/);
  await assert.rejects(add({ title: "dohyun@example.com 으로 물어볼까요?" }), /must not contain an email address or phone number/);
  await assert.rejects(add({ expiresInDays: 9 }), /from 1 to 7/);
  assert.equal(rows().length, 0);
});

test("two runs adding the same thing at once: the older copy stays", async () => {
  beforeInsert = () => {
    beforeInsert = null;
    rows().push(suggestion("other-run", { kind: "follow_up_candidate", talent_ids: [A], created_at: new Date(NOW.getTime() - 1000).toISOString() }));
  };
  const result = await add();
  assert.equal(result.status, "already_open");
  assert.equal(result.suggestionId, "other-run");
  assert.deepEqual(rows().map((row) => [row.id, row.status]), [["other-run", "pending"], ["s1", "withdrawn"]]);
});

test("two runs filling the last open slot at once: the cap holds", async () => {
  for (const id of ["o1", "o2"]) rows().push(suggestion(id, { kind: `kind_${id}` }));
  beforeInsert = () => {
    beforeInsert = null;
    rows().push(suggestion("other-run", { kind: "kind_other", created_at: new Date(NOW.getTime() - 1000).toISOString() }));
  };
  await assert.rejects(add(), /reached 3 open suggestions while you were adding this one/);
  assert.equal(rows().find((row) => row.id === "s1")!.status, "withdrawn");
  assert.equal(rows().filter((row) => row.status === "pending").length, 3);
});

// Through the shared tool loop and the real executor, as Harper's own
// schedule (tier 1) runs it: a service principal scoped to the one Role.
test("a Harper-started run: the tool is offered with its policy and the suggestion lands on the To-do", async () => {
  tables.company_workspace = [{ company_workspace_id: workspaceId, is_reviewing: false }];
  const { runOrgAgentToolLoop } = await import("./agent/chat");
  const scoped = withCompanyAgentScope(admin, {
    kind: "company_event", workspaceId, roleId, jobId: "job-1", leaseOwner: "worker-1", assertCurrent: async () => {},
  });
  const serviceUser = { id: "job-1", app_metadata: {}, user_metadata: {}, aud: "service", created_at: "2026-11-07" } as User;
  const seen: Array<{ tools: string[]; system: string; last: string }> = [];
  const complete = async (args: any) => {
    const contents = args.messages.map((message: any) => (typeof message.content === "string" ? message.content : JSON.stringify(message.content ?? "")));
    seen.push({ tools: (args.tools ?? []).map((tool: any) => tool.function.name).sort(), system: contents[0], last: contents.at(-1) });
    const message = seen.length === 1
      ? { role: "assistant", content: null, tool_calls: [{ id: "call-1", type: "function", function: { name: "manage_todo_suggestions", arguments: JSON.stringify({
          operation: "add", kind: "widen_search", title: "이번 주 검색에서 새 후보가 2명뿐이에요. 재직 기간 기준을 넓혀 다시 찾아볼까요?",
          plan: "재직 기간 기준을 '1년 이상'으로 넓힌 조건으로 이번 역할 후보를 다시 찾아 결과를 알려 드릴게요." }) } }] }
      : { role: "assistant", content: "할 일에 제안을 남겼어요." };
    return { model: MODEL, response: { choices: [{ message }] } } as any;
  };
  const context = {
    roles: [{ roleId, name: "프론트엔드 개발자", criteria: [] }], workspace: { companyName: "Example" }, companyText: "Example",
    rolesText: "-", recentRecommendationsText: "-", recentContactsText: "-", summariesText: "-", conversationText: "-",
    conversationMessages: [], contextNotesText: "-", defaultLongTextObservations: [],
  } as any;
  await runOrgAgentToolLoop({
    admin: scoped, user: serviceUser, conversation: { id: "conversation-1", company_workspace_id: workspaceId, role_id: roleId } as any, context,
    actorId: "job-1", actorLabel: "Harper company agent", currentUserMessageId: 77, model: MODEL, responseLocale: "ko",
    allowSilentCompletion: true, throwOnToolExecutionError: true, harperInitiated: true, capabilityMode: "full",
    allowedToolNames: new Set(["read_role", "read_conversation_history", "get_more_data", "get_talents", "read_talent", "manage_agent_schedule", "manage_todo_suggestions"]),
    source: "chat", readAudience: "company_safe", scopeKey: "agent-event:job-1", slackThreadId: null, mentions: [],
    userMessage: "Scheduled company work: look again at this Role's search results.",
  }, { complete });
  assert.ok(seen[0].tools.includes("manage_todo_suggestions"));
  assert.match(seen[0].system, /<capability_policy id="todo_suggestion">/);
  const [row] = rows();
  assert.equal(row.kind, "widen_search");
  assert.equal(row.title, "이번 주 검색에서 새 후보가 2명뿐이에요. 재직 기간 기준을 넓혀 다시 찾아볼까요?");
  assert.equal(row.source, "harper");
  assert.equal(row.status, "pending");
  // Harper is told what actually happened.
  assert.match(seen[1].last, /Suggestion s1 added to Role role-1's To-do/);
});
