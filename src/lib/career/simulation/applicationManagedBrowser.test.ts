import { applicationSubmissionState } from "./applicationExecution";
import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import {
  runManagedApplication,
  resumeManagedApplication,
  managedApplicationInstructions,
  type ManagedApplicationHooks,
} from "./applicationManagedBrowser";
import { browserUseAgents } from "./browserUseAgents";
import { createSimulationSession } from "./session";
import { createPreparation } from "./preparation";
import type { SessionRecord } from "./sessionStore";

const workspaceId = "00000000-0000-4000-8000-000000000010";
const sessionId = "00000000-0000-4000-8000-000000000011";
const runId = "00000000-0000-4000-8000-000000000012";
function fixture(t: TestContext) {
  let state = createSimulationSession({
    roleRef: "job:fixture",
    roleName: "Fixture · Engineer",
    documentId: "resume",
    documentName: "Resume",
  });
  state.locale = "ko";
  state.analysisStatus = "completed";
  state.preparation = createPreparation();
  state.activity = { version: 1, offerId: 1, outputs: {}, batches: [] };
  const form = {
    status: "read" as const,
    url: "https://fixture.example/apply",
    checkedAt: state.startedAt,
    limitations: [],
    fields: [
      {
        label: "지원 동기",
        type: "textarea",
        required: true,
        options: [],
        fileTypes: [],
        maxLength: null,
        instructions: "",
      },
      {
        label: "선택 동의",
        type: "checkbox",
        required: false,
        options: [],
        fileTypes: [],
        maxLength: null,
        instructions: "",
      },
    ],
  };
  const review = {
    revision: 1,
    updatedAt: state.startedAt,
    form,
    resumeDocumentId: "resume",
    fields: [
      {
        fieldId: "field-1",
        value: "제가 승인한 원문입니다.\n줄바꿈 유지",
        editedByUser: true,
      },
      { fieldId: "field-2", values: [], editedByUser: true },
    ],
  };
  state.applicationReview = review;
  state.browser = {
    id: "attempt",
    engine: "browser-use-agents",
    status: "queued",
    documentId: "resume",
    documentHash: "hash",
    url: form.url,
    purpose: "Apply",
    startedAt: state.startedAt,
    updatedAt: state.startedAt,
    reviewedApplication: review,
  };
  const calls: string[] = [];
  let completed: unknown;
  let changedFile = false;
  let remoteStatus = "running";
  let output: unknown = {
    status: "succeeded",
    summary: "완료",
    url: form.url,
    evidence: "Receipt #fixture",
    submissionAttempted: true,
    questions: [],
    reviewMarkdown: "",
  };
  let capturedTask = "";
  const record = (): SessionRecord => ({
    messageId: 1,
    state: structuredClone(state),
  });
  const hooks: ManagedApplicationHooks = {
    load: async () => record(),
    save: async (mutate) => {
      const next = structuredClone(state);
      mutate(next);
      next.revision++;
      state = next;
      return record();
    },
    transfer: async (documentId) => ({
      file: {
        path: "/local/resume.pdf",
        name: "지원서.pdf",
        documentId,
        data: Buffer.from("synthetic resume").toString("base64"),
      },
      ref: {
        documentId,
        hash: changedFile ? "changed" : "hash",
        contentHash: "bytes",
        path: "/local/resume.pdf",
        name: "지원서.pdf",
      },
    }),
    contact: async () => {
      throw new Error("Reviewed form must not inject extra profile facts");
    },
    complete: async (result) => {
      completed = result;
      state.browser!.status = result.status;
    },
  };
  t.mock.method(browserUseAgents, "createWorkspace", async () => {
    calls.push("workspace");
    return workspaceId;
  });
  t.mock.method(browserUseAgents, "clearFiles", async () => {
    calls.push("clearFiles");
  });
  t.mock.method(
    browserUseAgents,
    "upload",
    async (_workspace: string, files: unknown[]) => {
      calls.push("upload");
      assert.equal(files.length, 1);
      return [
        {
          documentId: "resume",
          name: "지원서.pdf",
          path: "uploads/지원서.pdf",
        },
      ];
    }
  );
  t.mock.method(browserUseAgents, "createRun", async (task: string) => {
    calls.push("run");
    capturedTask = task;
    return { id: runId, sessionId, status: "running" };
  });
  t.mock.method(browserUseAgents, "status", async () => {
    calls.push("status");
    return { status: remoteStatus };
  });
  t.mock.method(browserUseAgents, "result", async () => ({
    id: runId,
    sessionId,
    status: "completed",
    output,
    totalCostUsd: "0.03",
  }));
  t.mock.method(browserUseAgents, "stop", async () => {
    calls.push("stop");
  });
  const respond = async (decision = "submit") => {
    const batch = state.activity!.batches.at(-1)!;
    batch.status = "submitted";
    batch.responses[batch.itemIds[0]] = {
      decision: "answer",
      optionId: decision,
      text: decision === "submit" ? "승인" : decision,
    };
    return resumeManagedApplication(hooks, batch.id);
  };
  return {
    hooks,
    calls,
    record,
    respond,
    task: () => capturedTask,
    completed: () => completed,
    changeFile: () => {
      changedFile = true;
    },
    mutate: (fn: (s: typeof state) => void) => fn(state),
    finish: (value?: unknown) => {
      remoteStatus = "completed";
      if (value) output = value;
    },
  };
}

test("review approval precedes any managed API request; approved values and filenames reach one run", async (t) => {
  const f = fixture(t);
  await runManagedApplication(f.hooks, 0);
  assert.deepEqual(f.calls, []);
  const batch = f.record().state.activity!.batches.at(-1)!;
  assert.ok(
    batch.review?.markdown.includes("제가 승인한 원문입니다.\n줄바꿈 유지")
  );
  assert.ok(batch.review?.markdown.includes("지원서.pdf"));
  assert.ok(batch.review?.markdown.includes("미입력"));
  await f.respond();
  assert.equal(applicationSubmissionState(f.record().state), "not_submitted");
  await runManagedApplication(f.hooks, 0);
  assert.equal(f.calls.filter((c) => c === "run").length, 1);
  assert.ok(f.task().includes(batch.review!.markdown));
  assert.ok(f.task().includes("uploads/지원서.pdf"));
  assert.ok(f.task().includes(managedApplicationInstructions));
  await runManagedApplication(f.hooks, 0);
  assert.equal(f.calls.filter((c) => c === "run").length, 1);
  f.finish();
  await runManagedApplication(f.hooks, 0);
  assert.equal(f.record().state.browser!.approval!.executed, true);
  assert.equal((f.completed() as { status: string }).status, "succeeded");
  assert.equal(f.record().state.browser!.managed!.totalCostUsd, "0.03");
});

test("declining approval never uploads files or starts an agent", async (t) => {
  const f = fixture(t);
  await runManagedApplication(f.hooks, 0);
  await f.respond("cancel");
  await runManagedApplication(f.hooks, 0);
  assert.deepEqual(f.calls, ["stop"]);
  assert.equal(f.record().state.browser!.status, "cancelled");
});

test("edited review and changed attachment invalidate approval before any remote run", async (t) => {
  const f = fixture(t);
  await runManagedApplication(f.hooks, 0);
  f.mutate((s) => {
    s.applicationReview!.revision++;
  });
  await assert.rejects(f.respond(), /review changed/);
  assert.deepEqual(f.calls, []);
});

test("changed file after approval cannot be uploaded", async (t) => {
  const f = fixture(t);
  await runManagedApplication(f.hooks, 0);
  await f.respond();
  f.changeFile();
  await assert.rejects(runManagedApplication(f.hooks, 0), /attachment changed/);
  assert.deepEqual(f.calls, []);
});

test("ambiguous run creation is never replayed after worker restart", async (t) => {
  const f = fixture(t);
  await runManagedApplication(f.hooks, 0);
  await f.respond();
  t.mock.method(browserUseAgents, "createRun", async () => {
    f.calls.push("run");
    throw new Error("connection lost");
  });
  await assert.rejects(runManagedApplication(f.hooks, 0), /connection lost/);
  await assert.rejects(
    runManagedApplication(f.hooks, 0),
    /automatic replay is blocked/
  );
  assert.equal(f.calls.filter((c) => c === "run").length, 1);
  assert.ok(f.record().state.browser!.transmissionAttemptedAt);
});

test("new required question returns to Harper and requires review before a same-session follow-up", async (t) => {
  const f = fixture(t);
  await runManagedApplication(f.hooks, 0);
  await f.respond();
  await runManagedApplication(f.hooks, 0);
  f.finish({
    status: "needs_input",
    summary: "추가 경력 확인",
    url: "https://fixture.example/apply",
    evidence: "Required question",
    submissionAttempted: false,
    questions: [
      {
        kind: "question",
        title: "근무 시작일은 언제인가요?",
        description: "",
        options: [],
      },
    ],
    reviewMarkdown: "",
  });
  await runManagedApplication(f.hooks, 0);
  assert.equal(f.record().state.browser!.status, "waiting");
  await f.respond("다음 달 1일");
  await runManagedApplication(f.hooks, 0);
  assert.equal(f.calls.filter((c) => c === "run").length, 1);
  assert.ok(
    f
      .record()
      .state.activity!.batches.at(-1)!
      .review?.markdown.includes("다음 달 1일")
  );
  assert.equal(f.record().state.browser!.managed!.sessionId, sessionId);
  await f.respond();
  t.mock.method(
    browserUseAgents,
    "createRun",
    async (
      _task: string,
      _schema: unknown,
      workspace: string,
      session: string
    ) => {
      assert.equal(workspace, workspaceId);
      assert.equal(session, sessionId);
      f.calls.push("run");
      return { id: runId, sessionId, status: "running" };
    }
  );
  await runManagedApplication(f.hooks, 0);
  assert.equal(f.calls.filter((c) => c === "run").length, 2);
});

test("possible submission never resumes just because the agent asks a question", async (t) => {
  const f = fixture(t);
  await runManagedApplication(f.hooks, 0);
  await f.respond();
  await runManagedApplication(f.hooks, 0);
  f.finish({
    status: "needs_input",
    summary: "응답 확인 불가",
    url: "https://fixture.example/apply",
    evidence: "Submit sent without receipt",
    submissionAttempted: true,
    questions: [],
    reviewMarkdown: "",
  });
  await runManagedApplication(f.hooks, 0);
  assert.equal((f.completed() as { status: string }).status, "uncertain");
  assert.equal(f.record().state.activity!.batches.length, 1);
});

test("cancellation while uploading prevents dispatch", async (t) => {
  const f = fixture(t);
  await runManagedApplication(f.hooks, 0);
  await f.respond();
  t.mock.method(browserUseAgents, "upload", async () => {
    f.mutate((s) => {
      s.status = "ended";
    });
    return [];
  });
  await assert.rejects(runManagedApplication(f.hooks, 0), /authorization changed/);
  assert.equal(f.calls.filter((c) => c === "run").length, 0);
});
