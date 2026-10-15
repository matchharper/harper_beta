import test from "node:test";
import assert from "node:assert/strict";
import {
  runApplicationInspection,
  awaitApplicationInspection,
} from "./applicationInspection";
import { createSimulationSession, type SimulationSession } from "./session";
import { createPreparation } from "./preparation";
import { suggestionAction } from "./suggestionSchema";
import { askApplicationInput } from "./applicationInput";
import { executePreparationRequest } from "./preparationService";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import type { ApplicationForm } from "./applicationForm";

function fixture() {
  let state = createSimulationSession({
    roleName: "Example · Engineer",
    roleRef: "job:fixture",
    documentId: "resume",
    documentName: "Original",
  });
  state.preparation = createPreparation();
  state.analysisStatus = "completed";
  state.applicationUrl = "https://example.test/apply";
  state.applicationInspection = { status: "queued", runId: "queued" };
  state.activity = { version: 1, offerId: 1, outputs: {}, batches: [] };
  state.actions = [
    suggestionAction(
      {
        kind: "question",
        title: "What did you build?",
        reason: "Relevant experience",
      },
      "Q"
    ),
  ];
  state = askApplicationInput(
    state,
    { purpose: "suggestions", items: [{ actionId: "Q" }] },
    "first"
  );
  let conflict: (() => void) | undefined;
  const admin = {
    rpc: async (_: string, args: any) => {
      assert.equal(args.p_user_id, "owner");
      assert.equal(args.p_conversation_id, "conversation");
      if (args.p_operation !== "read") {
        if (conflict) {
          const run = conflict;
          conflict = undefined;
          run();
          state.revision++;
        }
        if (args.p_revision !== state.revision)
          return {
            data: null,
            error: { message: "Session revision conflict" },
          };
        state = {
          ...structuredClone(args.p_payload),
          revision: state.revision + 1,
        };
      }
      return {
        data: {
          message_id: 10,
          payload: structuredClone(state),
          created_at: state.startedAt,
        },
        error: null,
      };
    },
  } as unknown as TalentAdminClient;
  return {
    store: { admin, userId: "owner", conversationId: "conversation" },
    record: () => ({ messageId: 10, state: structuredClone(state) }),
    update: (mutate: (s: SimulationSession) => void) => {
      mutate(state);
      state.revision++;
    },
    conflict: (run: () => void) => {
      conflict = run;
    },
  };
}
const form: ApplicationForm = {
  status: "read",
  url: "https://example.test/apply",
  checkedAt: new Date().toISOString(),
  fields: [
    {
      label: "Portfolio",
      type: "url",
      required: true,
      instructions: "",
      options: [],
      fileTypes: [],
      maxLength: null,
    },
  ],
  limitations: [],
  submission: { status: "supported", reason: "Public form" },
};

test("a slow inspection and a fast answer submission merge; duplicate workers never launch a second browser", async () => {
  const f = fixture(),
    initial = f.record();
  let release!: (value: ApplicationForm) => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let calls = 0;
  const inspect = async () => {
    calls++;
    entered();
    return new Promise<ApplicationForm>((resolve) => {
      release = resolve;
    });
  };
  const job = runApplicationInspection(f.store, 10, inspect);
  await started;
  await runApplicationInspection(f.store, 10, inspect);
  assert.equal(calls, 1);
  const batch = initial.state.activity!.batches[0];
  const answered = await executePreparationRequest(f.store, {
    conversationId: "conversation",
    sessionMessageId: 10,
    expectedRevision: initial.state.revision,
    requestId: "answer",
    operation: "submit_answers",
    batchId: batch.id,
    responses: { Q: { decision: "answer", text: "Built a retrieval service" } },
  });
  assert.equal(answered.state.activity!.batches[0].status, "submitted");
  assert.equal(answered.state.applicationInspection?.status, "running");
  const continuation = awaitApplicationInspection(f.store, answered);
  f.conflict(() =>
    f.update((s) =>
      s.facts.push({
        id: "extra",
        text: "Another confirmed fact",
        messageId: 11,
      })
    )
  );
  release(form);
  await job;
  const ready = await continuation;
  assert.equal(ready?.state.applicationInspection?.status, "completed");
  assert.equal(
    ready?.state.preparation?.responses.Q.text,
    "Built a retrieval service"
  );
  assert.equal(ready?.state.applicationForm?.fields[0].label, "Portfolio");
  assert.equal(ready?.state.facts[0].text, "Another confirmed fact");
});

test("inspection failures remain a usable preparation with unknown access, never an empty successful form", async () => {
  const f = fixture();
  await runApplicationInspection(f.store, 10, async () => {
    throw new Error("Provider unavailable");
  });
  const s = f.record().state;
  assert.equal(s.status, "active");
  assert.equal(s.analysisStatus, "completed");
  assert.equal(s.applicationInspection?.status, "failed");
  assert.equal(s.applicationForm?.submission?.status, "unknown");
  assert.equal(s.applicationForm?.url, "https://example.test/apply");
});

test("a verified login barrier completes inspection with unsupported access", async () => {
  const f = fixture();
  await runApplicationInspection(f.store, 10, async () => ({
    ...form,
    status: "unavailable",
    fields: [],
    submission: { status: "unsupported", reason: "Sign-in required" },
  }));
  assert.equal(f.record().state.applicationInspection?.status, "completed");
  assert.equal(
    f.record().state.applicationForm?.submission?.status,
    "unsupported"
  );
});

test("late inspection results cannot resurrect an ended session or replace a newer lease", async () => {
  for (const replacement of ["ended", "newer"] as const) {
    const f = fixture();
    await runApplicationInspection(f.store, 10, async () => {
      f.update((s) => {
        if (replacement === "ended") s.status = "ended";
        else
          s.applicationInspection = {
            status: "running",
            runId: "newer",
            startedAt: new Date().toISOString(),
          };
      });
      return form;
    });
    assert.equal(f.record().state.applicationForm, undefined);
    assert.equal(
      f.record().state.status,
      replacement === "ended" ? "ended" : "active"
    );
  }
});

test("a stale read-only inspection can be recovered after a process restart", async () => {
  const f = fixture();
  f.update((s) => {
    s.applicationInspection = {
      status: "running",
      runId: "old",
      startedAt: new Date(Date.now() - 300_000).toISOString(),
    };
  });
  await runApplicationInspection(f.store, 10, async () => form);
  assert.equal(f.record().state.applicationInspection?.status, "completed");
  assert.notEqual(f.record().state.applicationInspection?.runId, "old");
});

test("ending remains valid across a background revision and a concurrent inspection result", async () => {
  const f = fixture(),
    initial = f.record();
  f.update((s) => {
    s.applicationInspection = {
      status: "running",
      runId: "worker",
      startedAt: new Date().toISOString(),
    };
  });
  f.conflict(() =>
    f.update((s) => {
      s.applicationForm = form;
      s.applicationInspection!.status = "completed";
    })
  );
  const ended = await executePreparationRequest(f.store, {
    conversationId: "conversation",
    sessionMessageId: 10,
    expectedRevision: initial.state.revision,
    requestId: "end",
    operation: "end",
  });
  assert.equal(ended.state.status, "ended");
  assert.equal(ended.state.applicationForm?.fields[0].label, "Portfolio");
});
