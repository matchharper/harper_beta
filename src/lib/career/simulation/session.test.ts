import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createSimulationSession,
  resolveAnalysisCardAction,
  finishSimulationAnalysis,
  mutateSimulationSession,
  parseSimulationSession,
  simulationSessionContext,
} from "./session";
import { buildSimulationSessionPrompt } from "./sessionPrompt";
import { SIMULATION_TOOL_NAMES } from "./sessionTool";
import type { ApplicationSimulation } from "./types";
const action = {
  id: "a1",
  category: "content" as const,
  title: "Clarify ownership",
  target: "Project A",
  proposal: "Add ownership",
  reason: "Missing evidence",
  requirementIds: ["r1"],
  evidenceIds: [],
  needsConfirmation: true,
  questions: ["What did you own?"],
  executionPrompt: "Ask about ownership",
};
function ready() {
  const initial = createSimulationSession({
    roleRef: "role:a",
    roleName: "Engineer",
    documentId: "doc",
    documentName: "CV",
  });
  return finishSimulationAnalysis(
    initial,
    {
      version: 2,
      status: "completed",
      roleName: "Engineer",
      documentName: "CV",
      updatedAt: initial.startedAt,
      steps: [
        {
          key: "role",
          status: "completed",
          result: {
            summary: "",
            report: "",
            data: { kind: "role", requirements: [] },
          },
        },
        { key: "comparison", status: "completed" },
        {
          key: "review",
          status: "completed",
          result: {
            summary: "",
            report: "",
            data: {
              kind: "review",
              actions: [action, { ...action, id: "a2" }],
              emptyReason: "",
            },
          },
        },
      ],
    } as ApplicationSimulation,
    10
  );
}
test("selecting a card and recording facts never completes an edit", () => {
  let s = mutateSimulationSession(
    ready(),
    { action: "select", actionId: "a1" },
    11
  );
  assert.equal(s.actions[0].status, "needs_confirmation");
  s = mutateSimulationSession(
    s,
    { action: "save_fact", text: "I built only the backend" },
    12
  );
  assert.equal(s.actions[0].status, "needs_confirmation");
  const fact = s.facts[0];
  s = mutateSimulationSession(
    s,
    { action: "save_fact", factId: fact.id, text: "I co-built the backend" },
    13
  );
  assert.equal(s.facts.length, 1);
  assert.equal(s.facts[0].messageId, 13);
  assert.ok(
    !JSON.stringify(simulationSessionContext(s)).includes("executionPrompt")
  );
});
test("complete and skip close the session with distinct resolutions", () => {
  let s = mutateSimulationSession(
    ready(),
    {
      action: "update_action",
      actionId: "a1",
      status: "completed",
      reason: "User confirms they applied the bullet",
    },
    12
  );
  assert.equal(s.status, "active");
  s = mutateSimulationSession(
    s,
    {
      action: "update_action",
      actionId: "a2",
      status: "skipped",
      reason: "User kept the wording",
    },
    13
  );
  assert.equal(s.status, "ended");
  assert.equal(s.endReason, "completed");
  assert.throws(() =>
    mutateSimulationSession(s, { action: "select", actionId: "a1" }, 14)
  );
});
test("failed analysis stays active; successful empty results close", () => {
  const s = ready();
  const result = {
    version: 2,
    status: "failed",
    roleName: "E",
    documentName: null,
    updatedAt: s.startedAt,
    steps: [],
  } as unknown as ApplicationSimulation;
  // Workflow always supplies all three steps.
  result.steps = [
    { key: "role", status: "completed" },
    { key: "comparison", status: "failed" },
    { key: "review", status: "pending" },
  ];
  assert.equal(finishSimulationAnalysis(s, result, 11).status, "active");
  assert.equal(
    finishSimulationAnalysis(s, { ...result, status: "completed" }, 11)
      .endReason,
    "empty"
  );
});
test("tool scope and prompt explicitly exclude actual editing and long-term memory", () => {
  const tools = { toolNames: SIMULATION_TOOL_NAMES };
  assert.ok(tools.toolNames.includes("manage_simulation_session"));
  for (const forbidden of [
    "update_document",
    "contact_company",
    "write_talent_context",
    "recommend_job_postings",
    "web_search",
  ])
    assert.ok(!tools.toolNames.includes(forbidden));
  assert.match(
    buildSimulationSessionPrompt(ready())[0].text,
    /direct content editing is unavailable/
  );
  assert.equal(parseSimulationSession({}), undefined);
});
test("unknown actions and unsupported completion without reason are rejected", () => {
  assert.throws(() =>
    mutateSimulationSession(
      ready(),
      { action: "select", actionId: "wrong" },
      11
    )
  );
  assert.throws(() =>
    mutateSimulationSession(
      ready(),
      { action: "update_action", actionId: "a1", status: "completed" },
      11
    )
  );
});

test("resume source is preserved without claiming an unavailable editor", () => {
  const session = createSimulationSession({
    roleRef: "r",
    roleName: "Role",
    documentId: "doc",
    documentName: "Resume",
    documentOriginType: "harper-generated",
  });
  const blocks = buildSimulationSessionPrompt(session);
  const context = JSON.parse(
    blocks.find((b) => b.key === "simulation_context")!.text
  );
  assert.equal(context.selectedResume.documentId, "doc");
  assert.equal(context.selectedResume.source, "harper-generated");
  assert.equal(context.selectedResume.directEditingAvailable, false);
});

test("analysis cards select stored actions without needing a reminder proposal", () => {
  const session = ready();
  const request = {
    action: "select_analysis" as const,
    sessionMessageId: 1,
    expectedRevision: session.revision,
    analysisMessageId: session.analysisMessageId!,
    actionId: "a1",
  };
  assert.equal(session.proposal, null);
  assert.equal(resolveAnalysisCardAction(session, request)?.id, "a1");
  for (const altered of [
    { ...request, analysisMessageId: request.analysisMessageId + 1 },
    { ...request, analysisMessageId: undefined },
    { ...request, expectedRevision: session.revision + 1 },
    { ...request, actionId: "other" },
  ])
    assert.equal(resolveAnalysisCardAction(session, altered), undefined);
  assert.equal(
    resolveAnalysisCardAction({ ...session, status: "ended" }, request),
    undefined
  );
  assert.equal(
    resolveAnalysisCardAction(
      { ...session, analysisStatus: "running" },
      request
    ),
    undefined
  );
  session.actions[0].status = "completed";
  assert.equal(resolveAnalysisCardAction(session, request), undefined);
});

test("prose nudge remembers the action without a card or starting work", () => {
  const initial = ready();
  const nudged = mutateSimulationSession(initial, { action: "nudge", actionId: "a1" }, 11);
  assert.equal(nudged.proposedActionId, "a1");
  assert.equal(nudged.proposal, null);
  assert.equal(nudged.currentActionId, initial.currentActionId);
  assert.deepEqual(nudged.actions, initial.actions);
  assert.equal(simulationSessionContext(nudged).lastProposedActionId, "a1");
  const accepted = mutateSimulationSession(nudged, { action: "select", actionId: "a1" }, 12);
  assert.equal(accepted.currentActionId, "a1");
  assert.equal(accepted.proposal, null);
  assert.throws(() => mutateSimulationSession(initial, { action: "nudge", actionId: "missing" }, 11));
  initial.actions[0].status = "completed";
  assert.throws(() => mutateSimulationSession(initial, { action: "nudge", actionId: "a1" }, 11));
});
