import {applicationStagehandRuntime as remote} from "./applicationStagehandRuntime";
import { documentFingerprint } from "./resumeAttachment";
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { ApplicationBrowserRuntime } from "./applicationBrowserRuntime";
import { applicationBrowserRuntime } from "./applicationBrowserRuntime";
import {
  createSimulationSession,
  endSimulationSession,
  mutateSimulationSession,
  type SimulationSession,
} from "./session";
import { createPreparation } from "./preparation";
import {
  askApplicationInput,
  ASK_APPLICATION_INPUT,
  finishApplicationAnswer,
} from "./applicationInput";
import {
  runApplicationBrowser,
  reconcileBrowserEnd,
  startApplicationBrowser,
  resumeApplicationBrowser,
} from "./applicationBrowserServer";
import { expirePreparation } from "./preparationStore";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";

function fixture() {
  let state = createSimulationSession({
    roleRef: "job:public-engineer",
    roleName: "Public Engineer",
    documentId: "analysis-file",
    documentName: "Original",
  });
  state.analysisStatus = "completed";
  state.preparation = createPreparation();
  state.preparation.finalDocumentFingerprint = documentFingerprint({content_sha256: "hash-1", storage_path: "owner/resume.pdf"});
  state.activity = { version: 1, offerId: 1, outputs: {}, batches: [] };
  state.applicationUrl = "https://example.org/jobs/engineer";
  let documentHash = "hash-1";
  const admin = {
    rpc: async (_: string, args: Record<string, unknown>) => {
      if (
        args.p_user_id !== "owner" ||
        args.p_conversation_id !== "conversation"
      )
        return { data: null, error: { message: "Owner mismatch" } };
      if (args.p_operation !== "read") {
        if (args.p_revision !== state.revision)
          return { data: null, error: { message: "Revision conflict" } };
        state = {
          ...(args.p_payload as SimulationSession),
          revision: state.revision + 1,
        };
      }
      return {
        data: {
          id: state.sessionId,
          message_id: 10,
          payload: structuredClone(state),
          created_at: state.startedAt,
        },
        error: null,
      };
    },
    from: () => {
      const filters: Record<string, unknown> = {};
      const query = {
        select: () => query,
        eq: (k: string, v: unknown) => {
          filters[k] = v;
          return query;
        },
        maybeSingle: async () => ({
          data:
            filters.talent_id === "owner" && filters.id === "final-file"
              ? {
                  id: "final-file",
                  kind: "resume",
                  storage_path: "owner/resume.pdf",
                  file_name: "Resume.pdf",
                  content_sha256: documentHash,
                }
              : null,
          error: null,
        }),
      };
      return query;
    },
  } as unknown as TalentAdminClient;
  return {
    store: { admin, userId: "owner", conversationId: "conversation" },
    record: () => ({ messageId: 10, state: structuredClone(state) }),
    set: (s: SimulationSession) => {
      state = s;
    },
    changeFile: () => {
      documentHash = "hash-2";
    },
  };
}
function heldSubmission(s: SimulationSession, summary: string) {
  s.browser!.driver = {name:"fixture-browser",expiresAt:new Date(Date.now()+60000).toISOString()};
  s.browser!.pendingRequest = {id:"held-request",url:"https://example.org/submit",method:"POST",bodyHash:"body-hash",formHash:"form-hash",pageUrl:"https://example.org/jobs/engineer",fields:[{label:"Name",value:"Fixture Person"}]};
  return createHash("sha256").update(JSON.stringify({summary,documentHash:s.browser!.documentHash,documentId:s.browser!.documentId,files:s.browser!.files?.map(f=>({documentId:f.documentId,contentHash:f.contentHash})),request:s.browser!.pendingRequest})).digest("hex");
}
const fixtureRuntime: ApplicationBrowserRuntime = {
  create:async()=>{throw new Error("Unexpected browser creation");},
  execute:async()=>{throw new Error("Unexpected browser action");},
  resolve:async(_ref,_request,approved)=>({executed:approved}),
  upload:async()=>{throw new Error("Unexpected upload");},
  stop:async()=>{},
};
test("pending and unsupported inspections block assisted application before browser creation", async () => {
  const f = fixture();
  const record = f.record();
  record.state.applicationInspection = { status: "running", runId: "test" };
  await assert.rejects(startApplicationBrowser(f.store, record, { purpose: "Apply" }), /still being checked/);
  record.state.applicationInspection.status = "completed";
  for (const status of ["unsupported", "unknown"] as const) {
    record.state.applicationForm = { status: "unavailable", url: "https://example.test/apply", checkedAt: new Date().toISOString(), fields: [], limitations: [], submission: { status, reason: "Observed access limit" } };
    await assert.rejects(startApplicationBrowser(f.store, record, { purpose: "Apply" }), /unavailable for this form/);
    assert.equal(record.state.browser, undefined);
  }
});
test("analysis resume is never implicitly submitted; final selection is owner checked and duplicate starts fail", async () => {
  const f = fixture();
  await assert.rejects(
    () => startApplicationBrowser(f.store, f.record(), { purpose: "Apply" }),
    /ready_for_role/
  );
  let s = f.record().state;
  s.preparation!.finalDocumentId = "someone-elses-file";
  f.set(s);
  await assert.rejects(
    () => startApplicationBrowser(f.store, f.record(), { purpose: "Apply" }),
    /unavailable/
  );
  s.preparation!.finalDocumentId = "final-file";
  const confirmedFingerprint = s.preparation!.finalDocumentFingerprint;
  s.preparation!.finalDocumentFingerprint = null;
  f.set(s);
  await assert.rejects(() => startApplicationBrowser(f.store, f.record(), {purpose: "Apply"}), /read its current revision and call ready_for_role/);
  s.preparation!.finalDocumentFingerprint = confirmedFingerprint;
  f.set(s);
  const started = await startApplicationBrowser(f.store, f.record(), {
    purpose: "Apply",
  }, 123);
  assert.equal(started.state.browser?.documentId, "final-file");
  assert.equal(started.state.browser?.sourceMessageId, 123);
  assert.equal(started.state.browser?.status, "queued");
  await assert.rejects(
    () =>
      startApplicationBrowser(f.store, f.record(), { purpose: "Apply again" }),
    /already exists/
  );
  const competing = fixture();
  const initial = competing.record();
  initial.state.preparation!.finalDocumentId = "final-file";
  competing.set(initial.state);
  const results = await Promise.allSettled([
    startApplicationBrowser(competing.store, competing.record(), {
      purpose: "Apply",
    }),
    startApplicationBrowser(competing.store, competing.record(), {
      purpose: "Apply",
    }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
});
test("browser submission confirmation needs an explicit option; free text and skip do not authorize", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const response of [
      { decision: "skip" as const },
      { decision: "answer" as const, text: "I have a question" },
      { decision: "answer" as const, optionId: "cancel" },
      { decision: "answer" as const, optionId: "submit" },
    ]) {
      const f = fixture();
      let s = f.record().state;
      s.preparation!.finalDocumentId = "final-file";
      f.set(s);
      s = (
        await startApplicationBrowser(f.store, f.record(), { purpose: "Apply" })
      ).state;
      s.browser!.sessionId = "sess_test";
      s = askApplicationInput(
        s,
        {
          purpose: "Confirm submission",
          items: [
            {
              kind: "choice",
              title: "Submit these files and answers?",
              options: [
                { id: "submit", label: "Submit" },
                { id: "cancel", label: "Cancel" },
              ],
            },
          ],
        },
        "confirm"
      );
      const batch = s.activity!.batches.at(-1)!;
      batch.browser = {
        runId: s.browser!.id,
        sessionId: "sess_test",
        turnId: "turn_test",
        callId: "call_test",
        kind: "submission",
        fingerprint: heldSubmission(s, "Role, resume and all answers"),
        summary: "Role, resume and all answers",
      };
      s.browser!.status = "waiting";
      s = finishApplicationAnswer(
        mutateSimulationSession(
          s,
          { action: "respond", actionId: batch.itemIds[0], response },
          1
        )
      );
      f.set(s);
      const events: Record<string, unknown>[] = [];
      globalThis.fetch = async (_url, init) => {
        if (init?.method === "POST") {
          events.push(...JSON.parse(String(init.body)).events);
          return Response.json({});
        }
        return Response.json({
          required_actions: [
            {
              type: "function_call",
              call_id: "call_test",
              turn_id: "turn_test",
            },
          ],
        });
      };
      const saved = await resumeApplicationBrowser(
        f.store,
        f.record(),
        batch.id,
        fixtureRuntime
      );
      assert.equal(
        JSON.parse(String(events[0].output)).approved,
        response.decision === "answer" && "optionId" in response && response.optionId === "submit"
      );
      assert.equal(saved.state.activity!.batches.at(-1)!.continuation, "done");
      assert.equal(saved.state.browser!.status, "queued");
      assert.equal(saved.state.browser!.approval!.executed, response.decision === "answer" && "optionId" in response && response.optionId === "submit");
      await resumeApplicationBrowser(f.store, saved, batch.id);
      assert.equal(events.length, 1);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
test("browser questions share the composer, final file differs from analysis source, and end preserves answers", () => {
  const f = fixture();
  let s = askApplicationInput(
    f.record().state,
    {
      purpose: "Final resume",
      items: [
        {
          kind: "material",
          documentPurpose: "final_resume",
          title: "Select the file to submit",
        },
      ],
    },
    "file"
  );
  const id = s.activity!.batches[0].itemIds[0];
  s = finishApplicationAnswer(
    mutateSimulationSession(
      s,
      {
        action: "respond",
        actionId: id,
        response: { decision: "document", documentId: "final-file" },
      },
      1
    )
  );
  assert.equal(s.preparation!.finalDocumentId, "final-file");
  assert.equal(s.documentId, "analysis-file");
  assert.equal(s.preparation!.generation.status, "idle");
  assert.equal(s.activity!.batches[0].introduction, undefined);
  s.browser = {
    id: "run",
    status: "running",
    documentId: "final-file",
    documentHash: "hash",
    purpose: "Apply",
    url: "https://example.org",
    startedAt: s.startedAt,
    updatedAt: s.startedAt,
  };
  assert.equal(expirePreparation(s, Date.now() + 61 * 60_000).status, "active");
  const ended = endSimulationSession(s, "user");
  assert.equal(ended.browser!.status, "cancelled");
  assert.equal(ended.preparation!.responses[id].documentId, "final-file");
});

test("changed final files cannot use an earlier submission confirmation", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const f = fixture();
    let s = f.record().state;
    s.preparation!.finalDocumentId = "final-file";
    f.set(s);
    s = (
      await startApplicationBrowser(f.store, f.record(), { purpose: "Apply" })
    ).state;
    s.browser!.sessionId = "sess_test";
    s = askApplicationInput(
      s,
      {
        purpose: "Submit",
        items: [
          {
            kind: "choice",
            title: "Submit?",
            options: [
              { id: "submit", label: "Submit" },
              { id: "cancel", label: "Cancel" },
            ],
          },
        ],
      },
      "confirm"
    );
    const batch = s.activity!.batches[0];
    batch.browser = {
      runId: s.browser!.id,
      sessionId: "sess_test",
      turnId: "turn",
      callId: "call",
      kind: "submission",
      fingerprint: heldSubmission(s, "Checked form"),
      summary: "Checked form",
    };
    s = finishApplicationAnswer(
      mutateSimulationSession(
        s,
        {
          action: "respond",
          actionId: batch.itemIds[0],
          response: { decision: "answer", optionId: "submit" },
        },
        1
      )
    );
    f.set(s);
    f.changeFile();
    let posted = false;
    globalThis.fetch = async (_url, init) => {
      if (init?.method === "POST") posted = true;
      return Response.json({
        required_actions: [{ type: "function_call", call_id: "call" }],
      });
    };
    await assert.rejects(
      () => resumeApplicationBrowser(f.store, f.record(), batch.id, fixtureRuntime),
      /file changed/i
    );
    assert.equal(posted, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a worker losing the execution lease CAS exits without provider actions", async () => {
  const f = fixture();
  const s = f.record().state;
  s.preparation!.finalDocumentId = "final-file";
  f.set(s);
  await startApplicationBrowser(f.store, f.record(), { purpose: "Apply" });
  const rpc = f.store.admin.rpc.bind(f.store.admin);
  f.store.admin.rpc = (async (name: string, args: Record<string, unknown>) => {
    if (args.p_operation === "save")
      return {
        data: null,
        error: { code: "P0001", message: "Session revision conflict" },
      };
    return rpc(name as never, args as never);
  }) as unknown as typeof f.store.admin.rpc;
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error("Unexpected provider request");
  };
  try {
    await assert.doesNotReject(() => runApplicationBrowser(f.store, 10));
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = original;
  }
});


test("terminal notification reconciles pending questions instead of aborting the browser", async () => {
  const f = fixture();
  const s = f.record().state;
  s.preparation!.finalDocumentId = "final-file";
  f.set(s);
  const started = await startApplicationBrowser(f.store, f.record(), { purpose: "Apply" });
  started.state.browser!.sessionId = "session-test";
  f.set(started.state);
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ required_actions: [{
    type: "function_call", call_id: "call-contact", turn_id: "turn-contact", name: ASK_APPLICATION_INPUT,
    arguments: { purpose: "Contact information", items: [{ kind: "question", title: "Which phone number?" }] },
  }] });
  try {
    assert.equal(await reconcileBrowserEnd(f.store, 10), true);
    assert.equal(f.record().state.browser!.status, "waiting");
    assert.equal(f.record().state.activity!.batches.at(-1)!.browser!.callId, "call-contact");
    assert.equal(f.record().state.browser!.result, undefined);
  } finally { globalThis.fetch = original; }
});

test("a prose-only completion continues the same session once; replay does not duplicate work", async () => {
  const f = fixture();
  const s = f.record().state;
  s.preparation!.finalDocumentId = "final-file";
  f.set(s);
  const started = await startApplicationBrowser(f.store, f.record(), { purpose: "Apply" });
  started.state.browser!.sessionId = "session-test";
  f.set(started.state);
  const original = globalThis.fetch;
  const posted: unknown[] = [];
  globalThis.fetch = async (url, init) => {
    if (init?.method === "POST") { posted.push(JSON.parse(String(init.body))); return Response.json({}); }
    if (String(url).includes("/turns?")) return Response.json({ data: [
      { id: "child", status: "completed", subagent_id: "child-agent" },
      { id: "turn-contact", status: "completed" },
    ] });
    if (String(url).includes("/items?")) return Response.json({ data: [{ type: "message", content: "Will continue" }] });
    return Response.json({ required_actions: [] });
  };
  try {
    assert.equal(await reconcileBrowserEnd(f.store, 10), false);
    assert.equal(await reconcileBrowserEnd(f.store, 10), false);
    assert.equal(posted.length, 1);
    assert.equal(f.record().state.browser!.recoveryTurnId, "turn-contact");
    assert.equal(f.record().state.browser!.diagnostic!.turnId, "turn-contact");
    assert.equal(f.record().state.browser!.result, undefined);
    assert.match(JSON.stringify(posted), /never submit again/);
  } finally { globalThis.fetch = original; }
});

test("worker receives a terminal stream event but preserves a newly pending browser question", async () => {
  const f = fixture();
  const s = f.record().state;
  s.preparation!.finalDocumentId = "final-file";
  f.set(s);
  const started = await startApplicationBrowser(f.store, f.record(), { purpose: "Apply" });
  Object.assign(started.state.browser!, { sessionId: "session-test", model:"gpt-6-astra", taskSent: true, status: "running", driver:{name:"550e8400-e29b-41d4-a716-446655440000",expiresAt:new Date(Date.now()+60000).toISOString(),provider:"openai",sessionId:"executor-session",environmentId:"executor-env"} });
  f.set(started.state);
  const original = globalThis.fetch;
  const originalLog = console.log;
  const logs: any[][] = [];
  console.log = (...args) => logs.push(args[0] === "[llm-usage]" ? [args[0], JSON.parse(args[1])] : args);
  let streamed = false;
  globalThis.fetch = async (url, init) => {
    assert.notEqual(init?.method, "DELETE", "must not delete a browser awaiting answers");
    assert.notEqual(init?.method, "POST", "must not cancel or replay the application");
    if (String(url).includes("/events?")) {
      streamed = true;
      const progress = 'data: {"type":"agent.session.turn.output_text.done","item_id":"public-update","text":"지원 페이지를 확인했고 필수 답변을 확인하고 있어요."}\n\n';
      return new Response(progress + progress + 'data: {"type":"agent.session.turn.completed","turn":{"id":"turn-question","usage":{"input_tokens":1000,"output_tokens":100}}}\n\n', {headers: {"Content-Type":"text/event-stream"}});
    }
    if (String(url).includes("/turns?")) return Response.json({ data: [{id:"turn-question",status:"in_progress"}] });
    return Response.json({usage:streamed?{input_tokens:1000,output_tokens:100}:null, required_actions: streamed ? [{
      type: "function_call", call_id: "call-contact", turn_id: "turn-question", name: ASK_APPLICATION_INPUT,
      arguments: { purpose: "Contact information", items: [{ kind: "question", title: "Which phone number?" }] },
    }] : [] });
  };
  try {
    await runApplicationBrowser(f.store, 10);
    assert.equal(f.record().state.browser!.status, "waiting");
    assert.equal(f.record().state.browser!.result, undefined);
    assert.equal(f.record().state.activity!.batches.length, 1);
    assert.deepEqual(f.record().state.browser!.progress?.map(p => p.text), ["지원 페이지를 확인했고 필수 답변을 확인하고 있어요."]);
    assert.deepEqual(logs.map(([,receipt])=>receipt.usageScope),["agent_turn","agent_session"]);
    assert.ok(logs.every(([,receipt])=>receipt.model==="gpt-6-astra" && receipt.estimatedCostUsd===0.015));
  } finally { globalThis.fetch = original; console.log=originalLog; }
});

test("new conversation-only application planner starts with its task and never dispatches it twice", async () => {
  const f = fixture();
  const state = f.record().state;
  state.preparation!.finalDocumentId = "final-file";
  f.set(state);
  const started = await startApplicationBrowser(f.store, f.record(), { purpose: "Apply" });
  Object.assign(started.state.browser!, {
    driver: { name: "550e8400-e29b-41d4-a716-446655440000", expiresAt: new Date(Date.now() + 60000).toISOString(), provider: "openai", sessionId: "executor", environmentId: "env" },
    files: [{ documentId: "final-file", name: "Resume.pdf", path: "/workspace/attachments/synthetic.pdf", hash: started.state.browser!.documentHash, contentHash: createHash("sha256").update("SYNTHETIC RESUME").digest("hex") }],
  });
  f.set(started.state);
  (f.store.admin as any).storage = { from: () => ({ download: async () => ({ data: new Blob(["SYNTHETIC RESUME"]), error: null }) }) };
  const original = globalThis.fetch;
  const originalExecute = applicationBrowserRuntime.execute;
  const snapshot = { url: started.state.browser!.url, title: "Application", text: "Name", elements: [] };
  applicationBrowserRuntime.execute = async (_ref, action, _files, commandId) => {
    assert.deepEqual(action, { action: "navigate", url: snapshot.url });
    assert.equal(commandId, `initial:${started.state.browser!.id}`);
    return { snapshot };
  };
  const originalLog = console.log;
  console.log = () => {};
  const posted: any[] = [];
  globalThis.fetch = async (url, init) => {
    if (init?.method === "POST") {
      assert.ok(String(url).endsWith("/agents/sessions"), "No duplicate task message or cancellation");
      const body = JSON.parse(String(init.body));
      posted.push(body);
      assert.equal(body.environment.type, "none");
      assert.equal(body.agent.model, "gpt-6.1-sol");
      assert.deepEqual(body.agent.reasoning, { effort: "low" });
      assert.equal(body.input[0].role, "user");
      const input = JSON.parse(body.input[0].content[0].text);
      assert.equal(input.url, "https://example.org/jobs/engineer");
      assert.equal(input.finalResumeDocumentId, "final-file");
      assert.deepEqual(input.attachments, [{ documentId: "final-file", name: "Resume.pdf" }]);
      assert.deepEqual(input.snapshot, snapshot);
      return Response.json({ id: "new-planner", agent: { model: "gpt-6.1-sol" } });
    }
    assert.notEqual(init?.method, "DELETE", "An application awaiting input remains active");
    return Response.json({ required_actions: [{ type: "function_call", call_id: "contact", turn_id: "turn-contact", name: ASK_APPLICATION_INPUT, arguments: { purpose: "Contact", items: [{ kind: "question", title: "Phone number?" }] } }] });
  };
  try {
    await runApplicationBrowser(f.store, 10);
    assert.equal(posted.length, 1);
    assert.equal(f.record().state.browser!.taskSent, true);
    assert.equal(f.record().state.browser!.sessionId, "new-planner");
    assert.equal(f.record().state.browser!.status, "waiting");
  } finally { globalThis.fetch = original; console.log = originalLog; applicationBrowserRuntime.execute = originalExecute; }
});

test("invalid browser question is returned for correction without ending the session; corrected question waits in the same run", async () => {
  const f = fixture();
  const s = f.record().state;
  s.preparation!.finalDocumentId = "final-file";
  f.set(s);
  const started = await startApplicationBrowser(f.store, f.record(), { purpose: "Apply" });
  Object.assign(started.state.browser!, { sessionId: "session-test", status: "running", taskSent: true });
  f.set(started.state);
  const original = globalThis.fetch;
  let corrected = false;
  const results: any[] = [];
  globalThis.fetch = async (url, init) => {
    assert.notEqual(init?.method, "DELETE");
    if (init?.method === "POST") {
      const event = JSON.parse(String(init.body)).events[0];
      assert.equal(event.type, "agent.session.input.tool_result");
      assert.equal(event.success, false);
      results.push(event);
      corrected = true;
      return Response.json({});
    }
    if (String(url).includes("/turns?")) return Response.json({ data: [{id:"turn-question",status:"in_progress"}] });
    return Response.json({ required_actions: [{
      type:"function_call",name:ASK_APPLICATION_INPUT,call_id:corrected ? "fixed" : "bad",turn_id:"turn-question",
      arguments: { purpose:"Contact",items:[corrected
        ? {kind:"question",title:"Which phone number?"}
        : {actionId:"phone-number",kind:"question",title:"Which phone number?"}] },
    }] });
  };
  try {
    assert.equal(await reconcileBrowserEnd(f.store, 10), false);
    assert.equal(f.record().state.browser!.status, "running");
    assert.equal(f.record().state.browser!.result, undefined);
    assert.equal(f.record().state.activity!.batches.length, 0);
    assert.match(results[0].output, /without actionId/);
    assert.equal(await reconcileBrowserEnd(f.store, 10), true);
    assert.equal(f.record().state.browser!.status, "waiting");
    assert.equal(f.record().state.browser!.sessionId, "session-test");
    assert.equal(f.record().state.activity!.batches.at(-1)!.browser!.callId, "fixed");
  } finally { globalThis.fetch = original; }
});

test("manual application choice blocks browser launch even with a confirmed file", async () => {
  const f=fixture();
  const s=f.record().state;
  s.preparation!.finalDocumentId="final-file";
  s.preparation!.applicationMethod="manual";
  f.set(s);
  await assert.rejects(()=>startApplicationBrowser(f.store,f.record(),{purpose:"Apply"}),/chose to apply themselves/);
  assert.equal(f.record().state.browser,undefined);
});

for (const provider of ["browserbase", "browser-use"] as const)
test(`${provider} run uses the existing question UI and resumes an exact approved request only once`, async () => {
  const originals={...remote}, originalFetch=globalThis.fetch;
  const f=fixture();let s=f.record().state;s.preparation!.finalDocumentId="final-file";f.set(s);
  s=(await startApplicationBrowser(f.store,f.record(),{purpose:"Apply"})).state;
  heldSubmission(s,"unused");
  s.browser!.driver={...s.browser!.driver!,provider,sessionId:"compute",environmentId:"environment",browserSessionId:"browserbase-session"};
  s.browser!.sessionId="compute";s.browser!.model="gpt-6-luna";s.browser!.taskSent=true;f.set(s);
  let sends=0,answers=0;
  const held=s.browser!.pendingRequest!;
  remote.status=async()=>({status:"waiting",sessionId:"browserbase-session",steps:4,maxSteps:100,pendingRequest:held,required_actions:[{type:"function_call",name:"confirm_application_submission",call_id:held.id,turn_id:"stagehand"}]});
  remote.resolve=async(_ref,request,approved)=>{assert.deepEqual(request,held);assert(approved);sends++;return {executed:true};};
  remote.respond=async(_ref,id,output)=>{assert.equal(id,held.id);assert.equal((output as any).approved,true);answers++;};
  globalThis.fetch=async()=>{throw Error("Browserbase activity must not call the legacy planner");};
  try {
    await runApplicationBrowser(f.store,10);
    assert.equal(f.record().state.browser!.status,"waiting");assert.equal(sends,0);
    s=f.record().state;const batch=s.activity!.batches.at(-1)!;
    assert.equal(batch.purpose,"final_submission");assert.equal(batch.browser!.kind,"submission");
    assert.match(batch.browser!.summary!,/Fixture Person/);
    s=finishApplicationAnswer(mutateSimulationSession(s,{action:"respond",actionId:batch.itemIds[0],response:{decision:"answer",optionId:"submit"}},1));f.set(s);
    const saved=await resumeApplicationBrowser(f.store,f.record(),batch.id);
    assert.equal(saved.state.browser!.approval!.executed,true);assert.equal(saved.state.browser!.pendingRequest,undefined);
    await resumeApplicationBrowser(f.store,saved,batch.id);assert.equal(sends,1);assert.equal(answers,1);
  } finally {Object.assign(remote,originals);globalThis.fetch=originalFetch;}
});

test("new applications start the Luna Browserbase worker with confirmed attachments and preserve missing-information flow", async () => {
  const originals={...remote}, originalFetch=globalThis.fetch;
  const f=fixture();const s=f.record().state;s.preparation!.finalDocumentId="final-file";f.set(s);
  f.set((await startApplicationBrowser(f.store,f.record(),{purpose:"Apply"})).state);
  (f.store.admin as any).storage={from:()=>({download:async()=>({data:new Blob(["SYNTHETIC RESUME"]),error:null})})};
  let starts=0;
  remote.create=async(files,url)=>{assert.equal(files.length,1);assert.equal(files[0].documentId,"final-file");assert.equal(url,s.applicationUrl);return {name:"fixture",provider:"browserbase",sessionId:"compute",environmentId:"environment",browserSessionId:"bb",expiresAt:new Date(Date.now()+60_000).toISOString()};};
  remote.start=async(_ref,instruction)=>{starts++;assert.match(instruction,/100 action steps/);assert.match(instruction,/final-file/);};
  remote.status=async()=>({status:"waiting",sessionId:"bb",steps:1,maxSteps:100,required_actions:[{type:"function_call",call_id:"phone",turn_id:"stagehand",name:"request_application_information",arguments:{purpose:"Contact",items:[{kind:"question",title:"Phone number?"}]}}]});
  globalThis.fetch=async()=>{throw Error("No legacy planner");};
  try {await runApplicationBrowser(f.store,10);const state=f.record().state;assert.equal(starts,1);assert.equal(state.browser!.model,"gpt-6-luna");assert.equal(state.browser!.status,"waiting");assert.equal(state.activity!.batches.at(-1)!.browser!.kind,"information");await runApplicationBrowser(f.store,10);assert.equal(starts,1);}
  finally {Object.assign(remote,originals);globalThis.fetch=originalFetch;}
});
