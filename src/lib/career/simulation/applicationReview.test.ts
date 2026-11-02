import { inspectionMemoryStore } from "./sharedApplicationInspection.testSupport";
import { hydrateApplicationInspections } from "./sharedApplicationInspection";
import test from "node:test";
import assert from "node:assert/strict";
import {
  applicationReviewText,
  editApplicationReview,
  prepareApplicationReview,
} from "./applicationReview";
import { createSimulationSession, parseSimulationSession } from "./session";
import { createPreparation } from "./preparation";
import { applicationReviewView } from "./applicationReviewView";
import { executeApplicationReview } from "./applicationReviewService";
import { documentFingerprint } from "./resumeAttachment";
import { startApplicationBrowser } from "./applicationBrowserServer";
import { runManagedApplication, type ManagedApplicationHooks } from "./applicationManagedBrowser";
import { browserUseAgents } from "./browserUseAgents";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { executeApplicationPreparationTool } from "./toolExecution";
import { MANAGE_APPLICATION_SUGGESTIONS } from "./suggestions";
import { applicationQuestionMessages } from "./questionHistory";

function fixture() {
  let state = createSimulationSession({
    roleRef: "role:fixture",
    roleName: "Fixture Engineer",
    documentId: "resume",
    documentName: "Original.pdf",
  });
  state.activity = { version: 1, outputs: {}, batches: [] };
  state.analysisStatus = "completed";
  state.preparation = createPreparation();
  const document = {
    id: "resume",
    kind: "resume",
    storage_path: "owner/resume.pdf",
    content_sha256: "original",
  };
  state.preparation.finalDocumentId = document.id;
  state.preparation.finalDocumentFingerprint = documentFingerprint(document);
  state.applicationUrl = "https://fixture.example/apply";
  state.applicationForm = {
    status: "read",
    url: state.applicationUrl,
    checkedAt: state.startedAt,
    limitations: [],
    submission: { status: "supported", reason: "Public form" },
    fields: [
      {
        label: "Motivation",
        type: "textarea",
        required: true,
        options: [],
        instructions: "",
        fileTypes: [],
        maxLength: null,
      },
      {
        label: "Resume",
        type: "file",
        required: true,
        options: [],
        instructions: "",
        fileTypes: ["pdf"],
        maxLength: null,
      },
    ],
  };
  state.applicationReview = prepareApplicationReview(state, "resume", [
    { fieldId: "field-1", value: "Approved answer" },
    { fieldId: "field-2", documentId: "resume" },
  ]);
  const inspections = inspectionMemoryStore();
  const admin = {
    rpc: async (_: string, args: any) => {
      const nextPayload = args.p_payload ? await hydrateApplicationInspections(admin, args.p_payload) as typeof state : null;
      assert.equal(args.p_user_id, "owner");
      if (args.p_operation === "save") {
        if (args.p_revision !== state.revision)
          return {
            data: null,
            error: { message: "Session revision conflict" },
          };
        state = {
          ...nextPayload!,
          revision: state.revision + 1,
        };
      }
      return {
        data: {
          message_id: 1,
          created_at: state.startedAt,
          payload: structuredClone(state),
        },
        error: null,
      };
    },
    from: (table: string) => {
      if (table === "role_application_inspections") return inspections.from(table);
      const filters: Record<string, unknown> = {};
      const q = {
        select: () => q,
        eq: (key: string, value: unknown) => {
          filters[key] = value;
          return q;
        },
        maybeSingle: async () => ({
          data:
            filters.talent_id === "owner" && filters.id === "resume"
              ? document
              : null,
          error: null,
        }),
      };
      return q;
    },
  } as unknown as TalentAdminClient;
  return {
    store: { admin, userId: "owner", conversationId: "conversation" },
    record: () => ({ messageId: 1, state: structuredClone(state) }),
    set: (next: typeof state) => {
      state = next;
    },
  };
}

test("a question after saving the application keeps the prepared form attached to its timeline message", async () => {
  const f = fixture();
  const before = f.record();
  const result = await executeApplicationPreparationTool({
    store: f.store,
    record: before,
    name: MANAGE_APPLICATION_SUGGESTIONS,
    messageId: 20,
    input: {
      introduction: "지원서는 작성해뒀어요. 포트폴리오가 있으면 보내주세요.",
      changes: [{ decision: "ask", suggestion: { kind: "question", title: "포트폴리오가 있으면 보내주시겠어요?", reason: "제출할 실제 작업물을 첨부합니다." } }],
    },
  });
  assert.ok(result);
  const saved = parseSimulationSession(f.record().state)!;
  assert.deepEqual(saved.applicationReview?.fields, before.state.applicationReview?.fields);
  assert.equal(saved.applicationReview?.resumeDocumentId, before.state.applicationReview?.resumeDocumentId);
  assert.equal(saved.preparation?.finalDocumentId, "resume");
  const messages = applicationQuestionMessages(saved);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].applicationReviewMessageId, before.messageId);
  assert.equal(messages[0].applicationQuestions.status, "waiting");
  assert.equal(applicationReviewView(f.record()).preparationPending, true);
  await assert.rejects(startApplicationBrowser(f.store, f.record(), { purpose: "Apply" }, undefined, saved.applicationReview!.revision), /Finish the current questions first/);
});

test("omitted user edits are preserved and explicit chat changes update the saved field", () => {
  const f = fixture(),
    s = f.record().state;
  s.applicationReview = editApplicationReview(s.applicationReview!, 1, [
    { fieldId: "field-1", value: "My exact answer\nwith two lines" },
  ]);
  const prepared = prepareApplicationReview(s, "resume", [])!;
  assert.equal(prepared.fields[0].value, "My exact answer\nwith two lines");
  assert.equal(
    parseSimulationSession({ ...s, applicationReview: prepared })
      ?.applicationReview?.fields[0].value,
    prepared.fields[0].value
  );
  assert.match(
    applicationReviewText(prepared),
    /Motivation: My exact answer\nwith two lines/
  );
  const revised = prepareApplicationReview(s, "resume", [
    { fieldId: "field-1", value: "The user's requested new answer" },
  ])!;
  assert.equal(revised.fields[0].value, "The user's requested new answer");
  assert.throws(
    () => editApplicationReview(prepared, 1, []),
    /revision conflict/
  );
  assert.throws(
    () =>
      editApplicationReview(prepared, prepared.revision, [
        { fieldId: "invented", value: "wrong field" },
      ]),
    /Unknown application field/
  );
});

test("attachment ownership and browser immutability protect saved form edits", async () => {
  const f = fixture();
  await assert.rejects(
    executeApplicationReview(f.store, f.record(), {
      messageId: 1,
      operation: "save",
      requestId: "foreign",
      reviewRevision: 1,
      answers: [{ fieldId: "field-2", documentId: "someone-elses-file" }],
    }),
    /attachment unavailable/
  );
  const saved = await executeApplicationReview(f.store, f.record(), {
    messageId: 1,
    operation: "save",
    requestId: "edit",
    reviewRevision: 1,
    answers: [{ fieldId: "field-1", value: "User edit" }],
  });
  await assert.rejects(
    startApplicationBrowser(f.store, saved, { purpose: "Apply" }),
    /review/
  );
  const started = await startApplicationBrowser(
    f.store,
    saved,
    { purpose: "Apply" },
    undefined,
    2
  );
  assert.ok(started.state.browser?.managed?.authorizedReviewFingerprint);
  assert.equal(
    started.state.browser?.reviewedApplication?.fields[0].value,
    "User edit"
  );
  await assert.rejects(
    executeApplicationReview(f.store, started, {
      messageId: 1,
      operation: "save",
      requestId: "racing-edit",
      reviewRevision: 2,
      answers: [],
    }),
    /cannot be edited/
  );
  const again = await startApplicationBrowser(
    f.store,
    started,
    { purpose: "Apply" },
    undefined,
    2
  );
  assert.equal(again.state.browser?.id, started.state.browser?.id);
});

test("observed login barrier hands off without starting a browser", async () => {
  const f = fixture(),
    s = f.record().state;
  s.applicationForm!.submission = {
    status: "unsupported",
    reason: "Login required",
  };
  s.applicationReview!.form.submission = s.applicationForm!.submission;
  f.set(s);
  await assert.rejects(
    startApplicationBrowser(
      f.store,
      f.record(),
      { purpose: "Apply" },
      undefined,
      1
    ),
    /observed access barrier/
  );
  const view = applicationReviewView(f.record());
  assert.equal(view.browser, null);
  assert.equal(view.resumeDocumentId, "resume");
  assert.equal(view.applicationUrl, "https://fixture.example/apply");
});

test("submit UI action directly starts a single managed run with the edited saved application", async (t) => {
  const f = fixture();
  await executeApplicationReview(f.store, f.record(), {
    messageId: 1, operation: "save", requestId: "edit-before-submit", reviewRevision: 1,
    answers: [{ fieldId: "field-1", value: "My edited motivation" }],
  });
  const started = await executeApplicationReview(f.store, f.record(), {
    messageId: 1, operation: "start", requestId: "submit-once", reviewRevision: 2,
  });
  const hooks: ManagedApplicationHooks = {
    load: async () => f.record(),
    save: async (mutate) => { const next = f.record().state; mutate(next); f.set(next); return f.record(); },
    contact: async () => { throw new Error("Do not inject unsaved values"); },
    transfer: async (documentId) => ({
      ref: { documentId, hash: started.state.browser!.documentHash, path: "/resume.pdf", name: "Resume.pdf", contentHash: "fixture" },
      file: { documentId, path: "/resume.pdf", name: "Resume.pdf", data: Buffer.from("synthetic").toString("base64") },
    }),
    complete: async () => { throw new Error("No receipt yet"); },
  };
  t.mock.method(browserUseAgents, "createWorkspace", async () => "workspace");
  t.mock.method(browserUseAgents, "clearFiles", async () => {});
  t.mock.method(browserUseAgents, "upload", async () => [{ documentId: "resume", name: "Resume.pdf", path: "uploads/Resume.pdf" }]);
  let runs = 0;
  t.mock.method(browserUseAgents, "createRun", async (task: string) => {
    runs++;
    assert.ok(task.includes("My edited motivation"));
    assert.ok(task.includes("uploads/Resume.pdf"));
    return { id: "run", sessionId: "session", status: "running" };
  });
  t.mock.method(browserUseAgents, "status", async () => ({ status: "running" }));
  await runManagedApplication(hooks, 0);
  await executeApplicationReview(f.store, f.record(), {
    messageId: 1, operation: "start", requestId: "repeat-click", reviewRevision: 2,
  });
  await runManagedApplication(hooks, 0);
  assert.equal(runs, 1);
  assert.equal(f.record().state.activity!.batches.length, 0);
  assert.equal(f.record().state.browser!.approval!.executed, false);
});

test("reinspection cannot send old positional answers to a different observed form", async () => {
  const f = fixture(), s = f.record().state;
  s.applicationForm = { ...s.applicationForm!, checkedAt: "2030-01-01T00:00:00Z", fields: [{ ...s.applicationForm!.fields[0], label: "Start date" }] };
  f.set(s);
  assert.equal(applicationReviewView(f.record()).reviewCurrent, false);
  await assert.rejects(executeApplicationReview(f.store, f.record(), {
    messageId: 1, operation: "start", requestId: "stale-form", reviewRevision: 1,
  }), /form changed/);
  assert.equal(f.record().state.browser, undefined);
  assert.equal(f.record().state.preparation!.finalDocumentId, "resume");
});

test("review responses omit browser credentials and raw request bodies", async () => {
  const f = fixture();
  const started = await startApplicationBrowser(
    f.store,
    f.record(),
    { purpose: "Apply" },
    undefined,
    1
  );
  started.state.browser!.pendingRequest = {
    id: "request",
    url: "https://fixture.example/send",
    pageUrl: "https://fixture.example/apply",
    method: "POST",
    bodyHash: "hash",
    formHash: "hash",
    bodyPreview: "secret-token",
    fields: [{ label: "Name", value: "Fixture" }],
  };
  const view = applicationReviewView(started);
  assert.deepEqual(view.browser?.request?.fields, [
    { label: "Name", value: "Fixture" },
  ]);
  assert.equal(JSON.stringify(view).includes("secret-token"), false);
});
