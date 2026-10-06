import test from "node:test";
import assert from "node:assert/strict";
import { isStructuredStage, validReferences } from "./structured";
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

test("invalid importance, mismatched IDs, evidence conflicts and action overflow are rejected", () => {
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
  assert.equal(isStructuredStage(review, "review"), false);
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
