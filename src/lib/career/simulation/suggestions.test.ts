import test from "node:test";
import assert from "node:assert/strict";
import {
  createSimulationSession,
  mutateSimulationSession,
  parseSimulationSession,
  simulationSessionContext,
} from "./session";
import { createPreparation } from "./preparation";
import {
  askApplicationInput,
  finishApplicationAnswer,
} from "./applicationInput";
import { suggestionAction } from "./suggestionSchema";
import { manageApplicationSuggestions, applicationSuggestionsResult } from "./suggestions";
import { applicationAnswerContext } from "./applicationAnswerContext";
import { parseApplicationSimulation } from "./types";
function fixture() {
  const s = createSimulationSession({
    roleName: "Example engineer",
    roleRef: "job:synthetic",
    documentId: "resume",
    documentName: "Original",
  });
  s.analysisStatus = "completed";
  s.preparation = createPreparation();
  s.activity = { version: 1, offerId: 1, outputs: {}, batches: [] };
  s.actions = [
    suggestionAction(
      {
        kind: "change",
        title: "Clarify ownership",
        reason: "Role needs API ownership",
        edits: [
          {
            target: "Experience",
            originalText: "Built APIs",
            suggestedText: "Owned internal API delivery",
          },
        ],
      },
      "C"
    ),
    suggestionAction(
      {
        kind: "question",
        title: "Which evaluation did you run?",
        reason: "Relevant experience is unknown",
      },
      "Q"
    ),
    suggestionAction(
      {
        kind: "material",
        title: "Use this short answer",
        reason: "Application asks why this role",
        applicationField: "Why this role?",
        draftText: "I would bring my API delivery experience.",
      },
      "M"
    ),
  ];
  return askApplicationInput(
    s,
    {
      purpose: "suggestions",
      items: s.actions.map((a) => ({ actionId: a.id })),
    },
    "initial"
  );
}
test("follow-up batches allow ten presented suggestions while resolving prior items", () => {
  const session = fixture();
  const result = manageApplicationSuggestions(
    session,
    {
      changes: [
        { id: "Q", decision: "ignore" },
        ...Array.from({ length: 10 }, (_, index) => ({
          decision: "ask",
          suggestion:
            index < 3
              ? {
                  kind: "question",
                  title: `Missing fact ${index + 1}?`,
                  reason: "Required by the application.",
                }
              : {
                  kind: "change",
                  title: `Clarify experience ${index + 1}`,
                  reason: "Relevant to the role.",
                  edits: [
                    {
                      target: "Experience",
                      originalText: "Built APIs",
                      suggestedText: "Owned internal APIs",
                    },
                  ],
                },
        })),
      ],
    },
    "follow-up",
    10
  );
  assert.equal(result.activity?.batches.at(-1)?.itemIds.length, 10);
  assert.equal(result.actions.find((a) => a.id === "Q")?.status, "skipped");
});

test("follow-up type limits include existing suggestions and reject the whole mutation", () => {
  for (const [kind, existingId, additional, expected] of [
    ["question", "Q", 3, /at most 3 questions/],
    ["change", "C", 7, /at most 7 resume changes/],
  ] as const) {
    const session = fixture(),
      before = structuredClone(session);
    assert.throws(
      () =>
        manageApplicationSuggestions(
          session,
          {
            changes: [
              { id: "M", decision: "ignore" },
              { id: existingId, decision: "ask" },
              ...Array.from({ length: additional }, () => ({
                decision: "ask",
                suggestion: {
                  kind,
                  title: "A useful suggestion",
                  reason: "Relevant to the role.",
                  ...(kind === "change"
                    ? {
                        edits: [
                          {
                            target: "Experience",
                            originalText: "Built APIs",
                            suggestedText: "Owned internal APIs",
                          },
                        ],
                      }
                    : {}),
                },
              })),
            ],
          },
          "too-many-by-type",
          10
        ),
      expected
    );
    assert.deepEqual(session, before);
  }
});

test("an oversized follow-up is rejected atomically", () => {
  const session = fixture();
  const before = structuredClone(session);
  assert.throws(
    () =>
      manageApplicationSuggestions(
        session,
        {
          changes: [
            { id: "C", decision: "ignore" },
            ...Array.from({ length: 11 }, (_, index) => ({
              decision: "ask",
              suggestion: {
                kind: "question",
                title: `Missing fact ${index + 1}?`,
                reason: "Required by the application.",
              },
            })),
          ],
        },
        "oversized",
        10
      ),
    /at most 10/
  );
  assert.deepEqual(session, before);
});
test("buttons settle deterministically; inline text and immutable shown text both survive persistence", () => {
  let s = fixture();
  s = finishApplicationAnswer(
    mutateSimulationSession(
      s,
      {
        action: "respond",
        actionId: "C",
        response: {
          decision: "accept",
          edits: [
            {
              target: "Experience",
              originalText: "Built APIs",
              suggestedText: "Built and maintained internal APIs",
            },
          ],
        },
      },
      10
    )
  );
  s = finishApplicationAnswer(
    mutateSimulationSession(
      s,
      {
        action: "respond",
        actionId: "Q",
        response: {
          decision: "answer",
          text: "I built a small retrieval evaluation, not training.",
        },
      },
      10
    )
  );
  s = finishApplicationAnswer(
    mutateSimulationSession(
      s,
      { action: "respond", actionId: "M", response: { decision: "ignore" } },
      10
    )
  );
  const context = simulationSessionContext(s);
  assert.equal(context.questionBatches[0].questions[0].editsShown, undefined);
  assert.equal(
    context.questionBatches[0].questions[0].response.edits![0].suggestedText,
    "Built and maintained internal APIs"
  );
  assert.equal(
    context.questionBatches[0].questions[1].question,
    "Which evaluation did you run?"
  );
  assert.equal(
    context.actions[0].edits![0].suggestedText,
    "Built and maintained internal APIs"
  );
  assert.equal(s.actions[0].status, "completed");
  assert.equal(s.actions[2].status, "skipped");
  assert.equal(s.actions[1].status, "pending");
  assert.equal(s.preparation!.showInputs, false);
  const restored = parseSimulationSession(JSON.parse(JSON.stringify(s)))!;
  assert.equal(
    restored.actions[0].edits![0].suggestedText,
    "Built and maintained internal APIs"
  );
  assert.equal(
    applicationAnswerContext(restored)[0].questions[0].editsShown![0]
      .suggestedText,
    "Owned internal API delivery"
  );
  assert.equal(
    applicationAnswerContext(restored)[0].questions[0].response.edits![0]
      .suggestedText,
    "Built and maintained internal APIs"
  );
});
test("free requested rewrite can settle without another question; new content can be presented", () => {
  let s = fixture();
  for (const id of ["C", "Q", "M"])
    s = finishApplicationAnswer(
      mutateSimulationSession(
        s,
        { action: "respond", actionId: id, response: { decision: "skip" } },
        10
      )
    );
  s = manageApplicationSuggestions(
    s,
    {
      changes: [
        {
          id: "C",
          suggestion: {
            kind: "change",
            title: "Clarify API work",
            reason: "User requested this wording",
            edits: [
              {
                target: "Experience",
                originalText: "Built APIs",
                suggestedText: "Implemented internal APIs with the team",
              },
            ],
          },
          decision: "accept",
        },
        { id: "M", decision: "ignore" },
        { id: "Q", decision: "ignore" },
      ],
    },
    "resolve",
    11
  );
  assert.equal(s.activity!.batches.length, 1);
  assert.equal(s.actions[0].status, "completed");
  s = manageApplicationSuggestions(
    s,
    {
      changes: [
        {
          suggestion: {
            kind: "change",
            title: "Add evaluation work",
            reason: "Newly confirmed relevant work",
            edits: [
              {
                target: "Projects",
                originalText: "",
                suggestedText: "Built retrieval evaluation",
              },
            ],
          },
          decision: "ask",
        },
      ],
    },
    "followup",
    12
  );
  assert.equal(s.activity!.batches.length, 2);
  assert.equal(s.preparation!.showInputs, true);
  assert.deepEqual(
    manageApplicationSuggestions(s, { changes: [] }, "followup", 12),
    s
  );
});
test("edited responses cannot change source targets or smuggle accept into a question", () => {
  const s = fixture();
  assert.throws(() =>
    mutateSimulationSession(
      s,
      {
        action: "respond",
        actionId: "C",
        response: {
          decision: "accept",
          edits: [
            {
              target: "Different section",
              originalText: "Built APIs",
              suggestedText: "Changed",
            },
          ],
        },
      },
      1
    )
  );
  assert.throws(() =>
    mutateSimulationSession(
      s,
      { action: "respond", actionId: "Q", response: { decision: "accept" } },
      1
    )
  );
  assert.throws(() =>
    manageApplicationSuggestions(
      s,
      { changes: [{ id: "unknown", decision: "ignore" }] },
      "bad",
      1
    )
  );
});
test("material drafts accept exact inline edits and v6 progress restores with structural validation", () => {
  let s = fixture();
  s = finishApplicationAnswer(
    mutateSimulationSession(
      s,
      {
        action: "respond",
        actionId: "M",
        response: {
          decision: "accept",
          draftText: "I bring API delivery experience.",
        },
      },
      1
    )
  );
  assert.equal(s.actions[2].draftText, "I bring API delivery experience.");
  const state = {
    version: 6,
    status: "completed",
    progress: "suggestions",
    roleName: "Role",
    documentName: "CV",
    updatedAt: new Date().toISOString(),
    steps: [
      {
        key: "review",
        status: "completed",
        result: { summary: "Done", report: "" },
      },
    ],
    suggestions: [],
  };
  assert.ok(parseApplicationSimulation(state));
  assert.equal(
    parseApplicationSimulation({
      ...state,
      suggestions: [{ kind: "material", title: "X", reason: "Y" }],
    }),
    undefined
  );
});

test("submitted button decisions are protected in continuation while free answers and later edits remain editable", () => {
  let s = fixture();
  for (const [id, decision] of [
    ["C", "accept"],
    ["Q", "answer"],
    ["M", "ignore"],
  ] as const) {
    s = finishApplicationAnswer(
      mutateSimulationSession(
        s,
        {
          action: "respond",
          actionId: id,
          response: {
            decision,
            ...(decision === "answer"
              ? { text: "I compared search results" }
              : {}),
          },
        },
        10
      )
    );
  }
  const batchId = s.activity!.batches[0].id;
  const original = structuredClone(s);
  for (const change of [
    { id: "C", decision: "ignore" },
    { id: "M", decision: "accept" },
    {
      id: "C",
      decision: "accept",
      suggestion: {
        kind: "change",
        title: "Reword",
        reason: "Reword",
        edits: [
          {
            target: "Experience",
            originalText: "Built APIs",
            suggestedText: "Another wording",
          },
        ],
      },
    },
  ]) {
    assert.throws(
      () =>
        manageApplicationSuggestions(
          s,
          { changes: [change] },
          "protected",
          11,
          batchId
        ),
      /already final/
    );
    assert.deepEqual(s, original);
  }
  const repeated = manageApplicationSuggestions(
    s,
    {
      changes: [
        { id: "C", decision: "accept" },
        { id: "M", decision: "ignore" },
      ],
    },
    "noop",
    11,
    batchId
  );
  assert.equal(
    repeated.preparation!.inputRevision,
    s.preparation!.inputRevision
  );
  const resolved = manageApplicationSuggestions(
    s,
    { changes: [{ id: "Q", decision: "ignore" }] },
    "free",
    11,
    batchId
  );
  assert.equal(resolved.actions.find((a) => a.id === "Q")!.status, "skipped");
  const later = manageApplicationSuggestions(
    resolved,
    { changes: [{ id: "C", decision: "ignore" }] },
    "later-request",
    12
  );
  assert.equal(later.actions.find((a) => a.id === "C")!.status, "skipped");
});

test("suggestion delivery retains changed and pending items without settled history", () => {
  const before = fixture();
  before.actions[0].status = "completed";
  const after = structuredClone(before);
  after.actions[2].status = "skipped";
  const result = applicationSuggestionsResult(after, before);
  const model = JSON.parse(result.modelOutput);
  assert.deepEqual(model.suggestions.map((item: {id: string}) => item.id), ["Q", "M"]);
  assert.equal(result.suggestions, after.actions);
  assert.equal(model.assistantInstruction, result.assistantInstruction);
  assert.deepEqual(JSON.parse(applicationSuggestionsResult(after, after).modelOutput).suggestions.map((item: {id: string}) => item.id), ["Q"]);
});
