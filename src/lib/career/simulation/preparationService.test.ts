import { askApplicationInput } from "./applicationInput";
import test from "node:test";
import assert from "node:assert/strict";
import { createSimulationSession, mutateSimulationSession } from "./session";
import { createPreparation } from "./preparation";
import { executePreparationRequest } from "./preparationService";
import { saveSession } from "./sessionStore";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";

test("authoritative revisions prevent duplicate generation and stale approvals; ended state preserves responses", async () => {
  const environment = process.env.NODE_ENV;
  Object.assign(process.env, { NODE_ENV: "test" });
  let state = createSimulationSession({
    roleRef: "r",
    roleName: "Engineer",
    documentId: "cv",
    documentName: "CV",
  });
  state.analysisStatus = "completed";
  state.preparation = createPreparation();
  state.actions = [
    {
      id: "A",
      inputKind: "question",
      category: "content",
      title: "Explain your work",
      target: "Experience",
      proposal: "Explain",
      reason: "JD",
      requirementIds: [],
      evidenceIds: [],
      needsConfirmation: true,
      questions: ["What did you deliver?"],
      executionPrompt: "",
      status: "pending",
      resolution: "",
      evidenceMessageId: null,
    },
  ];
  state.activity = { version: 1, offerId: 1, outputs: {}, batches: [] };
  state = askApplicationInput(
    state,
    {
      purpose: "Confirm scope",
      introduction: "One question.",
      items: [{ actionId: "A" }],
    },
    "ask"
  );
  let row = {
    id: state.sessionId,
    message_id: 10,
    conversation_id: "c",
    user_id: "u",
    role: "assistant",
    content: "",
    created_at: new Date().toISOString(),
    message_type: "simulation_session",
    payload: state,
  };
  const admin = {
    rpc: async (_name: string, args: Record<string, unknown>) => {
      if (args.p_user_id !== "u" || args.p_conversation_id !== "c")
        return { data: null, error: { message: "Owner mismatch" } };
      if (args.p_operation === "read")
        return { data: structuredClone(row), error: null };
      if (args.p_revision !== row.payload.revision)
        return { data: null, error: { message: "Revision conflict" } };
      row = {
        ...row,
        payload: {
          ...(args.p_payload as typeof state),
          revision: row.payload.revision + 1,
        },
      };
      return { data: structuredClone(row), error: null };
    },
  } as unknown as TalentAdminClient;
  const store = { admin, userId: "u", conversationId: "c" };
  let generations = 0;
  const published: (typeof state)[] = [];
  const generate: Parameters<typeof executePreparationRequest>[2] = async (
    s,
    r
  ) => {
    generations++;
    assert.equal(
      published.at(-1)?.preparation?.responses.A.text,
      "Built internal APIs with two colleagues",
      "saved input is published before model generation starts"
    );
    return saveSession(
      s,
      r,
      {
        ...r.state,
        preparation: {
          ...r.state.preparation!,
          generation: {
            status: "ready",
            runId: "r",
            startedAt: null,
            inputRevision: r.state.preparation!.inputRevision,
          },
          draftVersion: 1,
          draftMessageId: 100,
        },
      },
      "generated"
    );
  };
  const request = {
    conversationId: "c",
    sessionMessageId: 10,
    expectedRevision: 1,
    requestId: "answer",
    operation: "respond" as const,
    itemId: "A",
    response: {
      decision: "answer" as const,
      text: "Built internal APIs with two colleagues",
    },
  };
  try {
    const results = await Promise.allSettled([
      executePreparationRequest(store, request, generate, (r) =>
        published.push(r.state)
      ),
      executePreparationRequest(store, request, generate, (r) =>
        published.push(r.state)
      ),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(generations, 0);
    assert.equal(row.payload.status, "active");
    assert.equal(
      row.payload.preparation!.responses.A.text,
      request.response.text
    );
    const invoke = (
      operation: "approve" | "respond" | "end",
      extra: Record<string, unknown> = {}
    ) =>
      executePreparationRequest(
        store,
        {
          ...request,
          operation,
          expectedRevision: row.payload.revision,
          requestId: crypto.randomUUID(),
          ...extra,
        },
        generate
      );
    await assert.rejects(() => executePreparationRequest(store,{...request,operation:"generate",expectedRevision:row.payload.revision,requestId:"obsolete-draft"},generate));
    await assert.rejects(() => invoke("approve",{draftVersion:1}));
    const current = { messageId: 10, state: row.payload };
    await saveSession(
      store,
      current,
      askApplicationInput(
        current.state,
        {
          purpose: "Revise scope",
          introduction: "Confirm the correction.",
          items: [{ actionId: "A" }],
        },
        "ask-again"
      ),
      "ask-again"
    );
    await invoke("respond", { response: { decision: "skip" } });
    assert.equal(row.payload.preparation!.approvedVersion, null);
    assert.equal(generations, 0);
    await assert.rejects(() => invoke("approve", { draftVersion: 1 }));
    // A completed provider session can already have been deleted. Ending the
    // application must not try to cancel that terminal run again.
    row.payload.browser = {
      id: "finished-run", status: "failed", sessionId: "deleted-provider-session",
      startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      documentId: "cv", documentHash: "hash", url: "https://example.com/apply", purpose: "Apply",
    };
    await invoke("end");
    assert.equal(row.payload.status, "ended");
    assert.equal(row.payload.preparation!.draftMessageId, null);
    await assert.rejects(() => invoke("respond"));
    await assert.rejects(() =>
      executePreparationRequest(
        { ...store, userId: "other" },
        request,
        generate
      )
    );
  } finally {
    if (environment === undefined)
      Reflect.deleteProperty(process.env, "NODE_ENV");
    else Object.assign(process.env, { NODE_ENV: environment });
  }
});

test("revising one preparation item preserves unrelated answers and revokes only explicitly reconsidered input", () => {
  const s = createSimulationSession({
    roleRef: "r",
    roleName: "Role",
    documentId: "cv",
    documentName: "CV",
  });
  s.analysisStatus = "completed";
  s.preparation = createPreparation();
  const item = {
    id: "A",
    inputKind: "question" as const,
    category: "content" as const,
    title: "Scope",
    target: "Experience",
    proposal: "Clarify scope",
    reason: "JD",
    requirementIds: [],
    evidenceIds: [],
    needsConfirmation: true,
    questions: ["What scope?"],
    executionPrompt: "",
  };
  let next = mutateSimulationSession(
    s,
    { action: "revise_item", newAction: item },
    1
  );
  next = mutateSimulationSession(
    next,
    {
      action: "respond",
      actionId: "A",
      response: { decision: "answer", text: "Internal only" },
    },
    2
  );
  next = mutateSimulationSession(
    next,
    { action: "revise_item", newAction: { ...item, id: "B", title: "Scale" } },
    3
  );
  next = mutateSimulationSession(
    next,
    { action: "respond", actionId: "B", response: { decision: "skip" } },
    4
  );
  next = mutateSimulationSession(
    next,
    { action: "revise_item", newAction: { ...item, title: "Actual scope" } },
    5
  );
  assert.equal(next.preparation!.responses.A.text, "Internal only");
  next = mutateSimulationSession(
    next,
    { action: "revise_item", newAction: item, reconsiderResponse: true },
    6
  );
  assert.equal(next.preparation!.responses.A, undefined);
  assert.equal(next.preparation!.responses.B.decision, "skip");
});
