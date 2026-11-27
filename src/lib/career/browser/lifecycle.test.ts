import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { executeUseBrowser, refreshBrowserExecution, observeBrowserSession, formatBrowserToolResult, formatBrowserSessionResult } from "./tool";
import { browserUseAgents, BrowserUseHttpError, type SessionPageCapture } from "../simulation/browserUseAgents";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import type { ExternalOperation } from "../externalOperations/store";
const userId = "00000000-0000-4000-8000-000000000001",
  conversationId = "00000000-0000-4000-8000-000000000002",
  sessionId = "00000000-0000-4000-8000-000000000003",
  executionId = "00000000-0000-4000-8000-000000000004",
  remoteSession = "00000000-0000-4000-8000-000000000005",
  remoteRun = "00000000-0000-4000-8000-000000000006";
// A preparation run clears the browser's files first; tests that check files mock this again.
mock.method(browserUseAgents, "clearFiles", async () => {});
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
      // The reservation RPC below returns this run as the calling request's own receipt.
      idempotency_key: "control",
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
      if (_name === "claim_career_browser_resource") {
        const session = rows[0], run = rows[1];
        if (args.p_action === "prepare") {
          if (!["idle", "running"].includes(session.status)) return { error: { message: "Browser execution changed" } };
          session.status = "running";
          if (session.result.browser_availability === "stopped") delete session.provider_refs.session_id;
          delete session.result.browser_availability;
          run.status = "preparing";
          session.revision++; run.revision++;
        } else {
          if (!["idle", "running", "releasing"].includes(session.status) ||
            !(["completed", "failed", "cancelled"].includes(run.status) ||
              (["reserved", "capacity_wait"].includes(run.status) && !run.provider_refs.run_id)))
            return { data: { claimed: false, session: structuredClone(session) }, error: null };
          session.status = "releasing"; session.revision++;
        }
        return { data: { claimed: true, session: structuredClone(session), operation: structuredClone(run) }, error: null };
      }
      assert.equal(_name, "create_talent_external_operation");
      // The production reservation RPC returns an existing receipt unchanged.
      if (!rows[1].request.task) rows[1].request = args.p_request as Record<string, unknown>;
      return { data: structuredClone(rows[1]), error: null };
    },
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const within: Record<string, unknown[]> = {};
      let changes: Record<string, unknown> | undefined;
      const chain = {
        select: () => chain,
        eq: (key: string, value: unknown) => {
          filters[key] = value;
          return chain;
        },
        in: (key: string, values: unknown[]) => {
          within[key] = values;
          return chain;
        },
        order: () => chain,
        limit: async () => ({
          data: rows.filter((row) =>
            Object.entries(filters).every(([key, value]) => row[key as keyof ExternalOperation] === value) &&
            Object.entries(within).every(([key, values]) => values.includes(row[key as keyof ExternalOperation]))
          ).map((row) => structuredClone(row)),
          error: null,
        }),
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
test("provider capacity rejection yields without an external run and resumes the same receipt", async (t) => {
  const { rows, context } = fixture("reserved");
  rows[0].status = "idle"; rows[0].provider_refs.workspace_id = remoteSession;
  let dispatched = 0;
  t.mock.method(browserUseAgents, "upload", async () => []);
  t.mock.method(browserUseAgents, "createRun", async () => {
    dispatched++;
    if (dispatched === 1) throw new BrowserUseHttpError(429, "POST", "/runs", "60");
    return { id: remoteRun, sessionId: remoteSession, status: "running" };
  });
  t.mock.method(browserUseAgents, "status", async () => ({ status: "running" }));
  const input = { action: "run", session_id: sessionId, task: "Prepare this application" };
  const first = await executeUseBrowser(input, { ...context, deadlineAt: Date.now() });
  assert.equal(first.operation?.status, "capacity_wait");
  assert.deepEqual(first.careerContinuation, { kind: "external_capacity", id: executionId });
  await executeUseBrowser(input, { ...context, deadlineAt: Date.now() });
  assert.equal(dispatched, 1);
  rows[1].provider_refs.retry_after = "2020-01-01T00:00:00Z";
  const resumed = await executeUseBrowser(input, { ...context, deadlineAt: Date.now() });
  assert.equal(resumed.operation?.id, executionId);
  assert.equal(resumed.operation?.status, "running");
  assert.equal(dispatched, 2);
});
for (const replaceAttachments of [false, true]) {
  test(`resuming a browser for preparation ${replaceAttachments ? "clears attachments for an explicit empty selection" : "also clears the files an earlier run left, so preparation never holds files"}`, async (t) => {
    const { rows, messages, context } = fixture("reserved");
    rows[0].status = "idle";
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
      options: { keepAlive?: number; serviceTier?: string },
    ) => {
      dispatched = true;
      assert.equal(workspaceId, rows[0].provider_refs.workspace_id);
      assert.equal(sessionId, remoteSession);
      assert.equal(options.keepAlive, 1800);
      assert.equal(options.serviceTier, "default");
      // Stop at dispatch to test an unknown provider outcome.
      throw new Error("Provider response unavailable in this attachment test");
    });
    t.mock.method(console, "error", () => {});
    const result = await executeUseBrowser({
      action: "run",
      session_id: sessionId,
      task: "Continue the existing application",
      ...(replaceAttachments ? { documents: [] } : {}),
    }, { ...context, replyId: "invocation:browser-owner", browserServiceTier: "default" });
    assert.equal(dispatched, true);
    assert.equal(clearCount, 1);
    assert.equal(result.operation?.status, "uncertain");
    assert.equal(result.message?.messageType, "browser_session");
    assert.equal(messages[0].payload.session_id, sessionId);
    assert.equal(result.message?.artifactReplyId, "invocation:browser-owner");
    const repeated = await executeUseBrowser({
      action: "run", session_id: sessionId, task: "Continue the existing application",
      ...(replaceAttachments ? { documents: [] } : {}),
    }, context);
    assert.equal(messages.length, 1);
    assert.equal(repeated.message?.id, result.message?.id);
  });
}
test("a sign-in for an existing account goes through a sign-in method, not an account finder or a sign-up entry", async (t) => {
  const { rows, context } = fixture("reserved");
  rows[0].status = "idle";
  rows[0].provider_refs.workspace_id = remoteSession;
  let sent = "";
  t.mock.method(console, "error", () => {});
  t.mock.method(browserUseAgents, "upload", async () => []);
  t.mock.method(browserUseAgents, "createRun", async (task: string) => {
    sent = task;
    // Only the instructions matter here: stop at dispatch.
    throw new Error("Provider response unavailable in this instruction test");
  });
  await executeUseBrowser({ action: "run", session_id: sessionId,
    task: "Candidate has an existing account on the job site. Open its application." }, context).catch(() => undefined);
  // 11/27: told "existing account", the browser took a site's "Find existing account" entry (a phone-number account
  // finder) instead of a sign-in method, and handed that screen to the person, whose sign-in then found no account.
  assert.match(sent, /An existing account signs in through the sign-in method the task names, else the site's own email or ID sign-in, else hand over at the method choice/);
  assert.match(sent, /entries that find or recover an account \(find account or ID, reset password\), sign up or are for business accounts are not its sign-in entry/);
});

test("run delivers the browser card before waiting and returns the observation to the same tool call", async (t) => {
  const { rows, context } = fixture("reserved");
  rows[0].status = "idle";
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
  rows[0].status = "idle";
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
test("closing a browser handed to the person after its run finished stops it without cancelling the finished run", async (t) => {
  const { rows, context } = fixture("completed");
  rows[0].status = "human";
  let stopped = 0;
  t.mock.method(browserUseAgents, "cancelRun", async () => assert.fail("A finished run has nothing to cancel"));
  t.mock.method(browserUseAgents, "stop", async (state: Parameters<typeof browserUseAgents.stop>[0]) => {
    stopped++;
    assert.equal(state.sessionId, remoteSession);
  });
  await executeUseBrowser({ action: "close", session_id: sessionId }, context);
  assert.equal(stopped, 1);
  assert.equal(rows[1].status, "completed");
  assert.equal(rows[0].status, "closed");
});
/** A finished execute run whose receipt reports `submitted`, with the picture of its last page held until `finish`. */
function finishedSubmission(t: { mock: typeof mock }, submitted: string) {
  const fixed = fixture("running");
  fixed.rows[1].request = { mode: "execute" };
  const events: string[] = [];
  let finish!: () => void;
  t.mock.method(browserUseAgents, "captureSessionPage", () => new Promise<SessionPageCapture>((resolve) => {
    finish = () => { events.push("picture"); resolve({ status: "unavailable", reason: "no_cdp_url" }); };
  }));
  t.mock.method(browserUseAgents, "status", async () => ({ status: "completed" }));
  t.mock.method(browserUseAgents, "result", async () => ({ status: "completed", output: JSON.stringify({
    summary: "Company A's form was sent.", evidence: [], needsUser: false, url: "https://company-a.example/done", submitted }) }));
  t.mock.method(browserUseAgents, "stop", async () => { events.push("stop"); });
  return { ...fixed, events, finish: () => finish() };
}
const settle = async (done: () => boolean) => {
  for (let tick = 0; tick < 200 && !done(); tick++) await new Promise((resolve) => setImmediate(resolve));
};
test("a browser whose submission the site confirmed is released once the picture of its last page is kept", async (t) => {
  const { rows, context, events, finish } = finishedSubmission(t, "yes");
  const latest = await refreshBrowserExecution(context, structuredClone(rows[1]));
  assert.equal(latest.status, "completed");
  await settle(() => false);
  assert.deepEqual(events, [], "the browser stays open while its last page is pictured");
  finish();
  await settle(() => rows[0].result.browser_availability === "stopped");
  assert.deepEqual(events, ["picture", "stop"]);
  assert.equal(rows[0].status, "idle");
  assert.equal(rows[0].result.last_execution_id, executionId);
  assert.equal(rows[0].provider_refs.session_id, undefined);
  assert.deepEqual(rows[1].provider_refs.receipt_screenshot, { status: "unavailable", reason: "no_cdp_url" });
});
test("a confirmed submission keeps its browser open while another application it served is not submitted", async (t) => {
  // Review 11/27: Harper carried a signed-in browser over to Company B's posting; releasing it after Company A's
  // submission would have closed B's login too.
  const { rows, context, events, finish } = finishedSubmission(t, "yes");
  rows[1].request = { mode: "execute", role_refs: ["role-a"] };
  rows.push({ ...structuredClone(rows[1]), id: "00000000-0000-4000-8000-000000000007", idempotency_key: "prepare-b",
    status: "completed", request: { mode: "prepare", role_refs: ["role-b"] }, result: { submitted: "no" } });
  await refreshBrowserExecution(context, structuredClone(rows[1]));
  finish();
  await settle(() => false);
  assert.deepEqual(events, ["picture"], "the browser is not stopped");
  assert.equal(rows[0].status, "idle");
  assert.equal(rows[0].result.browser_availability, undefined);
  // Once Company B's application on it is submitted as well, the same rule releases it.
  rows[2].result = { submitted: "yes" };
  const { releaseAfterConfirmedSubmission } = await import("./tool");
  releaseAfterConfirmedSubmission(context, structuredClone(rows[1]), () => {});
  await settle(() => rows[0].result.browser_availability === "stopped");
  assert.deepEqual(events, ["picture", "stop"]);
});
/** A finished run on the live browser, started at minute (before the submission at 00:00) on url when given. */
const earlierRun = (rows: ExternalOperation[], id: string, minute: number, request: Record<string, unknown>, submitted = "no") =>
  rows.push({ ...structuredClone(rows[1]), id, idempotency_key: `run-${id}`, status: "completed", request,
    result: { submitted }, created_at: new Date(Date.parse("2026-10-29T00:00:00Z") + minute * 60_000).toISOString() });
test("an application on the live browser without role references keeps it open; runs of an earlier browser on that record do not", async (t) => {
  // Review 11/27: the check knew an application only by its role references, and it also counted runs of browsers
  // released long before, since a released browser keeps its session record.
  const { rows, context, events, finish } = finishedSubmission(t, "yes");
  rows[1].request = { mode: "execute", role_refs: ["role-a"] };
  // An earlier browser on this record prepared Company C and was released; that application has no use for this one.
  rows.push({ ...structuredClone(rows[1]), id: "00000000-0000-4000-8000-000000000008", idempotency_key: "prepare-c",
    status: "completed", request: { mode: "prepare", role_refs: ["role-c"] }, result: { submitted: "no" },
    provider_refs: { session_id: "earlier-browser", run_id: "earlier-run" } });
  // On the live browser Harper first opened Company B's posting, which has no role reference; then it carried the
  // browser over to Company A's posting and prepared it, and the submission went on from that page.
  earlierRun(rows, "00000000-0000-4000-8000-000000000009", -20, { mode: "prepare", url: "https://company-b.example/jobs/2" });
  earlierRun(rows, "00000000-0000-4000-8000-000000000010", -10, { mode: "prepare", url: "https://company-a.example/jobs/1", role_refs: ["role-a"] });
  await refreshBrowserExecution(context, structuredClone(rows[1]));
  finish();
  await settle(() => false);
  assert.deepEqual(events, ["picture"], "Company B's application keeps the browser");
  // Once that run reports its own confirmed submission, only the earlier browser's run is left, and it does not count.
  rows[3].result = { submitted: "yes" };
  const { releaseAfterConfirmedSubmission } = await import("./tool");
  releaseAfterConfirmedSubmission(context, structuredClone(rows[1]), () => {});
  await settle(() => rows[0].result.browser_availability === "stopped");
  assert.deepEqual(events, ["picture", "stop"]);
});
// Review 11/27: Harper prepared Company A's form without role references (37% of preparations), the person approved,
// and the submission on the same browser went on from that page; the site confirmed it.
for (const [what, prepared, submitting] of [
  ["without role references", { mode: "prepare", url: "https://company-a.example/jobs/1" }, { mode: "execute", role_refs: ["role-a"] }],
  ["named by role, submitted without one", { mode: "prepare", url: "https://company-a.example/jobs/1", role_refs: ["role-a"] }, { mode: "execute" }],
  ["without a start URL or role references", { mode: "prepare" }, { mode: "execute" }],
] as const) {
  test(`the submitted application's own preparation does not keep its browser: ${what}`, async (t) => {
    const { rows, context, events, finish } = finishedSubmission(t, "yes");
    rows[1].request = { ...submitting };
    earlierRun(rows, "00000000-0000-4000-8000-000000000009", -10, { ...prepared });
    await refreshBrowserExecution(context, structuredClone(rows[1]));
    finish();
    await settle(() => rows[0].result.browser_availability === "stopped");
    assert.deepEqual(events, ["picture", "stop"]);
  });
}
// Company B's preparation on its own page was cut off before Harper went on to Company A's posting; or Harper went on
// from Company A's page to Company B's role and came back to submit A.
for (const [what, minute, status, request] of [
  ["one cut off before its receipt", -30, "failed", { mode: "prepare", url: "https://company-b.example/jobs/2" }],
  ["one whose role the submission does not name", -10, "completed", { mode: "prepare", role_refs: ["role-b"] }],
] as const) {
  test(`another application on the browser keeps it open: ${what}`, async (t) => {
    const { rows, context, events, finish } = finishedSubmission(t, "yes");
    rows[1].request = { mode: "execute", role_refs: ["role-a"] };
    earlierRun(rows, "00000000-0000-4000-8000-000000000009", -20, { mode: "prepare", url: "https://company-a.example/jobs/1", role_refs: ["role-a"] });
    earlierRun(rows, "00000000-0000-4000-8000-000000000010", minute, { ...request });
    rows[3].status = status;
    await refreshBrowserExecution(context, structuredClone(rows[1]));
    finish();
    await settle(() => false);
    assert.deepEqual(events, ["picture"]);
    assert.equal(rows[0].result.browser_availability, undefined);
  });
}
// Review 11/27 (second look): a run without a start URL took the page of whatever ran just before it, even another
// application's, and a submission without role references covered every run on its page. In each order below another
// application on the browser is still not submitted.
const companyA = "https://company-a.example/jobs/1", companyB = "https://company-b.example/jobs/2";
for (const [what, submitting, earlier] of [
  ["B prepared after A, then A submitted without a start URL", { mode: "execute", role_refs: ["role-a"] }, [
    [-20, { mode: "prepare", url: companyA, role_refs: ["role-a"] }, "completed"],
    [-10, { mode: "prepare", url: companyB }, "completed"]]],
  ["A prepared without roles after B, then B submitted without a start URL", { mode: "execute", role_refs: ["role-b"] }, [
    [-20, { mode: "prepare", url: companyB, role_refs: ["role-b"] }, "completed"],
    [-10, { mode: "prepare", url: companyA }, "completed"]]],
  ["B's preparation cut off after A's, then A submitted without a start URL", { mode: "execute", role_refs: ["role-a"] }, [
    [-20, { mode: "prepare", url: companyA, role_refs: ["role-a"] }, "completed"],
    [-10, { mode: "prepare", url: companyB }, "failed"]]],
  ["B's role prepared on A's page, then a submission that names no role", { mode: "execute" }, [
    [-20, { mode: "prepare", url: companyA, role_refs: ["role-a"] }, "completed"],
    [-10, { mode: "prepare", role_refs: ["role-b"] }, "completed"]]],
] as const) {
  test(`another application on the browser keeps it open: ${what}`, async (t) => {
    const { rows, context, events, finish } = finishedSubmission(t, "yes");
    rows[1].request = { ...submitting };
    earlier.forEach(([minute, request, status], index) => {
      earlierRun(rows, `00000000-0000-4000-8000-00000000002${index}`, minute, { ...request });
      rows[rows.length - 1].status = status;
    });
    await refreshBrowserExecution(context, structuredClone(rows[1]));
    finish();
    await settle(() => false);
    assert.deepEqual(events, ["picture"]);
    assert.equal(rows[0].result.browser_availability, undefined);
  });
}
test("an unclear submission keeps its browser open, and closing it waits for the picture of its last page", async (t) => {
  const { rows, context, events, finish } = finishedSubmission(t, "unclear");
  await refreshBrowserExecution(context, structuredClone(rows[1]));
  await settle(() => false);
  assert.equal(rows[0].status, "idle");
  assert.equal(rows[0].result.browser_availability, undefined);
  const closing = executeUseBrowser({ action: "close", session_id: sessionId }, context);
  await settle(() => false);
  assert.deepEqual(events, [], "close waits for the picture");
  finish();
  await closing;
  assert.deepEqual(events, ["picture", "stop"]);
  assert.equal(rows[0].status, "closed");
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

test("confirmed stopped browser retains human ownership until Done and keeps the resumable session and files", async (t) => {
  const { rows, context } = fixture("completed");
  rows[0].status = "human";
  rows[0].provider_refs.workspace_id = "00000000-0000-4000-8000-000000000007";
  rows[1].result = { needsUser: true };
  t.mock.method(browserUseAgents, "inspectSessionBrowser", async () => ({ availability: "stopped", liveUrl: null }));
  t.mock.method(browserUseAgents, "stop", async () => assert.fail("Observation must not close the logical session or remove files"));
  const view = await observeBrowserSession(context, structuredClone(rows[0]));
  assert.equal(view.browserAvailability, "stopped");
  assert.equal(view.liveUrl, null);
  assert.equal(rows[0].status, "human");
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
    assert.equal(view.observationFailed, failed);
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
  const { rows, messages, context } = fixture();
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
  assert.equal(messages.length, 0, "reading browser history must not publish new chat cards");
});

for (const action of ["run", "release"] as const) {
  test(`${action} cannot take control while the user is operating the browser`, async (t) => {
    const { rows, context } = fixture("cancelled");
    rows[0].status = "human";
    t.mock.method(browserUseAgents, "upload", async () => assert.fail("Do not touch files during human control"));
    t.mock.method(browserUseAgents, "createRun", async () => assert.fail("Do not dispatch during human control"));
    t.mock.method(browserUseAgents, "stop", async () => assert.fail("Do not close a human-controlled browser"));
    const result = await executeUseBrowser({ action, session_id: sessionId, task: "Continue" }, context);
    assert.equal("careerContinuation" in result, false, "human input returns an observation, not a suspended model");
    assert.match(result.modelOutput, /Automatic run\/release on this session is paused/);
    assert.match(result.modelOutput, /other tools and sessions remain available/);
    assert.equal(rows[0].status, "human");
  });
}


test("handoff while attachments upload prevents the prepared run from dispatching", async t => {
  const { rows, context } = fixture("reserved");
  rows[0].status = "idle";
  rows[0].provider_refs.workspace_id = remoteSession;
  t.mock.method(browserUseAgents, "upload", async () => {
    await executeUseBrowser({ action: "handoff", session_id: sessionId }, context);
    return [];
  });
  t.mock.method(browserUseAgents, "createRun", async () => assert.fail("Manual control revoked browser dispatch"));
  const result = await executeUseBrowser({ action: "run", session_id: sessionId, task: "Prepare" }, context);
  assert.equal(result.session?.status, "human");
  assert.equal(rows[1].status, "cancelled");
});


test("old waiting-work cleanup cannot release a browser returned to a pending continuation", async t => {
  const { rows, context } = fixture("completed");
  rows[0].status = "idle";
  const invocationId = "00000000-0000-4000-8000-000000000008";
  rows[0].provider_refs.control_return = { invocation_id: invocationId, revision: 3 };
  rows.push({ ...rows[1], id: invocationId, kind: "career_invocation", status: "ready" });
  t.mock.method(browserUseAgents, "stop", async () => assert.fail("Retain the page until its returned-control invocation runs"));
  const result = await executeUseBrowser({ action: "release", session_id: sessionId }, context);
  assert.equal(result.session?.status, "idle");
  assert.match(result.modelOutput, /owning continuation is pending/);
});

test("terminal browser runs become readable while human control remains with the user", async () => {
  const { careerCheckpointIsReady } = await import("../agentContinuation");
  const { rows, context } = fixture("cancelled");
  rows[0].status = "human";
  for (const dependency of [{ kind: "browser_run", id: executionId }, { kind: "browser_control", id: sessionId }]) {
    const checkpoint = { waitFor: [dependency] } as any;
    assert.equal(await careerCheckpointIsReady(context.admin, userId, checkpoint), true);
    rows[0].status = "idle";
    assert.equal(await careerCheckpointIsReady(context.admin, userId, checkpoint), true);
    rows[0].status = "human";
  }
});


test("the public browser tool delivers a login-needed receipt without suspending the model", async t => {
  const { CAREER_GENERAL_TOOLS } = await import("../generalTools");
  const { CareerCapabilityRuntime } = await import("../capabilities/runtime");
  const { rows, context } = fixture("completed");
  rows[1].result = { summary: "The QR sign-in screen is ready for the user.", needsUser: true };
  t.mock.method(browserUseAgents, "inspectSessionBrowser", async () => ({ availability: "running", liveUrl: null }));
  t.mock.method(browserUseAgents, "createRun", async () => assert.fail("No extra browser run"));
  const input = { action: "read", execution_id: executionId };
  const result = await CAREER_GENERAL_TOOLS.use_browser.execute!(input, { ...context, deadlineAt: Date.now() + 1000 } as any) as any;
  assert.equal(result.session.status, "human");
  assert.equal(result.careerContinuation, undefined);
  assert.match(result.modelOutput, /QR sign-in/);
  const runtime = new CareerCapabilityRuntime({ mode: "progressive", eligibleTools: [],
    checkpoint: async () => assert.fail("The model needs the observation now"),
    promptArgs: () => ({ channel: "chat", isOnboardingDone: true, profile: null, structuredProfileText: "", talentContextSection: "" }),
  });
  const step = runtime.resolveStep(false);
  await runtime.recordResult("use_browser", result, step, input, "login-read");
  assert.equal(await runtime.shouldDeferToolCall(), false);
  await runtime.beforeCompletion(step, { transport: "chat", messages: [{ role: "tool", tool_call_id: "login-read", content: result.modelOutput }] });
});

for (const alreadyStopped of [false, true]) {
  test(`release preserves a reserved run and resumes it after resource cleanup (stopped=${alreadyStopped})`, async t => {
    const { rows, context } = fixture("reserved");
    rows[0].status = "idle";
    rows[0].provider_refs.workspace_id = remoteSession;
    if (alreadyStopped) rows[0].result.browser_availability = "stopped";
    let stops = 0, dispatches = 0;
    t.mock.method(browserUseAgents, "stop", async () => {
      stops++;
      assert.equal(rows[0].status, "releasing");
      await assert.rejects(executeUseBrowser({ action: "run", session_id: sessionId, task: "Prepare" }, context), /not ready|changed/);
    });
    t.mock.method(browserUseAgents, "upload", async () => []);
    t.mock.method(browserUseAgents, "createRun", async () => {
      dispatches++; return { id: remoteRun, sessionId: remoteSession, status: "running" };
    });
    await executeUseBrowser({ action: "release", session_id: sessionId }, context);
    await executeUseBrowser({ action: "release", session_id: sessionId }, context);
    assert.equal(stops, alreadyStopped ? 0 : 1);
    assert.equal(rows[1].status, "reserved");
    assert.equal(rows[0].result.browser_availability, "stopped");
    const resumed = await executeUseBrowser({ action: "run", session_id: sessionId, task: "Prepare" }, { ...context, deadlineAt: Date.now() });
    assert.equal(resumed.operation?.id, executionId);
    assert.equal(resumed.operation?.status, "running");
    assert.equal(dispatches, 1);
  });
}
for (const status of ["preparing", "dispatching", "uncertain", "running"]) {
  test(`release retains a ${status} execution without stopping its provider`, async t => {
    const { rows, context } = fixture(status);
    rows[0].status = "idle";
    t.mock.method(browserUseAgents, "stop", async () => assert.fail("Active/unknown dispatch must retain the browser"));
    await executeUseBrowser({ action: "release", session_id: sessionId }, context);
    assert.equal(rows[1].status, status);
  });
}

test("a delayed duplicate release cannot stop the new provider session after resume", async t => {
  const { rows, context } = fixture("reserved");
  rows[0].status = "idle"; rows[0].provider_refs.workspace_id = remoteSession;
  let finishFirst!: () => void, finishSecond!: () => void;
  const firstGate = new Promise<void>(r => { finishFirst = r; });
  const secondGate = new Promise<void>(r => { finishSecond = r; });
  const stopped: string[] = [];
  t.mock.method(browserUseAgents, "stop", async (state: {sessionId: string}) => {
    stopped.push(state.sessionId);
    await (stopped.length === 1 ? firstGate : secondGate);
  });
  const first = executeUseBrowser({action:"release",session_id:sessionId},context);
  while (stopped.length < 1) await new Promise(r => setImmediate(r));
  const second = executeUseBrowser({action:"release",session_id:sessionId},context);
  while (stopped.length < 2) await new Promise(r => setImmediate(r));
  // The later claim owns the current revision and can finish first.
  finishSecond(); await second;
  const newSession = "00000000-0000-4000-8000-000000000009";
  t.mock.method(browserUseAgents,"upload",async()=>[]);
  t.mock.method(browserUseAgents,"createRun",async (_task: string,_schema: unknown,_workspace: string,oldSession: string|undefined)=>{
    assert.equal(oldSession,undefined);
    return {id:remoteRun,sessionId:newSession,status:"running"};
  });
  await executeUseBrowser({action:"run",session_id:sessionId,task:"Prepare"},{...context,deadlineAt:Date.now()});
  finishFirst(); await assert.rejects(first,/changed/);
  assert.deepEqual(stopped,[remoteSession,remoteSession]);
  assert.equal(rows[0].provider_refs.session_id,newSession);
  assert.equal(rows[0].status,"running");
});

async function runWithSavedLogin(t: test.TestContext, savedLoginActive: boolean) {
  const profile = "00000000-0000-4000-8000-000000000007";
  const { rows, context } = fixture("reserved");
  rows[0].status = "idle";
  rows[0].provider_refs = { ...rows[0].provider_refs, workspace_id: remoteSession, profile_id: profile };
  if (savedLoginActive) rows.push({ ...rows[0], id: "00000000-0000-4000-8000-000000000008", kind: "browser_profile",
    idempotency_key: "saved-login", status: "active", provider_refs: { profile_id: profile } });
  const sent: unknown[] = [];
  t.mock.method(browserUseAgents, "upload", async () => []);
  t.mock.method(browserUseAgents, "createRun", async (...args: unknown[]) => {
    sent.push((args[4] as { profileId?: unknown }).profileId);
    return { id: remoteRun, sessionId: remoteSession, status: "running" };
  });
  t.mock.method(browserUseAgents, "status", async () => ({ status: "completed" }));
  t.mock.method(browserUseAgents, "result", async () => ({ id: remoteRun, sessionId: remoteSession, status: "completed",
    output: { summary: "Signed in.", evidence: [], needsUser: false, url: "", submitted: "no" } }));
  await executeUseBrowser({ action: "run", session_id: sessionId, task: "Continue the application" }, context);
  return { sent, profile };
}
test("a browser that started with the saved login keeps it on every run", async (t) => {
  const { sent, profile } = await runWithSavedLogin(t, true);
  assert.deepEqual(sent, [profile]);
});
test("after the user deletes the saved login, a browser that started with it continues in a fresh browser without it", async (t) => {
  const { sent } = await runWithSavedLogin(t, false);
  assert.deepEqual(sent, [null]);
});

test("a run without a URL learns the pages this browser showed, to reopen there if the browser closed", async () => {
  const { earlierPagesOfThisBrowser } = await import("./tool");
  const run = (id: string, request: Record<string, unknown>, result: Record<string, unknown>) => ({
    id, user_id: userId, conversation_id: conversationId, parent_id: sessionId, kind: "browser_run", status: "completed",
    idempotency_key: id, revision: 1, request, result, provider_refs: {}, created_at: "2026-11-23T00:00:00Z", updated_at: "2026-11-23T00:00:00Z",
  });
  const listed = (rows: unknown[]) => {
    const filters: Record<string, unknown> = {};
    const chain: any = {
      select: () => chain, order: () => chain,
      eq: (key: string, value: unknown) => { filters[key] = value; return chain; },
      then: (resolve: (value: unknown) => void) => resolve({
        data: rows.filter((row: any) => Object.entries(filters).every(([key, value]) => row[key] === value)), error: null }),
    };
    return { admin: { from: () => chain } as unknown as TalentAdminClient, userId };
  };
  const current = "00000000-0000-4000-8000-000000000010";
  // Newest first, as listOperations orders them.
  const pages = await earlierPagesOfThisBrowser(listed([
    run(current, {}, {}),
    run("00000000-0000-4000-8000-000000000011", { url: null }, { url: "https://jobs.example.test/apply/verify" }),
    run("00000000-0000-4000-8000-000000000012", { url: "https://jobs.example.test/apply" }, { url: "https://jobs.example.test/apply/step-2" }),
  ]), sessionId, current);
  assert.match(pages, /continue on the page this browser has open/);
  assert.match(pages, /last page it showed was https:\/\/jobs\.example\.test\/apply\/verify/);
  assert.match(pages, /this work started at https:\/\/jobs\.example\.test\/apply\./);
  assert.equal(await earlierPagesOfThisBrowser(listed([run(current, {}, {})]), sessionId, current), "", "a new browser has no earlier page");
  assert.equal(await earlierPagesOfThisBrowser(listed([
    run(current, {}, {}), run("00000000-0000-4000-8000-000000000013", {}, { url: "about:blank" }),
  ]), sessionId, current), "", "a blank page is not a page to reopen");
});
