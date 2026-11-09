import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as projection from "./coordination";
import { formatLlmDateTime } from "@/lib/llm/promptDateTime";

// Execute the real server/bridge with isolated persistence and provider adapters.
function load(file: string, dependencies: Record<string, unknown>) {
  const compiled = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} as Record<string, any> };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, Error, console, process: { env: {} },
    require: (name: string) => dependencies[name] ?? {},
  });
  return module.exports;
}

function fixture() {
  const rows: any[] = [];
  const keys: string[] = [];
  let failAvailability = false;
  let scoped = false;
  let permissionChecks = 0;
  const query = async (sql: string, params: any[] = []): Promise<any[]> => {
    if (sql.startsWith("select * from talent_opportunity_recommendation")) return [{ id: "recommendation" }];
    if (sql.startsWith("select id,conversation_id")) return [{ id: params[0], conversation_id: "conversation" }];
    if (sql.includes("create_meeting_schedule_draft_v1")) {
      const key = params[10];
      keys.push(key);
      let row = rows.find(r => r.key === key);
      if (!row) {
        row = { key, id: `meeting-${rows.length}`, role_id: "role", talent_id: "talent",
          company_workspace_id: "workspace", organizer_company_user_id: "company", version: 1,
          status: "preparing", title: params[5], duration_minutes: params[6],
          company_attendees: JSON.parse(params[7]), meeting_config_snapshot: JSON.parse(params[8]), source_refs: {} };
        rows.push(row);
      }
      return [{ value: { scheduleId: row.id } }];
    }
    if (sql.startsWith("update meeting_schedules set source_refs")) {
      const row = rows.find(r => r.id === params[0]);
      row.source_refs.coordination ??= JSON.parse(params[1]);
      return [];
    }
    if (sql.startsWith("select external_event_id")) return [];
    if (sql.startsWith("select id,role,company_user_id,content")) return [{ id: 1, role: "user", company_user_id: "company",
      created_at: "2030-01-01T00:00:00Z", content: "Tuesday afternoon is available; arrange the interview within that window." }];
    throw Error(`Unexpected query: ${sql}`);
  };
  const db = { query, transaction: (work: any) => work(query) };
  const execute = load("./coordinationServer.ts", {
    "node:crypto": crypto,
    "@/lib/agentContacts/store": { agentContactDatabase: () => db, assertAgentContactSource: async () => {}, assertAgentContactPair: async () => {} },
    "@/lib/agentContacts/companyScope": { companyAgentScope: () => scoped ? { kind: "service" } : null },
    "@/lib/org/server": { assertOrgRoleAccess: async () => {}, assertOrgWorkspacePermission: async () => { permissionChecks++; } },
    "@/lib/org/agent/data": { readOrgAgentTalent: async () => ({ positions: [{ roleId: "role", recommendationId: "recommendation", stage: "connected" }] }) },
    "@/lib/server/candidateAccess": { getSupabaseAdmin: () => ({}) },
    "./scheduleDraftServer": { resolveWorkspaceAttendees: async () => ({ attendees: [{ companyUserId: "company", email: "company@example.invalid" }], organizer: { companyUserId: "company" } }) },
    "./availabilityServer": { fetchMeetingAvailabilityForCompanyUser: async () => {
      if (failAvailability) throw Error("availability read failed after commit");
      return null;
    } },
    "./slotsServer": { fetchConfirmedHarperBusyRanges: async () => [], fetchSyncedGoogleCalendarBusyRanges: async () => [] },
    "./calendarSyncServer": { syncGoogleCalendarBusyBlocksIfStaleForCompanyUser: async () => ({ status: "not_connected" }) },
    "@/lib/llm/promptDateTime": { formatLlmDateTime },
    "./coordination": projection,
    "./coordinationStore": { readCoordinatedMeetings: async (_db: any, _workspace: string, input: any) => rows.filter(r => !input.scheduleId || r.id === input.scheduleId),
      assertMeetingRequestSource: async () => ({ company_user_id: "company" }) },
    "./meetingCalendarServer": { fetchMeetingCalendarDelivery: async () => ({ status: "failed", error: "Calendar access unavailable" }) },
    "@/lib/integrations/googleCalendarTools": { isValidCalendarTimezone: () => true },
  }).executeMeetingCoordination;
  const run = (input: any, messageId = 1) => execute({ input, admin: {}, user: { id: "company" }, workspaceId: "workspace",
    conversationId: "conversation", currentUserMessageId: messageId, actorLabel: "Company" });
  const prepare = { action: "prepare", roleId: "role", talentId: "talent", title: "Interview", purpose: "Team discussion", operationId: "request-one" };
  return { rows, keys, run, prepare, failAvailability: (value: boolean) => { failAvailability = value; },
    service: () => { scoped = true; }, permissionChecks: () => permissionChecks };
}

test("prepare retry from a later message reuses the request after a post-commit failure", async () => {
  const f = fixture();
  f.failAvailability(true);
  await assert.rejects(f.run(f.prepare), /after commit/);
  assert.equal(f.rows.length, 1);
  f.failAvailability(false);
  const result = await f.run(f.prepare, 2);
  assert.equal(f.rows.length, 1);
  assert.equal(f.keys[0], f.keys[1]);
  assert.equal(result.scheduleId, f.rows[0].id);
  assert.equal(f.rows[0].source_refs.coordination.messageId, 1);
  await f.run({ ...f.prepare, operationId: "separate-request" }, 3);
  assert.equal(f.rows.length, 2);
});

test("a unique candidate/Role read restores original delegation and delivery for the background agent", async () => {
  const f = fixture();
  await f.run(f.prepare);
  f.service();
  const checksBefore = f.permissionChecks();
  const result = await f.run({ action: "read", roleId: "role", talentId: "talent" });
  assert.equal(result.scheduleId, f.rows[0].id);
  assert.equal(result.version, 1);
  assert.equal(result.calendar.status, "failed");
  assert.match(result.modelOutput, /Tuesday afternoon is available/);
  assert.match(result.modelOutput, /Calendar access unavailable/);
  assert.ok(f.permissionChecks() > checksBefore);
});

test("multiple candidate meetings stay an index without arbitrarily picking a delegation", async () => {
  const f = fixture();
  await f.run(f.prepare);
  await f.run({ ...f.prepare, operationId: "second" });
  f.service();
  const result = await f.run({ action: "read", roleId: "role", talentId: "talent" });
  assert.equal(result.scheduleId, undefined);
  assert.equal(result.calendar, null);
  for (const row of f.rows) assert.ok(result.modelOutput.includes(row.id));
  assert.doesNotMatch(result.modelOutput, /Original meeting request/);
});

test("company tool bridge preserves a post-commit failure instead of claiming the operation never ran", async () => {
  const failure = Error("receipt read failed after saving the appointment");
  class InputError extends Error {}
  const execute = load("../org/agent/toolExecution.ts", {
    "@/lib/org/agent/toolAvailability": { assertOrgAgentToolAvailable: () => {}, OrgAgentToolInputError: InputError },
    "@/lib/agentContacts/companyScope": { companyAgentScope: () => null },
    "@/lib/org/workspaceReview.server": { assertReviewOnboardingTool: () => {} },
    "@/lib/meetings/coordinationServer": { executeMeetingCoordination: async () => { throw failure; } },
    "@/lib/career/promptLocale": { parseCareerPromptLocale: () => null },
  }).executeOrgAgentTool;
  await assert.rejects(execute({ name: "manage_meeting", input: { action: "confirm", scheduleId: "meeting" },
    admin: {}, user: { id: "company" }, conversation: { id: "conversation", company_workspace_id: "workspace" } }),
  (error: unknown) => error === failure && !(error instanceof InputError));
});
