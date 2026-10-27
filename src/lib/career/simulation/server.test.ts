import test from "node:test";
import assert from "node:assert/strict";
import { executeApplicationSimulation } from "./server";
import { canStartApplication } from "../llmTools";
import { pendingApplicationBatch } from "./applicationInput";
import type { SimulationSession } from "./session";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { CAREER_TEXT_CHAT_MODEL_IDS } from "../textChatModelConfig";

function fixture(mode: "suggestions" | "empty" | "failure" = "suggestions") {
  let state: SimulationSession | undefined,
    nextId = 10,
    writes = 0,
    inspections = 0;
  const messages: any[] = [];
  const document = {
    id: "resume",
    kind: "resume",
    file_name: "Original.pdf",
    extracted_text: "Original resume",
    origin_type: "upload",
  };
  const admin = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let insert: any;
      const read = async () => {
        if (table === "talent_conversations") {
          assert.deepEqual(filters, { id: "conversation", user_id: "owner" });
          return { data: { id: "conversation" }, error: null };
        }
        assert.equal(table, "talent_messages");
        assert.equal(insert.user_id, "owner");
        assert.equal(insert.conversation_id, "conversation");
        const row = {
          ...insert,
          id: nextId++,
          created_at: new Date().toISOString(),
        };
        messages.push(row);
        return { data: row, error: null };
      };
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => {
          filters[k] = v;
          return q;
        },
        insert: (v: any) => {
          insert = v;
          return q;
        },
        single: read,
        maybeSingle: read,
      };
      return q;
    },
    async rpc(_name: string, args: any) {
      if (args.p_operation === "read")
        return {
          data: state
            ? { message_id: 100, payload: state, created_at: state.startedAt }
            : null,
          error: null,
        };
      if (args.p_operation !== "begin")
        assert.equal(
          args.p_revision,
          state!.revision,
          "state updates must preserve optimistic concurrency"
        );
      state = {
        ...structuredClone(args.p_payload),
        revision: (state?.revision ?? 0) + 1,
      };
      writes++;
      return {
        data: {
          message_id: 100,
          payload: state,
          created_at: state!.startedAt,
          created: args.p_operation === "begin",
        },
        error: null,
      };
    },
  } as unknown as TalentAdminClient;
  const dependencies = {
    fetchTalentStructuredProfile: async () => ({
      talentUser: { headline: "Engineer" },
      talentExperiences: [],
      talentEducations: [],
      talentExtras: [],
    }),
    fetchTalentDocuments: async () => [document],
    fetchTalentDocument: async () => document,
    fetchTalentContextPromptSnapshot: async () => ({
      briefs: [],
      memories: [],
    }),
    fetchTalentUserProfile: async () => ({
      name: "Alex",
      email: "alex@example.test",
    }),
    executeSharedWebSearch: async () => ({
      text: "Public company information",
    }),
    executeSharedOpenUrl: async () => {
      throw new Error("Saved JD should be reused");
    },
    inspectApplicationForm: async () => {
      inspections++;
      return {
        status: "read",
        url: "https://example.test/apply",
        checkedAt: new Date().toISOString(),
        fields: [],
        limitations: [],
      };
    },
    writeApplicationSuggestions: async (input: any) => {
      assert.match(input.resume, /Original resume/);
      assert.match(input.candidate, /alex@example.test/);
      assert.match(input.role, /Saved JD/);
      assert.match(input.application, /pending/);
      if (mode === "failure") throw new Error("Provider unavailable");
      return mode === "empty"
        ? []
        : [
            {
              kind: "question",
              title: "Which API did you build?",
              reason: "A relevant fact is missing",
            },
          ];
    },
  } as unknown as NonNullable<
    Parameters<typeof executeApplicationSimulation>[1]
  >;
  const events: any[] = [];
  const args = {
    admin,
    userId: "owner",
    conversationId: "conversation",
    documentId: "resume",
    roleName: "Example Engineer",
    roleRef: "role:example",
    requestKey: "start",
    startOfferId: 1,
    role: {
      company: "Example",
      description: "Saved JD",
      externalJdUrl: "https://example.test/job",
    },
    locale: "en",
    onMessage: (m: any) => events.push(structuredClone(m)),
  };
  return {
    args,
    dependencies,
    events,
    get state() {
      return state!;
    },
    get writes() {
      return writes;
    },
    get inspections() {
      return inspections;
    },
  };
}

test("authorized Start runs three foreground stages and publishes exactly one review; repeat Start cannot duplicate work", async () => {
  assert.equal(
    canStartApplication({ isOnboardingDone: true, channel: "chat" }),
    true
  );
  const f = fixture();
  const result = await executeApplicationSimulation(f.args, f.dependencies);
  assert.equal(result.ok, true);
  assert.equal("awaitingUserInput" in result && result.awaitingUserInput, true);
  assert.equal(f.state.analysisStatus, "completed");
  assert.equal(
    pendingApplicationBatch(f.state)?.items?.[0].title,
    "Which API did you build?"
  );
  const observed = [
    ...new Set(
      f.events.flatMap((e) => (e.simulation ? [e.simulation.progress] : []))
    ),
  ];
  assert.deepEqual(observed, [
    "candidate",
    "role",
    "suggestions",
  ]);
  const writes = f.writes;
  const repeat = await executeApplicationSimulation(f.args, f.dependencies);
  assert.equal("alreadyStarted" in repeat && repeat.alreadyStarted, true);
  assert.equal(f.inspections, 1);
  assert.equal(f.writes, writes);
});

test("no suggestions keeps preparation active so the model can save readiness without a dummy question", async () => {
  const f = fixture("empty"),
    result = await executeApplicationSimulation(f.args, f.dependencies);
  assert.equal(result.ok, true);
  assert.equal(
    "awaitingUserInput" in result && result.awaitingUserInput,
    false
  );
  assert.equal(f.state.status, "active");
  assert.equal(f.state.actions.length, 0);
  assert.equal(pendingApplicationBatch(f.state), undefined);
});

test("Start forwards the current conversation model to the suggestion writer", async () => {
  for (const textChatModel of CAREER_TEXT_CHAT_MODEL_IDS) {
    const f = fixture("empty");
    let received: string | undefined;
    const writer = f.dependencies.writeApplicationSuggestions;
    f.dependencies.writeApplicationSuggestions = async (args) => {
      received = args.model;
      return writer(args);
    };
    const result = await executeApplicationSimulation({ ...f.args, textChatModel }, f.dependencies);
    assert.equal(result.ok, true);
    assert.equal(received, textChatModel);
  }
});

test("preparation failure preserves the failed progress card and releases the mode for a fresh attempt", async () => {
  const f = fixture("failure"),
    result = await executeApplicationSimulation(f.args, f.dependencies);
  assert.equal(result.ok, false);
  assert.equal("preparationStarted" in result && result.preparationStarted, true);
  assert.equal("startCardDisplayed" in result && result.startCardDisplayed, true);
  assert.equal(f.state.status, "ended");
  assert.equal(f.state.endReason, "failed");
  assert.equal(f.state.analysisStatus, "failed");
  assert.equal(
    (
      f.state.activity!.outputs[String(f.state.analysisMessageId)]
        .payload as any
    ).status,
    "failed"
  );
  assert.equal(
    "applicationUrl" in result && result.applicationUrl,
    "https://example.test/job"
  );
});


test("suggestions arrive before inspection, which is persisted separately and does not overwrite user answers", async () => {
  const f = fixture();
  const jobs: Array<() => Promise<void>> = [];
  const result = await executeApplicationSimulation({ ...f.args, scheduleAfter: task => jobs.push(task) }, f.dependencies);
  assert.equal(result.ok, true);
  assert.equal(f.inspections, 0, "no form inspection delays the first suggestions");
  assert.equal(f.state.applicationInspection?.status, "queued");
  assert.equal(jobs.length, 1);
  f.state.facts.push({ id: "user-fact", text: "A saved answer", messageId: 12 });
  await jobs[0]();
  assert.equal(f.inspections, 1);
  assert.equal(f.state.applicationInspection?.status, "completed");
  assert.equal(f.state.applicationForm?.url, "https://example.test/apply");
  assert.equal(f.state.facts[0].text, "A saved answer");
  await jobs[0]();
  assert.equal(f.inspections, 1, "completed inspections cannot be duplicated");
});

test("ending preparation before background dispatch prevents browser inspection", async () => {
  const f = fixture();
  const jobs: Array<() => Promise<void>> = [];
  await executeApplicationSimulation({ ...f.args, scheduleAfter: task => jobs.push(task) }, f.dependencies);
  f.state.status = "ended";
  await jobs[0]();
  assert.equal(f.inspections, 0);
});


test("email defers durably, reads live JD and form before suggestions, and resumes once", async () => {
  const f = fixture();
  const order: string[] = [];
  const inspect = f.dependencies.inspectApplicationForm;
  let releaseInspection!: () => void;
  let inspectionEntered!: () => void;
  const entered = new Promise<void>(resolve => { inspectionEntered = resolve; });
  const gate = new Promise<void>(resolve => { releaseInspection = resolve; });
  const dependencies = { ...f.dependencies,
    executeSharedOpenUrl: async () => { order.push("jd"); return { markdown: "Live role requirement", title: "Role", url: "https://example.test/job", cached: false }; },
    inspectApplicationForm: async (...args: Parameters<typeof inspect>) => {
      order.push("form"); inspectionEntered(); await gate;
      const form = await inspect(...args);
      return { ...form, submission: { status: "unsupported", reason: "Applicant login required" },
        fields: [{ label: "Motivation", type: "textarea", required: true, options: [], instructions: "Explain interest in this role", fileTypes: [], maxLength: 1200 },
          { label: "Resume", type: "file", required: true, options: [], instructions: "Attach CV", fileTypes: [".pdf"], maxLength: null }] };
    },
    writeApplicationSuggestions: async (input: any) => {
      order.push("suggestions"); assert.match(input.role, /Live role requirement/);
      for (const evidence of ["example.test/apply", "Applicant login required", "Motivation", "Explain interest in this role", "1200", ".pdf"]) assert.ok(input.application.includes(evidence));
      assert.doesNotMatch(input.application, /pending/); assert.throws(() => JSON.parse(input.application)); return [];
    },
  } as unknown as typeof f.dependencies;
  const args = { ...f.args, startOfferId: undefined, emailSourceMessageId: 1 };
  const first = await executeApplicationSimulation({ ...args, deferPreparation: true }, dependencies);
  assert.equal("preparationPending" in first && first.preparationPending, true);
  assert.deepEqual(order, []);
  assert.equal(f.state.activity?.channel, "email");
  const preparing = executeApplicationSimulation({ ...args, resumeMessageId: 100 }, dependencies);
  await entered;
  assert.deepEqual(order, ["jd", "form"]); // Slow inspection cannot race the writer.
  releaseInspection();
  const result = await preparing;
  assert.equal(result.ok, true);
  assert.deepEqual(order, ["jd", "form", "suggestions"]);
  assert.equal(f.state.activity?.preparationRequest, undefined);
  await executeApplicationSimulation({ ...args, resumeMessageId: 100 }, dependencies);
  assert.equal(order.length, 3);
});

test("email missing or unreadable resume returns an actionable result without starting", async () => {
  for (const document of [null, { id: "resume", extracted_text: " " }]) {
    const f = fixture();
    const result = await executeApplicationSimulation({ ...f.args, emailSourceMessageId: 1 }, {
      ...f.dependencies, fetchTalentDocument: async () => document,
    } as unknown as typeof f.dependencies);
    assert.equal(result.ok, false);
    assert.equal(f.writes, 0);
    assert.match(("reason" in result ? result.reason : "") ?? "", /readable/i);
  }
});

test("same email with a different role or resume is not mistaken for the current preparation", async () => {
  const f = fixture();
  const args = { ...f.args, startOfferId: undefined, emailSourceMessageId: 1, deferPreparation: true };
  await executeApplicationSimulation(args, f.dependencies);
  const writes = f.writes;
  const differentRole = await executeApplicationSimulation({ ...args, roleRef: "role:other" }, f.dependencies);
  assert.equal(differentRole.ok, false);
  const differentDocument = await executeApplicationSimulation({ ...args, documentId: "another-resume" }, {
    ...f.dependencies,
    fetchTalentDocument: async () => ({ id: "another-resume", kind: "resume", extracted_text: "Other resume", file_name: "Other.pdf", origin_type: "upload" }),
  } as unknown as typeof f.dependencies);
  assert.equal(differentDocument.ok, false);
  assert.equal(f.writes, writes);
  assert.equal(f.state.roleRef, args.roleRef);
  assert.equal(f.state.documentId, "resume");
});

test("short and long resumes reach the same suggestion writer intact without length policy", async () => {
  for (const text of ["Engineer.", "Evidence paragraph. ".repeat(8000) + "FINAL CAREER FACT"]) {
    const f = fixture();
    let seen = false;
    await executeApplicationSimulation({ ...f.args, emailSourceMessageId: 1, startOfferId: undefined }, {
      ...f.dependencies,
      fetchTalentDocument: async () => ({ id: "resume", kind: "resume", extracted_text: text }),
      writeApplicationSuggestions: async (input: any) => { assert.equal(input.resume, text); seen = true; return []; },
    } as unknown as typeof f.dependencies);
    assert.equal(seen, true);
  }
});
