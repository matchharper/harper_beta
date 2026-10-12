import test from "node:test";
import assert from "node:assert/strict";
import {
  createPreparation,
  respondToPreparation,
  allPreparationAnswered,
} from "./preparation";
import { createSimulationSession, mutateSimulationSession } from "./session";
import { expirePreparation } from "./preparationStore";
const items = [
  {
    id: "edit",
    inputKind: "change" as const,
    category: "wording" as const,
    needsConfirmation: false,
  },
  {
    id: "facts",
    inputKind: "question" as const,
    category: "content" as const,
    needsConfirmation: true,
  },
  {
    id: "letter",
    inputKind: "material" as const,
    category: "materials" as const,
    needsConfirmation: false,
  },
];
test("collect decisions independently, skip unknown facts and retain cross-experience answers", () => {
  let p = createPreparation();
  p = respondToPreparation(p, items, "facts", {
    decision: "answer",
    text: "At Acme I shipped the dashboard; at Beta I maintained the API.",
  });
  assert.equal(p.currentItemId, "edit");
  assert.equal(allPreparationAnswered(p, items), false);
  p = respondToPreparation(p, items, "edit", { decision: "accept" });
  p = respondToPreparation(p, items, "letter", { decision: "help" });
  assert.equal(allPreparationAnswered(p, items), true);
  assert.match(p.responses.facts.text!, /Acme.*Beta/);
  assert.throws(() =>
    respondToPreparation(p, items, "facts", { decision: "accept" })
  );
  assert.throws(() =>
    respondToPreparation(p, items, "facts", { decision: "answer", text: " " })
  );
  assert.throws(() =>
    respondToPreparation(p, items, "letter", { decision: "document" })
  );
});
test("editing inputs revokes approval and final file without erasing the existing draft", () => {
  const p = {
    ...createPreparation(),
    draftVersion: 2,
    draftMessageId: 10,
    approvedVersion: 2,
    finalDocumentId: "final",
  };
  const next = respondToPreparation(p, items, "edit", { decision: "ignore" });
  assert.equal(next.approvedVersion, null);
  assert.equal(next.finalDocumentId, null);
  assert.equal(next.draftMessageId, 10);
  p.generation.status = "running";
  assert.throws(() =>
    respondToPreparation(p, items, "edit", { decision: "accept" })
  );
});
test("preparation never ends merely from a useful suggestion or all responses, and facts invalidate approval", () => {
  const s = createSimulationSession({
    roleRef: "r",
    roleName: "Engineer",
    documentId: "doc",
    documentName: "Resume",
  });
  s.analysisStatus = "completed";
  s.preparation = createPreparation();
  s.actions = items.map((i) => ({
    ...i,
    title: i.id,
    target: "Resume",
    proposal: "Improve",
    reason: "JD",
    requirementIds: [],
    evidenceIds: [],
    questions: [],
    executionPrompt: "",
    status: "pending",
    resolution: "",
    evidenceMessageId: null,
  }));
  let next = mutateSimulationSession(
    s,
    { action: "respond", actionId: "edit", response: { decision: "accept" } },
    11
  );
  next = mutateSimulationSession(
    next,
    { action: "respond", actionId: "facts", response: { decision: "skip" } },
    12
  );
  next = mutateSimulationSession(
    next,
    { action: "respond", actionId: "letter", response: { decision: "skip" } },
    13
  );
  assert.equal(next.status, "active");
  assert.throws(() =>
    mutateSimulationSession(
      next,
      {
        action: "update_action",
        actionId: "edit",
        status: "completed",
        reason: "Gave advice",
      },
      14
    )
  );
  next.preparation!.approvedVersion = 1;
  next = mutateSimulationSession(
    next,
    { action: "save_fact", text: "Actually the project was internal." },
    15
  );
  assert.equal(next.preparation!.approvedVersion, null);
});
test("expiry excludes active generation, recovers abandoned generation, preserves inputs and drafts", () => {
  const s = createSimulationSession({
    roleRef: "r",
    roleName: "Role",
    documentId: "d",
    documentName: "Resume",
  });
  s.analysisStatus = "completed";
  s.preparation = createPreparation();
  s.lastActivityAt = new Date(Date.now() - 7200000).toISOString();
  s.preparation.draftMessageId = 9;
  const ended = expirePreparation(s);
  assert.equal(ended.endReason, "expired");
  assert.equal(ended.preparation!.draftMessageId, 9);
  s.preparation.generation = {
    status: "running",
    runId: "run",
    startedAt: new Date().toISOString(),
    inputRevision: 0,
  };
  assert.equal(expirePreparation(s).status, "active");
  s.preparation.generation.startedAt = new Date(
    Date.now() - 660000
  ).toISOString();
  assert.equal(expirePreparation(s).preparation!.generation.status, "failed");
});

test("all item kinds collect unclassified freeform and preserve exact user text", () => {
  let p = createPreparation();
  for (const item of items) {
    p = respondToPreparation(p, items, item.id, {
      decision: "answer",
      text: "No, keep the wording but add only my confirmed API work.",
    });
    assert.equal(p.responses[item.id].decision, "answer");
    assert.equal(
      p.responses[item.id].text,
      "No, keep the wording but add only my confirmed API work."
    );
  }
  assert.ok(allPreparationAnswered(p, items));
});
