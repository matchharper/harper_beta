import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateFitEvidence,
  stageOutputIssues,
  isStructuredStage,
  validReferences,
  type StructuredResult,
} from "./structured";
import {
  parseApplicationSimulation,
  SIMULATION_STEPS,
  type ApplicationSimulation,
} from "./types";
import { runSimulationWorkflow } from "./workflow";

export const roleResult = {
  summary: "Role",
  report: "Source limitations",
  data: {
    kind: "role",
    requirements: [
      {
        id: "R1",
        requirement: "Customer onboarding",
        importance: 3,
        mandatory: false,
        rationale: "Strong preference",
        source: "JD: customer onboarding preferred",
        evidenceNeeded: "Personally delivered onboarding",
      },
    ],
  },
};
export const comparisonResult = {
  summary: "Experience is in profile only",
  report: "No documented revenue metrics",
  data: {
    kind: "comparison",
    diagnoses: [
      {
        requirementId: "R1",
        match: "met",
        evidence: [
          {
            id: "E1",
            source: "profile",
            location: "A company memo",
            quote: "Onboarded three customers",
          },
        ],
        rationale: "Direct delivery evidence",
        presentation: "absent",
        questions: [] as string[],
        target: "A company experience",
      },
    ],
    observations: [],
  },
};
export const reviewResult = {
  summary: "Highlight delivery",
  report: "The profile supports onboarding, not revenue ownership.",
  data: {
    kind: "review",
    actionCoverage: [
      {
        requirementId: "R1",
        actionIds: ["A1"],
        disposition: "action",
        reason: "Confirmed in profile but missing in resume.",
      },
    ],
    fitVerdict: {
      level: "moderate",
      reason: "Relevant delivery evidence; scope remains uncertain.",
    },
    actions: [
      {
        id: "A1",
        category: "content",
        title: "Add customer onboarding",
        target: "A company experience",
        proposal: "Describe onboarding three customers",
        reason: "Demonstrates R1",
        requirementIds: ["R1"],
        evidenceIds: ["E1"],
        needsConfirmation: false,
        questions: [] as string[],
        executionPrompt: "INTERNAL_EXECUTION_REQUEST do not invent revenue",
      },
    ],
    emptyReason: "",
  },
};
const initial = (): ApplicationSimulation => ({
  version: 2,
  status: "running",
  roleName: "Customer engineer",
  documentName: "resume.pdf",
  updatedAt: new Date().toISOString(),
  steps: SIMULATION_STEPS.map((key) => ({ key, status: "pending" })),
});
const fixtures = {
  role: roleResult,
  comparison: comparisonResult,
  review: reviewResult,
};

test("v2 freezes role data, retains evidence and actions through progress and reload", async () => {
  const inputs: Record<string, Record<string, unknown>> = {};
  const updates: ApplicationSimulation[] = [];
  const final = await runSimulationWorkflow({
    state: initial(),
    input: {
      role: "JD",
      resume: "Resume",
      candidate: "Profile",
      language: "English",
    },
    complete: async ({ key, input }) => {
      inputs[key] = JSON.parse(input);
      return JSON.stringify(fixtures[key]);
    },
    publish: async (s) => {
      updates.push(s);
    },
  });
  assert.equal(final.status, "completed");
  assert.deepEqual(Object.keys(inputs.role).sort(), ["language", "role"]);
  assert.deepEqual(inputs.comparison.rubric, roleResult);
  assert.deepEqual(inputs.review.comparison, comparisonResult);
  assert.equal(inputs.review.resume, "Resume");
  assert.deepEqual(
    parseApplicationSimulation(JSON.parse(JSON.stringify(final))),
    final
  );
  assert.equal(updates[3].steps[2].result, undefined);
  assert.deepEqual(final.steps[2].result, reviewResult);
});

test("invalid importance, mismatched IDs and evidence conflicts are rejected; important actions may exceed ten", () => {
  const invalid = structuredClone(roleResult);
  invalid.data.requirements[0].importance = 4;
  assert.equal(isStructuredStage(invalid, "role"), false);
  const wrong = structuredClone(comparisonResult);
  wrong.data.diagnoses[0].requirementId = "R404";
  assert.ok(isStructuredStage(wrong, "comparison"));
  assert.equal(validReferences(wrong.data, [roleResult as never]), false);
  const review = structuredClone(reviewResult);
  review.data.actions[0].evidenceIds = ["E404"];
  assert.ok(isStructuredStage(review, "review"));
  assert.equal(
    validReferences(review.data, [
      roleResult as never,
      comparisonResult as never,
    ]),
    false
  );
  review.data.actions = Array.from({ length: 11 }, (_, i) => ({
    ...review.data.actions[0],
    id: `A${i}`,
  }));
  assert.equal(isStructuredStage(review, "review"), true);
  const evidenceConflict = structuredClone(comparisonResult);
  evidenceConflict.data.diagnoses[0].evidence.push({
    ...evidenceConflict.data.diagnoses[0].evidence[0],
    quote: "Different fact",
  });
  assert.equal(isStructuredStage(evidenceConflict, "comparison"), false);
});

test("unknown is distinct from unmet; confirmation actions require a concrete question; zero actions require an explanation", () => {
  const comparison = structuredClone(comparisonResult);
  comparison.data.diagnoses[0].match = "unknown";
  comparison.data.diagnoses[0].evidence = [];
  assert.equal(isStructuredStage(comparison, "comparison"), true);
  comparison.data.diagnoses[0].match = "unmet";
  assert.equal(isStructuredStage(comparison, "comparison"), false);
  const review = structuredClone(reviewResult);
  review.data.actions[0].needsConfirmation = true;
  assert.equal(isStructuredStage(review, "review"), false);
  review.data.actions[0].questions = [
    "Did you personally lead the onboarding?",
  ];
  assert.equal(isStructuredStage(review, "review"), true);
  review.data.actions = [];
  assert.equal(isStructuredStage(review, "review"), false);
  review.data.emptyReason = "The resume already conveys the relevant evidence.";
  assert.equal(isStructuredStage(review, "review"), true);
});

test("failed review preserves diagnostics and never exposes partial actions", async () => {
  const final = await runSimulationWorkflow({
    state: initial(),
    input: {
      role: "JD",
      candidate: "Profile",
      resume: "Resume",
      language: "English",
    },
    complete: async ({ key }) =>
      key === "review"
        ? '{"summary":"partial"}'
        : JSON.stringify(fixtures[key]),
    publish: async () => {},
  });
  assert.equal(final.status, "failed");
  assert.equal(final.steps[1].status, "completed");
  assert.equal(final.steps[2].result, undefined);
  assert.ok(parseApplicationSimulation(final));
});

test("actions can cite a verified document-wide observation", () => {
  const c = structuredClone(comparisonResult) as unknown as {
    data: import("./structured").StructuredResult;
  };
  if (c.data.kind !== "comparison") throw Error("fixture");
  c.data.observations.push({
    id: "O1",
    target: "Sections",
    finding: "Relevant experience is buried",
    evidence: [],
  });
  const r = structuredClone(reviewResult);
  r.data.actions[0].evidenceIds = ["O1"];
  assert.ok(isStructuredStage(r, "review"));
  assert.equal(validReferences(r.data, [roleResult as never, c]), true);
});

test("evidence equality does not depend on JSON property order", () => {
  const value = structuredClone(comparisonResult);
  value.data.diagnoses[0].evidence.push({
    quote: "Onboarded three customers",
    location: "A company memo",
    source: "profile",
    id: "E1",
  });
  assert.equal(isStructuredStage(value, "comparison"), true);
});

test("repairs only the invalid stage once with original sources and precise feedback", async () => {
  const calls: string[] = [];
  const bad = structuredClone(comparisonResult);
  bad.data.diagnoses[0].evidence.push({
    id: "E1",
    source: "profile",
    location: "Another location",
    quote: "A different fact",
  });
  const final = await runSimulationWorkflow({
    state: initial(),
    input: {
      role: "JD",
      candidate: "Profile",
      resume: "Resume",
      language: "English",
    },
    complete: async ({ key, input }) => {
      calls.push(key);
      if (
        key === "comparison" &&
        calls.filter((k) => k === "comparison").length === 1
      )
        return JSON.stringify(bad);
      if (key === "comparison") {
        const parsed = JSON.parse(input);
        assert.match(parsed.repair.issues.join(" "), /reused/);
        assert.equal(parsed.resume, "Resume");
        assert.deepEqual(parsed.rubric, roleResult);
      }
      return JSON.stringify(fixtures[key]);
    },
    publish: async () => {},
  });
  assert.equal(final.status, "completed");
  assert.deepEqual(calls, ["role", "comparison", "comparison", "review"]);
  assert.equal(final.steps[1].attempts, 2);
  assert.deepEqual(final.steps[1].result, comparisonResult);
});

test("missing requirement is retried but never silently omitted", async () => {
  const calls: string[] = [];
  const bad = structuredClone(comparisonResult);
  bad.data.diagnoses = [];
  const final = await runSimulationWorkflow({
    state: initial(),
    input: {
      role: "JD",
      candidate: "Profile",
      resume: "Resume",
      language: "English",
    },
    complete: async ({ key }) => {
      calls.push(key);
      return JSON.stringify(key === "comparison" ? bad : fixtures[key]);
    },
    publish: async () => {},
  });
  assert.equal(final.status, "failed");
  assert.deepEqual(calls, ["role", "comparison", "comparison"]);
  assert.equal(final.steps[1].result, undefined);
  assert.match(
    final.steps[1].validationIssues!.join(" "),
    /exactly one diagnosis for R1/
  );
});

test("cancellation during validation recovery does not make another call", async () => {
  const controller = new AbortController();
  const calls: string[] = [];
  const final = await runSimulationWorkflow({
    state: initial(),
    signal: controller.signal,
    input: {
      role: "JD",
      candidate: "Profile",
      resume: "Resume",
      language: "English",
    },
    complete: async ({ key }) => {
      calls.push(key);
      return key === "comparison" ? "{}" : JSON.stringify(fixtures[key]);
    },
    publish: async (s) => {
      if (s.steps[1].validationIssues) controller.abort();
    },
  });
  assert.equal(final.status, "cancelled");
  assert.deepEqual(calls, ["role", "comparison"]);
});

test("comparison generation schema requires the complete frozen rubric", async () => {
  const { simulationSchemaForInput, simulationSchemas } =
    await import("./structured");
  const schema = simulationSchemaForInput("comparison", {
    rubric: roleResult as never,
  });
  const rows = schema.properties!.data.properties!.diagnoses;
  assert.equal(rows.minItems, 1);
  assert.equal(rows.maxItems, 1);
  assert.deepEqual(rows.items!.properties!.requirementId.enum, ["R1"]);
  assert.equal(
    simulationSchemas.comparison.properties!.data.properties!.diagnoses
      .minItems,
    undefined
  );
});

test("resume edit previews require resume evidence and tolerate historical actions", async () => {
  const { resumeEditPreviewIssues } = await import("./structured");
  const value = structuredClone(reviewResult) as {
    summary: string;
    report: string;
    data: Extract<import("./structured").StructuredResult, { kind: "review" }>;
  };
  const action = value.data.actions[0];
  action.originalText = "Built an API.";
  action.suggestedText = "Implemented the API service.";
  assert.ok(isStructuredStage(value, "review"));
  assert.deepEqual(
    resumeEditPreviewIssues(value.data, "Experience\nBuilt an API."),
    []
  );
  assert.equal(
    resumeEditPreviewIssues(value.data, "Unrelated resume").length,
    1
  );
  action.originalText = "";
  assert.deepEqual(resumeEditPreviewIssues(value.data, ""), []);
  action.edits = [
    {
      target: "Acme",
      originalText: "Built an API.",
      suggestedText: "Implemented the API service.",
    },
    {
      target: "Beta",
      originalText: "",
      suggestedText: "Maintained the dashboard.",
    },
  ];
  assert.ok(isStructuredStage(value, "review"));
  assert.deepEqual(resumeEditPreviewIssues(value.data, "Built an API."), []);
  action.edits[1].originalText = "An invented original";
  assert.match(
    resumeEditPreviewIssues(value.data, "Built an API.")[0],
    /edits\[1\]/
  );
});

test("fit verdict validates new generation while legacy review records remain readable", () => {
  for (const level of ["strong", "moderate", "weak", "stretch"]) {
    const review = structuredClone(reviewResult);
    review.data.fitVerdict.level = level;
    assert.equal(isStructuredStage(review, "review"), true);
  }
  const invalid = structuredClone(reviewResult);
  invalid.data.fitVerdict.level = "guaranteed";
  assert.equal(isStructuredStage(invalid, "review"), false);
  invalid.data.fitVerdict = { level: "weak", reason: " " };
  assert.equal(isStructuredStage(invalid, "review"), false);
  const legacyData: Partial<typeof reviewResult.data> = {
    ...reviewResult.data,
  };
  delete legacyData.fitVerdict;
  const legacy = { ...reviewResult, data: legacyData };
  assert.equal(isStructuredStage(legacy, "review"), true);
  assert.ok(
    stageOutputIssues(legacy, "review", [
      roleResult,
      comparisonResult,
    ] as never).some((issue) => issue.includes("fitVerdict"))
  );
});

test("fit totals weight qualifications, preserve unknowns and exclude submission materials", () => {
  const role = {
    kind: "role",
    requirements: [
      { ...roleResult.data.requirements[0], id: "R1", importance: 3 },
      { ...roleResult.data.requirements[0], id: "R2", importance: 2 },
      {
        ...roleResult.data.requirements[0],
        id: "R3",
        importance: 3,
        requirementType: "application_material",
      },
    ],
  } as StructuredResult;
  const comparison = comparisonResult.data as StructuredResult;
  assert.deepEqual(
    aggregateFitEvidence(role, comparison)?.importanceTotalsByMatch,
    {
      strong: 0,
      met: 3,
      partial: 0,
      unknown: 2,
      unmet: 0,
    }
  );
});

test("coverage must account for every requirement and match the actual action links", () => {
  const previous = [roleResult, comparisonResult] as unknown as {
    data: StructuredResult;
  }[];
  const valid = reviewResult.data as StructuredResult;
  assert.equal(validReferences(valid, previous), true);
  for (const actionCoverage of [
    [],
    [
      {
        requirementId: "R1",
        actionIds: ["missing"],
        disposition: "action",
        reason: "Gap",
      },
    ],
    [
      {
        requirementId: "R1",
        actionIds: [],
        disposition: "no_action",
        reason: "Ignoring linked action",
      },
    ],
    [
      {
        requirementId: "R1",
        actionIds: ["A1"],
        disposition: "deferred",
        reason: "Conflicting disposition",
      },
    ],
  ]) {
    assert.equal(
      validReferences(
        { ...reviewResult.data, actionCoverage } as StructuredResult,
        previous
      ),
      false
    );
  }
  const legacy = { ...reviewResult, data: { ...reviewResult.data } };
  delete (legacy.data as Partial<typeof legacy.data>).actionCoverage;
  assert.equal(isStructuredStage(legacy, "review"), true);
  assert.ok(
    stageOutputIssues(legacy, "review", previous).some((i) =>
      i.includes("actionCoverage")
    )
  );
});

test("truncated review is regenerated with attempt metadata and never published as a valid result", async () => {
  const attempts: number[] = [];
  const final = await runSimulationWorkflow({
    state: initial(),
    input: {
      role: "JD",
      candidate: "Profile",
      resume: "Resume",
      language: "Korean",
    },
    complete: async ({ key, attempt, input }) => {
      if (key !== "review") return JSON.stringify(fixtures[key]);
      attempts.push(attempt);
      if (attempt === 1)
        return {
          text: '{"summary":"cut off',
          finishReason: "length",
          completionTokens: 6500,
        };
      const repair = JSON.parse(input).repair;
      assert.equal(repair.invalidOutput, "");
      assert.match(repair.issues[0], /token limit/);
      return {
        text: JSON.stringify(reviewResult),
        finishReason: "stop",
        completionTokens: 8500,
      };
    },
    publish: async () => {},
  });
  assert.deepEqual(attempts, [1, 2]);
  assert.equal(final.status, "completed");
  assert.equal(final.steps[2].completion?.finishReason, "stop");
  assert.equal(final.steps[2].validationIssues, undefined);
});

test("version 4 combines evidence and preparation in two calls and preserves old records", async () => {
  const combined = structuredClone(reviewResult);
  const merged = {
    ...combined,
    data: { ...combined.data, comparison: comparisonResult.data },
  };
  const calls: { key: string; input: string }[] = [];
  const initial: ApplicationSimulation = {
    version: 4,
    status: "running",
    roleName: "Example",
    documentName: "resume.pdf",
    updatedAt: new Date().toISOString(),
    steps: [
      { key: "role", status: "pending" },
      { key: "review", status: "pending" },
    ],
  };
  const final = await runSimulationWorkflow({
    state: initial,
    input: {
      role: "JD",
      candidate: "Profile",
      resume: "Resume",
      language: "ko",
    },
    publish: async () => {},
    complete: async (args) => {
      calls.push(args);
      return JSON.stringify(args.key === "role" ? roleResult : merged);
    },
  });
  assert.equal(final.status, "completed");
  assert.deepEqual(
    calls.map((c) => c.key),
    ["role", "review"]
  );
  assert.deepEqual(JSON.parse(calls[0].input), { language: "ko", role: "JD" });
  assert.equal(JSON.parse(calls[1].input).comparison, undefined);
  assert.equal(JSON.parse(calls[1].input).candidate, "Profile");
  assert.deepEqual(parseApplicationSimulation(final), final);
  const invalid = structuredClone(final);
  invalid.steps[1].result!.data = combined.data as StructuredResult;
  assert.equal(parseApplicationSimulation(invalid), undefined);
  const bad = structuredClone(merged);
  bad.data.comparison.diagnoses[0].requirementId = "missing";
  assert.ok(
    stageOutputIssues(bad, "review", [roleResult as { data: StructuredResult }])
      .length
  );
  const failed = await runSimulationWorkflow({
    state: initial,
    input: {
      role: "JD",
      candidate: "Profile",
      resume: "Resume",
      language: "ko",
    },
    publish: async () => {},
    complete: async ({ key }) =>
      JSON.stringify(key === "role" ? roleResult : bad),
  });
  assert.equal(failed.steps[0].status, "completed");
  assert.equal(failed.steps[1].status, "failed");
});

test("review repair identifies missing coverage, disposition and dangling evidence precisely", () => {
  const previous = [roleResult, comparisonResult] as {
    data: StructuredResult;
  }[];
  const wrong = structuredClone(reviewResult);
  wrong.data.actions[0].evidenceIds = ["E404"];
  wrong.data.actionCoverage[0].disposition = "deferred";
  const issues = stageOutputIssues(wrong, "review", previous);
  assert.ok(
    issues.some(
      (i) =>
        i.includes("data.actions[0].evidenceIds: unknown evidence E404") &&
        i.includes("E1")
    )
  );
  assert.ok(
    issues.some((i) => i.includes("data.actionCoverage[0].disposition"))
  );
  wrong.data.actionCoverage = [];
  assert.ok(
    stageOutputIssues(wrong, "review", previous).some((i) =>
      i.includes("provide exactly one row for R1")
    )
  );
});

test("combined review repairs a broken evidence reference without discarding completed role analysis", async () => {
  const combined = {
    ...structuredClone(reviewResult),
    data: {
      ...structuredClone(reviewResult.data),
      comparison: comparisonResult.data,
    },
  };
  const result = await runSimulationWorkflow({
    state: {
      ...initial(),
      version: 4,
      steps: [
        { key: "role", status: "pending" },
        { key: "review", status: "pending" },
      ],
    },
    input: {
      role: "JD",
      resume: "Resume",
      candidate: "Profile",
      language: "ko",
    },
    publish: async () => {},
    complete: async ({ key, attempt, input }) => {
      if (key === "role") return JSON.stringify(roleResult);
      if (attempt === 1) {
        const bad = structuredClone(combined);
        bad.data.actions[0].evidenceIds = ["E_missing"];
        return JSON.stringify(bad);
      }
      assert.ok(
        JSON.parse(input).repair.issues.some(
          (i: string) =>
            i.includes("unknown evidence E_missing") && i.includes("E1")
        )
      );
      return JSON.stringify(combined);
    },
  });
  assert.equal(result.status, "completed");
  assert.equal(result.steps[0].attempts, 1);
  assert.equal(result.steps[1].attempts, 2);
});

test("review derives reverse links without another model call and preserves no-action judgment", async () => {
  const { deriveActionCoverage, simulationSchemaForInput } =
    await import("./structured");
  const raw = structuredClone(reviewResult);
  raw.data.actionCoverage[0].actionIds = [];
  const normalized = deriveActionCoverage(raw) as typeof raw;
  assert.deepEqual(normalized.data.actionCoverage[0].actionIds, ["A1"]);
  assert.equal(
    normalized.data.actionCoverage[0].reason,
    raw.data.actionCoverage[0].reason
  );
  const final = await runSimulationWorkflow({
    state: initial(),
    input: {
      role: "JD",
      candidate: "Profile",
      resume: "Resume",
      language: "ko",
    },
    publish: async () => {},
    complete: async ({ key }) =>
      JSON.stringify(key === "review" ? raw : fixtures[key]),
  });
  assert.equal(final.status, "completed");
  assert.equal(final.steps[2].attempts, 1);
  const schema = simulationSchemaForInput("review", {
    rubric: roleResult as never,
    workflowVersion: 4,
  });
  const coverage = schema.properties!.data.properties!.actionCoverage;
  assert.equal(coverage.items!.properties!.actionIds, undefined);
  const action = schema.properties!.data.properties!.actions.items!;
  assert.deepEqual(action.properties!.requirementIds.items!.enum, ["R1"]);
  assert.equal(action.properties!.questions.items!.enum, undefined);
  assert.equal(action.properties!.evidenceIds.items!.enum, undefined);
  assert.equal(action.properties!.linkedActionIds.items!.enum, undefined);
  assert.deepEqual(coverage.items!.properties!.requirementId.enum, ["R1"]);
  const noAction = structuredClone(raw);
  noAction.data.actions = [];
  noAction.data.actionCoverage[0].disposition = "deferred";
  assert.equal(
    (deriveActionCoverage(noAction) as typeof raw).data.actionCoverage[0]
      .disposition,
    "deferred"
  );
});
