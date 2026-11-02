import test from "node:test";
import assert from "node:assert/strict";
import { executeUseBrowser, refreshBrowserExecution, observeBrowserSession, formatBrowserToolResult, formatBrowserSessionResult } from "./tool";
import { browserUseAgents } from "../simulation/browserUseAgents";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import type { ExternalOperation } from "../externalOperations/store";
const userId = "00000000-0000-4000-8000-000000000001",
  conversationId = "00000000-0000-4000-8000-000000000002",
  sessionId = "00000000-0000-4000-8000-000000000003",
  executionId = "00000000-0000-4000-8000-000000000004",
  remoteSession = "00000000-0000-4000-8000-000000000005",
  remoteRun = "00000000-0000-4000-8000-000000000006";
function fixture(runStatus = "running") {
  const base = {
    user_id: userId,
    conversation_id: conversationId,
    idempotency_key: "fixture",
    revision: 1,
    request: {},
    result: {},
    created_at: "2026-10-29T00:00:00Z",
    updated_at: "2026-10-29T00:00:00Z",
  };
  const rows: ExternalOperation[] = [
    {
      ...base,
      id: sessionId,
      parent_id: null,
      kind: "browser_session",
      status: "running",
      provider_refs: {
        current_execution_id: executionId,
        session_id: remoteSession,
      },
    },
    {
      ...base,
      id: executionId,
      parent_id: sessionId,
      kind: "browser_run",
      status: runStatus,
      provider_refs: {
        session_id: remoteSession,
        ...(["reserved", "preparing", "dispatching"].includes(runStatus)
          ? {}
          : { run_id: remoteRun }),
      },
    },
  ];
  const messages: Record<string, any>[] = [];
  const admin = {
    rpc: async (_name: string, args: Record<string, unknown>) => {
      rows[1].request = args.p_request as Record<string, unknown>;
      if (rows[1].status === "reserved") rows[0].status = "running";
      return { data: structuredClone(rows[1]), error: null };
    },
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      let changes: Record<string, unknown> | undefined;
      const chain = {
        select: () => chain,
        eq: (key: string, value: unknown) => {
          filters[key] = value;
          return chain;
        },
        update: (value: Record<string, unknown>) => {
          changes = value;
          return chain;
        },
        insert: (value: Record<string, unknown>) => {
          assert.equal(table, "talent_messages");
          messages.push({ ...value, id: messages.length + 1, created_at: base.created_at });
          return chain;
        },
        single: async () => ({ data: structuredClone(messages.at(-1)), error: null }),
        maybeSingle: async () => {
          const row = (table === "talent_messages" ? messages : rows).find((row) =>
            Object.entries(filters).every(
              ([key, value]) => (key === "payload->>requestId"
                ? (row as Record<string, any>).payload?.requestId
                : row[key as keyof ExternalOperation]) === value
            )
          );
          if (row && changes) Object.assign(row, changes);
          return { data: row ? structuredClone(row) : null, error: null };
        },
      };
      return chain;
    },
  };
  return {
    rows,
    messages,
    context: {
      admin: admin as unknown as TalentAdminClient,
      userId,
      conversationId,
      requestId: "control",
      controlSource: "user" as const,
    },
  };
}
for (const replaceAttachments of [false, true]) {
  test(`resuming a browser ${replaceAttachments ? "clears attachments only for an explicit empty selection" : "preserves existing attachments when documents are omitted"}`, async (t) => {
    const { rows, messages, context } = fixture("reserved");
    rows[0].status = "human";
    rows[0].provider_refs.workspace_id = "00000000-0000-4000-8000-000000000007";
    let clearCount = 0;
    t.mock.method(browserUseAgents, "clearFiles", async (workspaceId: string) => {
      assert.equal(workspaceId, rows[0].provider_refs.workspace_id);
      clearCount++;
    });
    t.mock.method(browserUseAgents, "upload", async (_id: string, files: unknown[]) => {
      assert.deepEqual(files, []);
      return [];
    });
    let dispatched = false;
    t.mock.method(browserUseAgents, "createRun", async (
      _task: string,
      _schema: unknown,
      workspaceId: string,
      sessionId: string,
      options: { keepAlive?: number },
    ) => {
      dispatched = true;
      assert.equal(workspaceId, rows[0].provider_refs.workspace_id);
      assert.equal(sessionId, remoteSession);
      assert.equal(options.keepAlive, 600);
      // Stop at dispatch to test an unknown provider outcome.
      throw new Error("Provider response unavailable in this attachment test");
    });
    t.mock.method(console, "error", () => {});
    const result = await executeUseBrowser({
      action: "run",
      session_id: sessionId,
      task: "Continue the existing application",
      ...(replaceAttachments ? { documents: [] } : {}),
    }, context);
    assert.equal(dispatched, true);
    assert.equal(clearCount, replaceAttachments ? 1 : 0);
    assert.equal(result.operation?.status, "uncertain");
    assert.equal(result.message?.messageType, "browser_session");
    assert.equal(messages[0].payload.session_id, sessionId);
    const repeated = await executeUseBrowser({
      action: "run", session_id: sessionId, task: "Continue the existing application",
      ...(replaceAttachments ? { documents: [] } : {}),
    }, context);
    assert.equal(messages.length, 1);
    assert.equal(repeated.message?.id, result.message?.id);
  });
}
test("run delivers the browser card before waiting and returns the observation to the same tool call", async (t) => {
  const { rows, context } = fixture("reserved");
  rows[0].status = "human";
  rows[0].provider_refs.workspace_id = remoteSession;
  let dispatched = 0;
  let finish!: () => void;
  let started!: () => void;
  const observing = new Promise<void>(resolve => { started = resolve; });
  const finished = new Promise<void>(resolve => { finish = resolve; });
  t.mock.method(browserUseAgents, "upload", async () => []);
  t.mock.method(browserUseAgents, "createRun", async () => {
    dispatched++;
    return { id: remoteRun, sessionId: remoteSession, status: "running" };
  });
  t.mock.method(browserUseAgents, "status", async () => {
    started();
    await finished;
    return { status: "completed" };
  });
  t.mock.method(browserUseAgents, "result", async () => ({
    id: remoteRun, sessionId: remoteSession, status: "completed",
    output: { summary: "The application is prepared for review.", evidence: ["Resume attached; not submitted."], needsUser: false, url: "https://jobs.example.test/apply" },
  }));
  const presented: number[] = [];
  let returned = false;
  const input = { action: "run", session_id: sessionId, task: "Prepare the application" };
  const pending = executeUseBrowser(input, context, message => { presented.push(Number(message.id)); })
    .then(result => { returned = true; return result; });
  await observing;
  assert.equal(returned, false, "the tool stays in the original request while the browser is working");
  assert.equal(presented.length, 1, "the live browser card is already delivered");
  finish();
  const result = await pending;
  assert.equal(result.operation?.status, "completed");
  assert.equal(result.session?.status, "idle");
  assert.match(result.modelOutput, /The application is prepared for review/);
  assert.match(result.modelOutput, /Resume attached; not submitted/);
  assert.doesNotMatch(result.modelOutput, /Background observation|resume this conversation automatically/);
  const repeated = await executeUseBrowser(input, context);
  assert.equal(dispatched, 1, "retrying the same tool call never submits another browser task");
  assert.equal(repeated.operation?.id, result.operation?.id);
});

test("an aborted chat stops waiting without redispatching its existing browser execution", async (t) => {
  const { rows, context } = fixture();
  const controller = new AbortController();
  controller.abort();
  t.mock.method(browserUseAgents, "createRun", async () => assert.fail("Existing execution must not be repeated"));
  await assert.rejects(
    executeUseBrowser({ action: "run", session_id: sessionId, task: "Prepare the application" }, { ...context, signal: controller.signal }),
    { name: "AbortError" }
  );
  assert.equal(rows[1].status, "running", "the saved execution remains available for a read after disconnection");
});

test("Stop racing with browser dispatch cancels that run and retains its completed external result", async (t) => {
  const { rows, context } = fixture("reserved");
  rows[0].status = "human";
  rows[0].provider_refs.workspace_id = remoteSession;
  const controller = new AbortController();
  let cancellations = 0;
  t.mock.method(console, "error", () => {});
  t.mock.method(browserUseAgents, "upload", async () => []);
  t.mock.method(browserUseAgents, "createRun", async () => {
    controller.abort(new DOMException("User stopped", "AbortError"));
    return { id: remoteRun, sessionId: remoteSession, status: "running" };
  });
  t.mock.method(browserUseAgents, "cancelRun", async (id: string) => { assert.equal(id, remoteRun); cancellations++; });
  t.mock.method(browserUseAgents, "status", async () => ({ status: "completed" }));
  t.mock.method(browserUseAgents, "result", async () => ({
    id: remoteRun, status: "completed", output: {
      summary: "The site confirmed submission before cancellation arrived.", evidence: ["Submission confirmation"], needsUser: false, url: "https://jobs.example.test/done",
    },
  }));
  await assert.rejects(executeUseBrowser({ action: "run", session_id: sessionId, task: "Submit the authorized application" },
    { ...context, signal: controller.signal }), { name: "AbortError" });
  assert.equal(cancellations, 1);
  assert.equal(rows[1].status, "completed");
  assert.equal(rows[1].result.summary, "The site confirmed submission before cancellation arrived.");
});

test("session reads expose the current observation and retain older execution references for explicit history reads", () => {
  const { rows } = fixture("completed");
  rows[1].result = { summary: "The current browser has a phone number and no attached file.", needsUser: true };
  const earlier = { ...rows[1], id: "00000000-0000-4000-8000-000000000008",
    result: { summary: "An earlier browser had an attachment and no phone number.", needsUser: true } };
  const result = formatBrowserSessionResult(rows[0], [rows[1], earlier]);
  assert.ok(result.includes(rows[1].result.summary as string));
  assert.ok(result.includes(earlier.id));
  assert.ok(!result.includes(earlier.result.summary));
  assert.ok(formatBrowserToolResult([earlier]).includes(earlier.result.summary));
});
test("handoff cancels the agent, keeps its browser alive and records the actual user control action", async (t) => {
  const { rows, context } = fixture();
  let cancelled = 0;
  t.mock.method(browserUseAgents, "cancelRun", async (id: string) => {
    assert.equal(id, remoteRun);
    cancelled++;
    return { status: "cancelled" };
  });
  t.mock.method(browserUseAgents, "status", async () => ({
    status: "cancelled",
  }));
  t.mock.method(browserUseAgents, "result", async () => ({
    id: remoteRun,
    sessionId: remoteSession,
    status: "cancelled",
    output: {
      summary: "Agent cancelled",
      evidence: [],
      needsUser: false,
      url: "https://jobs.example.test",
    },
  }));
  t.mock.method(browserUseAgents, "stop", async () =>
    assert.fail("Handoff must retain the browser")
  );
  const result = await executeUseBrowser(
    { action: "handoff", session_id: sessionId },
    context
  );
  assert.equal(cancelled, 1);
  assert.equal(rows[0].status, "human");
  assert.equal(rows[1].status, "cancelled");
  assert.match(result.modelOutput, /User selected browser handoff/);
  assert.match(result.modelOutput, /Handoff interrupts at the current page/);
  assert.match(result.modelOutput, /Agent cancelled/);
  assert.ok(result.modelOutput.includes(`execution_id: ${executionId}`));
});
test("close during attachment preparation revokes dispatch and closes only the owned session", async (t) => {
  const { rows, context } = fixture("preparing");
  let stopped = 0;
  t.mock.method(browserUseAgents, "cancelRun", async () =>
    assert.fail("No provider run has been dispatched")
  );
  t.mock.method(
    browserUseAgents,
    "stop",
    async (state: Parameters<typeof browserUseAgents.stop>[0]) => {
      stopped++;
      assert.equal(state.sessionId, remoteSession);
    }
  );
  const result = await executeUseBrowser(
    { action: "close", session_id: sessionId },
    context
  );
  assert.equal(stopped, 1);
  assert.equal(rows[1].status, "cancelled");
  assert.equal(rows[0].status, "closed");
  assert.match(result.modelOutput, /User selected browser close/);
});
test("unknown dispatch cannot claim successful close or release its session for a competing run", async (t) => {
  const { rows, context } = fixture("dispatching");
  t.mock.method(browserUseAgents, "stop", async () =>
    assert.fail("Unknown execution cannot be certified stopped")
  );
  const result = await executeUseBrowser(
    { action: "close", session_id: sessionId },
    context
  );
  assert.equal(rows[0].status, "closing");
  assert.equal(rows[1].status, "dispatching");
  assert.match(result.modelOutput, /dispatch is unresolved/);
});
test("a repeated completion repairs a previously unsaved parent session without rerunning the browser", async (t) => {
  const { rows, context } = fixture("completed");
  rows[0].provider_refs = { current_execution_id: executionId };
  rows[1].result = { summary: "Login needed", needsUser: true };
  t.mock.method(browserUseAgents, "status", async () =>
    assert.fail("Terminal observation is already saved")
  );
  await refreshBrowserExecution(context, structuredClone(rows[1]));
  assert.equal(rows[0].status, "human");
  assert.equal(rows[0].provider_refs.session_id, remoteSession);
});
test("viewer actions cannot operate another owner's session", async (t) => {
  const { context } = fixture();
  t.mock.method(browserUseAgents, "stop", async () =>
    assert.fail("No unauthorized provider call")
  );
  await assert.rejects(
    executeUseBrowser(
      { action: "close", session_id: sessionId },
      { ...context, userId: "00000000-0000-4000-8000-000000000009" }
    ),
    /unavailable/
  );
});

test("confirmed stopped browser removes stale human control while retaining the resumable session and files", async (t) => {
  const { rows, context } = fixture("completed");
  rows[0].status = "human";
  rows[0].provider_refs.workspace_id = "00000000-0000-4000-8000-000000000007";
  rows[1].result = { needsUser: true };
  t.mock.method(browserUseAgents, "inspectSessionBrowser", async () => ({ availability: "stopped", liveUrl: null }));
  t.mock.method(browserUseAgents, "stop", async () => assert.fail("Observation must not close the logical session or remove files"));
  const view = await observeBrowserSession(context, structuredClone(rows[0]));
  assert.equal(view.browserAvailability, "stopped");
  assert.equal(view.liveUrl, null);
  assert.equal(rows[0].status, "idle");
  assert.equal(rows[0].provider_refs.session_id, remoteSession);
  assert.ok(rows[0].provider_refs.workspace_id);
  const text = formatBrowserToolResult([view.session, rows[1]]);
  assert.match(text, /old tabs and page state are no longer available/);
  assert.match(text, /new browser keeps the conversation and workspace files/);
  assert.doesNotMatch(text, /The browser is paused/);
});

test("missing browser observations and network errors do not mark the session stopped", async (t) => {
  for (const failed of [false, true]) {
    const { rows, context } = fixture("completed");
    rows[0].status = "human";
    const mock = t.mock.method(browserUseAgents, "inspectSessionBrowser", async () => {
      if (failed) throw new Error("Network unavailable");
      return { availability: "unknown", liveUrl: null };
    });
    const view = await observeBrowserSession(context, structuredClone(rows[0]));
    assert.equal(view.browserAvailability, "unknown");
    assert.equal(rows[0].status, "human");
    assert.equal(rows[0].revision, 1);
    assert.match(formatBrowserToolResult([view.session]), /availability could not be confirmed/);
    mock.mock.restore();
  }
});

test("an active run retains its execution state and live preview", async (t) => {
  const { rows, context } = fixture();
  t.mock.method(browserUseAgents, "inspectSessionBrowser", async () => ({ availability: "active", liveUrl: "https://live.browser-use.com/viewer" }));
  const view = await observeBrowserSession(context, structuredClone(rows[0]));
  assert.equal(view.browserAvailability, "active");
  assert.ok(view.liveUrl);
  assert.equal(rows[0].status, "running");
  assert.equal(rows[0].revision, 1);
});


test("preparation failure remains readable and does not dispatch an external browser action", async (t) => {
  const { rows, context } = fixture("reserved");
  rows[0].status = "idle";
  rows[0].provider_refs.workspace_id = remoteSession;
  t.mock.method(browserUseAgents, "clearFiles", async () => { throw new Error("Browser Use file cleanup failed (HTTP 409)"); });
  let dispatched = false;
  t.mock.method(browserUseAgents, "createRun", async () => { dispatched = true; throw new Error("must not dispatch"); });
  const result = await executeUseBrowser({ action: "run", session_id: sessionId, task: "Use reviewed values", documents: [] }, context);
  assert.equal(dispatched, false);
  assert.equal(result.ok, false);
  assert.equal(result.status, "failed");
  assert.equal(result.operation?.status, "failed");
  assert.match(result.modelOutput, /file cleanup failed \(HTTP 409\)/);
});


test("Stop while observing an existing browser run cancels the remote execution", async (t) => {
  const { rows, context } = fixture("running");
  const controller = new AbortController();
  let cancellations = 0;
  t.mock.method(browserUseAgents, "createRun", async () => assert.fail("Do not dispatch an existing run again"));
  t.mock.method(browserUseAgents, "status", async () => {
    controller.abort(new DOMException("User stopped", "AbortError"));
    return { status: cancellations ? "cancelled" : "running" };
  });
  t.mock.method(browserUseAgents, "cancelRun", async (id: string) => { assert.equal(id, remoteRun); cancellations++; });
  t.mock.method(browserUseAgents, "result", async () => ({ id: remoteRun, status: "cancelled", output: {
    summary: "Stopped at the current page.", evidence: [], needsUser: false, url: "https://jobs.example.test/apply",
  } }));
  await assert.rejects(executeUseBrowser({ action: "run", session_id: sessionId, task: "Continue the same work" },
    { ...context, signal: controller.signal }), { name: "AbortError" });
  assert.equal(cancellations, 1);
  assert.equal(rows[1].status, "cancelled");
});

test("a completion saved during remote cancellation keeps its terminal status and evidence", async (t) => {
  const { rows, context } = fixture("running");
  const controller = new AbortController();
  const result = { summary: "Submission was confirmed.", evidence: ["Confirmation page"], needsUser: false, url: "https://jobs.example.test/done" };
  t.mock.method(console, "error", () => {});
  t.mock.method(browserUseAgents, "status", async () => {
    controller.abort(new DOMException("User stopped", "AbortError"));
    return { status: "running" };
  });
  t.mock.method(browserUseAgents, "cancelRun", async () => {
    rows[1].status = "completed";
    rows[1].result = result;
    rows[1].revision++;
  });
  await assert.rejects(executeUseBrowser({ action: "run", session_id: sessionId, task: "Continue the existing run" },
    { ...context, signal: controller.signal }), { name: "AbortError" });
  assert.equal(rows[1].status, "completed");
  assert.deepEqual(rows[1].result, result);
});


test("a host deadline yields the existing browser and its next invocation reads the receipt without redispatch", async (t) => {
  const { rows, context } = fixture();
  let completed = false;
  t.mock.method(browserUseAgents, "status", async () => ({ status: completed ? "completed" : "running" }));
  t.mock.method(browserUseAgents, "inspectSessionBrowser", async () => ({ availability: "running", liveUrl: null }));
  t.mock.method(browserUseAgents, "result", async () => ({ id: remoteRun, status: "completed",
    output: { summary: "Application received", evidence: ["Receipt TEST-42"], needsUser: false, url: "https://example.test/receipt" } }));
  t.mock.method(browserUseAgents, "createRun", async () => assert.fail("Do not dispatch the same application again"));
  t.mock.method(browserUseAgents, "cancelRun", async () => assert.fail("A host time budget is not cancellation"));
  const first = await executeUseBrowser({ action: "read", execution_id: executionId }, { ...context, deadlineAt: Date.now() - 1 });
  assert.equal(first.operation?.status, "running");
  assert.equal(rows[1].status, "running");
  const { CareerCapabilityRuntime, CareerReplyContinuation } = await import("../capabilities/runtime");
  const saved: any[] = [];
  const runtime = new CareerCapabilityRuntime({ mode: "progressive", eligibleTools: [], deadlineAt: Date.now() - 1,
    continuation: { channel: "adapter", emailReplyJobId: "email-job" },
    checkpoint: async checkpoint => { saved.push(checkpoint); },
    promptArgs: () => ({ channel: "chat", isOnboardingDone: true, profile: null, structuredProfileText: "", talentContextSection: "" }),
  });
  await assert.rejects(runtime.beforeCompletion(runtime.resolveStep(false), { transport: "chat", messages: [{ role: "tool", content: first.modelOutput }] }), CareerReplyContinuation);
  assert.equal(saved[0].continuation.emailReplyJobId, "email-job");
  assert.ok(saved[0].messages[0].content.includes(executionId));
  assert.equal(saved[0].waitFor, undefined, "the same email can resume without waiting for another provider callback");
  completed = true;
  const next = await executeUseBrowser({ action: "read", execution_id: executionId }, { ...context, deadlineAt: Date.now() + 1000 });
  assert.equal(next.operation?.id, first.operation?.id);
  assert.equal(next.operation?.status, "completed");
  assert.match(next.modelOutput, /Receipt TEST-42/);
});
