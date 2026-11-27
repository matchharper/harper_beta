import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import { CAREER_WORK_TOOLS } from "./tools";

// The chat tool list reaches a server-only module on import; this test runs outside Next.js.
const nodeModule = Module as typeof Module & { _load: (request: string, parent: unknown, isMain: boolean) => unknown };
const originalLoad = nodeModule._load;
nodeModule._load = function (request, parent, isMain) {
  return request === "server-only" ? {} : originalLoad.call(this, request, parent, isMain);
};

const workId = "00000000-0000-4000-8000-000000000001";
const otherWorkId = "00000000-0000-4000-8000-000000000002";

test("work outcome calls use only their observed execution revision and preserve explicit revisions", async () => {
  for (const [action, target, explicit, expected] of [
    ["wait", workId, undefined, 3],
    ["finish", workId, undefined, 3],
    ["wait", workId, 5, 5],
    ["wait", otherWorkId, undefined, undefined],
    ["update", workId, undefined, undefined],
    ["cancel", workId, undefined, undefined],
  ] as const) {
    let input: any;
    const admin: any = {
      from: () => { throw new Error("Do not fetch the latest revision to bypass a conflict"); },
      rpc: async (name: string, args: any) => {
        assert.equal(name, "manage_career_work");
        input = args.p_input;
        // The database remains authoritative and can reject a concurrent update.
        return { data: null, error: { message: "Work revision conflict; read current work" } };
      },
    };
    await assert.rejects(CAREER_WORK_TOOLS.manage_work.execute!({
      action, work_id: target, ...(explicit === undefined ? {} : { expected_revision: explicit }),
    }, { admin, userId: "user", conversationId: "conversation", workId, workRevision: 3, userMessageIds: [42] }), /revision conflict/);
    assert.equal(input.expected_revision, expected);
    assert.deepEqual(input.source_refs, [42]);
  }
});

test("the model-facing tool schema explains the revision default and required caller values", async () => {
  const { resolveCareerChatTools } = await import("../llmTools");
  const tool = resolveCareerChatTools({ channel: "chat", isOnboardingDone: true }).tools
    .find(tool => tool.function.name === "manage_work")!;
  const schema = tool.function.parameters as any;
  assert.equal(schema.properties.expected_revision.minimum, 1);
  assert.match(schema.properties.expected_revision.description, /Required when updating or cancelling a work/);
  assert.match(schema.properties.expected_revision.description, /execution-start revision/);
  assert.match(schema.properties.expected_revision.description, /concurrent changes still conflict/);
});

const context = (admin: unknown, userMessageIds: number[] = [42]) => ({ admin, userId: "user", conversationId: "conversation", userMessageIds });
/** A database that refuses manage_career_work with `message` and answers each ref's availability from `available`. */
function refusingAdmin(message: string, available: (ref: { kind: string; id: string }) => boolean | Error = () => true) {
  const calls: { name: string; args: any }[] = [];
  const admin: any = {
    from: () => { throw new Error("Do not read around the database"); },
    rpc: async (name: string, args: any) => {
      calls.push({ name, args });
      if (name === "manage_career_work") return { data: null, error: { message } };
      if (name === "career_resource_available_v1") {
        const value = available(args.p_ref);
        return value instanceof Error ? { data: null, error: { message: value.message } } : { data: value, error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
  };
  return { admin, calls };
}
const rejection = async (promise: Promise<unknown>) => {
  try { await promise; } catch (error) { return error instanceof Error ? error.message : String(error); }
  assert.fail("expected a refusal");
};

test("a start missing its identity, purpose or user source is refused before the database, naming what to resend", async () => {
  for (const [input, messageIds, missing, hint] of [
    [{ instruction: "Apply to company A" }, [42], "identity", null],
    [{ identity: "  ", instruction: "Apply to company A", source_refs: [42] }, [], "identity", null],
    [{ identity: "apply:role-a" }, [42], "instruction", null],
    [{ identity: "apply:role-a", instruction: "Apply to company A" }, [], "source_refs", /This execution received no user message, so source_refs must name them/],
    [{ identity: "apply:role-a", instruction: "Apply to company A", source_refs: [] }, [41, 42], "source_refs", /Omit source_refs to cite the user messages delivered to this execution \(41, 42\)/],
    [{ mode: "current" }, [], "identity, instruction, source_refs", null],
  ] as const) {
    const { admin, calls } = refusingAdmin("must not be called");
    const message = await rejection(CAREER_WORK_TOOLS.manage_work.execute!({ action: "start", ...input }, context(admin, [...messageIds])));
    assert.equal(calls.length, 0, "the database is not asked");
    assert.match(message, new RegExp(`^Work not started: ${missing} missing\\. Resend the same start with identity, instruction and source_refs all set, keeping its mode, target and refs\\.`));
    assert.match(message, /source_refs: the exact IDs of the user messages that asked for this work \(shown as "User message <id>"\)/);
    if (hint) assert.match(message, hint);
  }
});

test("a complete start goes to the database with the delivered user messages as its source", async () => {
  const calls: { name: string; args: any }[] = [];
  const row = {
    id: workId, user_id: "00000000-0000-4000-8000-000000000003", conversation_id: "00000000-0000-4000-8000-000000000004",
    kind: "delegated_work", parent_id: null, idempotency_key: "apply:role-a", status: "ready", revision: 1,
    request: { instruction: "Apply to company A", source_refs: [42] }, result: {}, provider_refs: {},
    created_at: "2026-11-27T05:00:00.000Z", updated_at: "2026-11-27T05:00:00.000Z",
  };
  const admin: any = {
    from: () => { throw new Error("Do not read around the database"); },
    rpc: async (name: string, args: any) => {
      calls.push({ name, args });
      return name === "manage_career_work" ? { data: row, error: null } : { data: [], error: null };
    },
  };
  const result: any = await CAREER_WORK_TOOLS.manage_work.execute!({ action: "start", identity: "apply:role-a", instruction: "Apply to company A" }, context(admin));
  assert.equal(result.work.id, workId);
  const start = calls.find(call => call.name === "manage_career_work")!;
  assert.equal(start.args.p_action, "start");
  assert.deepEqual(start.args.p_input.source_refs, [42]);
  assert.equal(start.args.p_input.identity, "apply:role-a");
});

test("a refused ref is named so the same request can be resent without it", async (t) => {
  const warn = t.mock.method(console, "warn", () => undefined);
  const role = { kind: "role", id: "00000000-0000-4000-8000-000000000010" };
  const document = { kind: "document", id: "00000000-0000-4000-8000-000000000011" };
  const page = { kind: "web_resource", id: "77", revision: "00000000-0000-4000-8000-000000000012" };
  const { admin, calls } = refusingAdmin("Work resource unavailable", ref => ref.kind === "role");
  const message = await rejection(CAREER_WORK_TOOLS.manage_work.execute!({
    action: "start", identity: "apply:role-a", instruction: "Apply to company A", resource_refs: [role, document], context_refs: [page],
  }, context(admin)));
  assert.equal(message, `Work resource unavailable. Nothing was recorded. This user cannot use resource_refs ${JSON.stringify(document)}, context_refs ${JSON.stringify(page)}. Resend the same start without them, keeping its other values.`);
  // Each attached ref is checked again with the database's own availability function, as the user.
  assert.deepEqual(calls.filter(call => call.name === "career_resource_available_v1").map(call => call.args), [role, document, page].map(ref => ({ p_user: "user", p_ref: ref })));
  assert.deepEqual(warn.mock.calls[0].arguments[1], { action: "start", refs: [{ field: "resource_refs", ...document }, { field: "context_refs", ...page }] });

  const unknown = refusingAdmin("Work resource unavailable", () => new Error("statement timeout"));
  assert.equal(await rejection(CAREER_WORK_TOOLS.manage_work.execute!({ action: "update", work_id: workId, expected_revision: 2, context_refs: [page] }, context(unknown.admin))),
    "Work resource unavailable. Nothing was recorded. Which attached ref failed could not be identified. Resend the same update once; if it is refused again, resend it without resource_refs and context_refs, keeping its other values.");
});

test("other refusals keep the database's message and say the next step, without reading around the database", async () => {
  const start = { action: "start", identity: "apply:role-a", instruction: "Apply to company A" };
  for (const [input, messageIds, refusal, step] of [
    [{ action: "update", work_id: workId, expected_revision: 2 }, [42], "Work revision conflict; read current work",
      `manage_work read with work_id ${workId} shows its current revision and instructions; resend with that revision as expected_revision only if your change still applies.`],
    [{ action: "update", work_id: workId, expected_revision: 2, instruction: "Also company B" }, [], "User source required",
      `update needs the user message that asks for it: set source_refs to that message's exact ID (shown as "User message <id>"), or omit source_refs when it was delivered to this execution, and resend the same update.`],
    [{ ...start, source_refs: [7] }, [42], "User source unavailable", /^Every source_refs ID must be a user message of this conversation\. Resend the same start .*conversation positions are not IDs\.$/],
    [start, [42], "User stopped this request", "The user stopped the message it cites. Do not resend it; act only on a new request."],
    [{ ...start, mode: "current" }, [42], "Origin execution claim unavailable", /^mode=current records work only from the reply holding this conversation's live execution claim.*Resend the same start once in your next step; if it is refused again, use mode=independent only when the work must go on beyond this reply/],
    [{ action: "finish", work_id: workId, expected_revision: 2, note: "Submitted" }, [42], "Origin execution claim unavailable", /^Only the reply holding its origin conversation's live execution claim can wait or finish this work\. From another conversation, use update to route the change there; otherwise resend the same finish once in your next step/],
    [{ action: "wait", work_id: otherWorkId, expected_revision: 2, note: "Waiting for the user" }, [42], "Only the executing work may report its outcome", /^Only this work's own delegated execution can wait or finish it\. From here, use update .* or cancel to stop it\.$/],
    [{ action: "cancel", work_id: otherWorkId, expected_revision: 2 }, [42], "Work unavailable", /Find the exact work_id with manage_work list/],
  ] as const) {
    const { admin, calls } = refusingAdmin(refusal);
    const message = await rejection(CAREER_WORK_TOOLS.manage_work.execute!(input, context(admin, [...messageIds])));
    assert.ok(message.startsWith(`${refusal}. Nothing was recorded. `), message);
    const rest = message.slice(`${refusal}. Nothing was recorded. `.length);
    if (typeof step === "string") assert.equal(rest, step);
    else assert.match(rest, step);
    assert.deepEqual(calls.map(call => call.name), ["manage_career_work"]);
  }
  // A refusal with no step the model can take stays as the database wrote it.
  const closed = refusingAdmin("Account is closed");
  assert.equal(await rejection(CAREER_WORK_TOOLS.manage_work.execute!(start, context(closed.admin))), "Account is closed");
});
