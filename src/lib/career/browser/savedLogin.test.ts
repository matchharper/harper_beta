import assert from "node:assert/strict";
import test from "node:test";
import { browserUseAgents } from "../simulation/browserUseAgents";
import type { ExternalToolContext } from "../externalOperations/store";
import { enableSavedLogin, forgetSavedLogin, readSavedLogin, savedLoginProfileId } from "./savedLogin";
import { executeUseBrowser } from "./tool";

process.env.BROWSER_USE_API_KEY = "fixture-key";
const userId = "00000000-0000-4000-8000-000000000001";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const profileId = id(70);

function store(tables: Record<string, Record<string, any>[]>) {
  const from = (table: string) => {
    const rows = (tables[table] ??= []);
    const filters: [string, unknown][] = [];
    let changes: Record<string, unknown> | undefined;
    const matches = (row: Record<string, any>) => filters.every(([key, value]) => row[key] === value);
    const chain: any = {
      select: () => chain,
      eq: (key: string, value: unknown) => { filters.push([key, value]); return chain; },
      update: (value: Record<string, unknown>) => { changes = value; return chain; },
      in: (key: string, values: unknown[]) => Promise.resolve({
        data: rows.filter(row => matches(row) && values.includes(row[key])).map(row => structuredClone(row)), error: null }),
      maybeSingle: async () => {
        const row = rows.find(matches);
        if (row && changes) Object.assign(row, changes);
        return { data: row ? structuredClone(row) : null, error: null };
      },
    };
    return chain;
  };
  const rpc = async (name: string, args: Record<string, any>) => {
    if (name !== "create_talent_external_operation") throw new Error(`reached ${name}`);
    const rows = (tables.talent_external_operations ??= []);
    let row = rows.find(r => r.user_id === args.p_user_id && r.kind === args.p_kind && r.idempotency_key === args.p_idempotency_key);
    if (!row) {
      row = { id: id(60 + rows.length), user_id: args.p_user_id, conversation_id: args.p_conversation_id, kind: args.p_kind,
        parent_id: args.p_parent_id, idempotency_key: args.p_idempotency_key, status: "reserved", revision: 1,
        request: args.p_request, result: {}, provider_refs: {}, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      rows.push(row);
    }
    return { data: structuredClone(row), error: null };
  };
  return { from, rpc } as any;
}
const context = (tables: Record<string, Record<string, any>[]>, userMessageId?: number): ExternalToolContext => ({
  admin: store({ talent_users: [{ user_id: userId, deleted_at: null }],
    talent_messages: [{ id: 77, user_id: userId, conversation_id: id(99), role: "user", payload: {}, content: "네, 로그인 저장해 주세요" },
      // A start form answered with the keep-login box left unchecked, and one answered (with another form) checked.
      { id: 78, user_id: userId, conversation_id: id(99), role: "user", content: "", payload: { formId: 5, values: { save_login: false, salary: "8000만원" } } },
      { id: 79, user_id: userId, conversation_id: id(99), role: "user", content: "",
        payload: { responses: [{ formId: 6, values: {} }, { formId: 5, values: { save_login: true } }] } }], ...tables }),
  userId, conversationId: id(99), requestId: "save-login", userMessageId,
});
function provider(t: test.TestContext) {
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    calls.push(`${init.method} ${new URL(url).pathname}`);
    if (init.method === "POST" && url.endsWith("/profiles")) {
      assert.equal(JSON.parse(String(init.body)).userId, userId);
      return Response.json({ id: profileId });
    }
    return new Response(null, { status: 204 });
  });
  return calls;
}

test("agreeing twice keeps one saved login: the provider profile is created once", async (t) => {
  const calls = provider(t);
  const scope = context({}, 77);
  await enableSavedLogin(scope);
  await enableSavedLogin(scope);
  assert.deepEqual(calls, ["POST /api/v4/profiles"]);
  const row = await readSavedLogin(scope);
  assert.equal(savedLoginProfileId(row), profileId);
  assert.equal(row?.result.consent_message_id, 77);
});

test("forgetting deletes the provider profile, so no later browser starts signed in", async (t) => {
  const calls = provider(t);
  const scope = context({}, 77);
  await enableSavedLogin(scope);
  await forgetSavedLogin(scope);
  assert.deepEqual(calls, ["POST /api/v4/profiles", `DELETE /api/v4/profiles/${profileId}`]);
  assert.equal(savedLoginProfileId(await readSavedLogin(scope)), null);
  // Agreeing again later makes a new profile rather than reviving the deleted one.
  await enableSavedLogin(scope);
  assert.equal(calls.filter(call => call === "POST /api/v4/profiles").length, 2);
});

test("a run passes the saved login only as asked: omitted keeps the browser, null leaves a profiled browser", async (t) => {
  const bodies: any[] = [];
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    return Response.json({ id: id(1), sessionId: id(2), status: "running" });
  });
  await browserUseAgents.createRun("task", {}, undefined, undefined, {});
  await browserUseAgents.createRun("task", {}, undefined, undefined, { profileId });
  await browserUseAgents.createRun("task", {}, undefined, undefined, { profileId: null });
  assert.deepEqual(bodies.map(body => body.browserSettings), [
    { record: false }, { record: false, profileId }, { record: false, profileId: null },
  ]);
});

test("save_login on a browser that is already open starts nothing and asks for a new browser", async (t) => {
  const calls = provider(t);
  const session = { id: id(1), user_id: userId, conversation_id: id(99), parent_id: null, kind: "browser_session", status: "idle",
    revision: 1, idempotency_key: "s", request: {}, result: {}, provider_refs: { workspace_id: "ws" }, created_at: "", updated_at: "" };
  const tables = { talent_external_operations: [session] };
  await assert.rejects(executeUseBrowser({ action: "run", session_id: id(1), task: "Sign in", save_login: true }, context(tables, 77)),
    /save_login applies to a new browser/);
  assert.deepEqual(calls, []);
  assert.equal(tables.talent_external_operations.length, 1);
});

test("save_login without the user's agreement message is refused before any browser starts", async (t) => {
  const calls = provider(t);
  const tables: Record<string, Record<string, any>[]> = { talent_external_operations: [] };
  await assert.rejects(executeUseBrowser({ action: "run", task: "Sign in", save_login: true }, context(tables)),
    /Saving login requires the user's agreement/);
  assert.deepEqual(calls, []);
  assert.equal(tables.talent_external_operations.length, 0);
});

test("checking keep-signed-in in the viewer is the consent: it turns saved login on, then returns control to Harper", async (t) => {
  const { turnOnSavedLoginFromViewer, formatBrowserControlReturn } = await import("./control");
  const calls = provider(t);
  const session = (status: string, revision: number, provider_refs: Record<string, unknown> = {}) => ({ id: id(5), user_id: userId,
    conversation_id: id(99), parent_id: null, kind: "browser_session", status, revision, idempotency_key: "s", request: {},
    result: {}, provider_refs: { workspace_id: "ws", ...provider_refs }, created_at: "", updated_at: "" });
  // Control already moved on, a stale card, or a browser that already keeps sign-ins: nothing changes.
  for (const row of [session("idle", 3), session("human", 4), session("human", 3, { profile_id: profileId })]) {
    const tables = { talent_external_operations: [row] };
    const scope = context(tables);
    assert.equal((await turnOnSavedLoginFromViewer(scope, id(5), 3)).id, id(5));
    assert.equal(await readSavedLogin(scope), null);
  }
  assert.deepEqual(calls, []);
  const tables = { talent_external_operations: [session("human", 3)] };
  const scope = context(tables);
  // The fixture stops at the control-return RPC: consent is recorded before control goes back to Harper.
  await assert.rejects(turnOnSavedLoginFromViewer(scope, id(5), 3), /reached return_career_browser_control/);
  const saved = await readSavedLogin(scope);
  assert.equal(savedLoginProfileId(saved), profileId);
  assert.deepEqual([saved?.result.consent_source, saved?.result.consent_session_id, saved?.result.consent_message_id],
    ["browser_viewer", id(5), null]);
  const event = formatBrowserControlReturn(session("idle", 4) as any, [{ id: id(6), kind: "browser_run", parent_id: id(5), status: "completed",
    result: { url: "https://jobs.example.test/login", needsUser: true }, request: {}, provider_refs: {} } as any], 4, { savedLoginTurnedOn: true });
  assert.match(event, /checked "keep me signed in/);
  assert.match(event, /page waiting for sign-in was https:\/\/jobs\.example\.test\/login/);
  assert.match(event, /has not signed in yet/);
  assert.doesNotMatch(event, /selected Done/);
});

test("a form answer turns saved login on only when its save_login consent is checked", async (t) => {
  const calls = provider(t);
  const unchecked: Record<string, Record<string, any>[]> = { talent_external_operations: [] };
  await assert.rejects(executeUseBrowser({ action: "run", task: "Sign in", save_login: true, authorization_refs: [78] }, context(unchecked)),
    /check of the save_login consent/);
  assert.deepEqual(calls, []);
  assert.equal(unchecked.talent_external_operations.length, 0);

  const checked: Record<string, Record<string, any>[]> = { talent_external_operations: [] };
  const scope = context(checked);
  // The fixture provider stops after the profile is made; the consent is recorded before any browser starts.
  await executeUseBrowser({ action: "run", task: "Sign in", save_login: true, authorization_refs: [79] }, scope).catch(() => undefined);
  const saved = await readSavedLogin(scope);
  assert.equal(savedLoginProfileId(saved), profileId);
  assert.equal(saved?.result.consent_message_id, 79);
});
