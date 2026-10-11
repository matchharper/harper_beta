import { documentFingerprint } from "./resumeAttachment";
import test from "node:test";
import assert from "node:assert/strict";
import {
  createSimulationSession,
  endSimulationSession,
  mutateSimulationSession,
  type SimulationSession,
} from "./session";
import { createPreparation } from "./preparation";
import {
  askApplicationInput,
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
test("analysis resume is never implicitly submitted; final selection is owner checked and duplicate starts fail", async () => {
  const f = fixture();
  await assert.rejects(
    () => startApplicationBrowser(f.store, f.record(), { purpose: "Apply" }),
    /final resume/
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
  await assert.rejects(() => startApplicationBrowser(f.store, f.record(), {purpose: "Apply"}), /version-confirmed/);
  s.preparation!.finalDocumentFingerprint = confirmedFingerprint;
  f.set(s);
  const started = await startApplicationBrowser(f.store, f.record(), {
    purpose: "Apply",
  });
  assert.equal(started.state.browser?.documentId, "final-file");
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
        fingerprint: "fp",
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
        batch.id
      );
      assert.equal(
        JSON.parse(String(events[0].output)).approved,
        response.decision === "answer" && "optionId" in response
      );
      assert.equal(saved.state.activity!.batches.at(-1)!.continuation, "done");
      assert.equal(saved.state.browser!.status, "queued");
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
      fingerprint: "fp",
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
      () => resumeApplicationBrowser(f.store, f.record(), batch.id),
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
    type: "function_call", call_id: "call-contact", turn_id: "turn-contact", name: "ask_application_input",
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
  Object.assign(started.state.browser!, { sessionId: "session-test", taskSent: true, status: "running" });
  f.set(started.state);
  const original = globalThis.fetch;
  let streamed = false;
  globalThis.fetch = async (url, init) => {
    assert.notEqual(init?.method, "DELETE", "must not delete a browser awaiting answers");
    assert.notEqual(init?.method, "POST", "must not cancel or replay the application");
    if (String(url).includes("/events?")) {
      streamed = true;
      const progress = 'data: {"type":"agent.session.turn.output_text.done","item_id":"public-update","text":"지원 페이지를 확인했고 필수 답변을 확인하고 있어요."}\n\n';
      return new Response(progress + progress + 'data: {"type":"agent.session.turn.completed","turn":{"id":"turn-question"}}\n\n', {headers: {"Content-Type":"text/event-stream"}});
    }
    if (String(url).includes("/turns?")) return Response.json({ data: [{id:"turn-question",status:"in_progress"}] });
    return Response.json({ required_actions: streamed ? [{
      type: "function_call", call_id: "call-contact", turn_id: "turn-question", name: "ask_application_input",
      arguments: { purpose: "Contact information", items: [{ kind: "question", title: "Which phone number?" }] },
    }] : [] });
  };
  try {
    await runApplicationBrowser(f.store, 10);
    assert.equal(f.record().state.browser!.status, "waiting");
    assert.equal(f.record().state.browser!.result, undefined);
    assert.equal(f.record().state.activity!.batches.length, 1);
    assert.deepEqual(f.record().state.browser!.progress?.map(p => p.text), ["지원 페이지를 확인했고 필수 답변을 확인하고 있어요."]);
  } finally { globalThis.fetch = original; }
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
      type:"function_call",name:"ask_application_input",call_id:corrected ? "fixed" : "bad",turn_id:"turn-question",
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
