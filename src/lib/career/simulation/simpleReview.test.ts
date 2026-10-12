import test from "node:test";
import assert from "node:assert/strict";
import { simpleReviewSchema, normalizeSimpleReview } from "./simpleReview";
import { runSimulationWorkflow } from "./workflow";
import { parseApplicationSimulation } from "./types";
import {
  createSimulationSession,
  finishSimulationAnalysis,
  mutateSimulationSession,
} from "./session";
import {
  askApplicationInput,
  applicationQuestionItems,
  finishApplicationAnswer,
} from "./applicationInput";
const role = {
  summary: "Role",
  report: "JD",
  data: {
    kind: "role",
    requirements: [
      {
        id: "R1",
        requirement: "Build products",
        importance: 3,
        mandatory: false,
        rationale: "Core work",
        source: "JD",
        evidenceNeeded: "Product work",
      },
    ],
  },
};
const action = {
  category: "content",
  title: "제품 개발 경험 강조하기",
  target: "North / South",
  proposal: "두 경험의 제품 구현 기여를 앞세웁니다.",
  originalText: "",
  suggestedText: "",
  edits: [
    {
      target: "North",
      originalText: "Built an API.",
      suggestedText: "Built the product API.",
    },
    {
      target: "South",
      originalText: "Built a UI.",
      suggestedText: "Built the product UI.",
    },
  ],
  reason: "Product ownership matters.",
  needsConfirmation: false,
  questions: [],
  inputKind: "change",
  options: [],
};
const question = {
  ...action,
  title: "직접 배포도 맡았나요?",
  inputKind: "question",
  needsConfirmation: true,
  edits: [],
  questions: ["직접 배포도 맡았나요?"],
  options: [{ label: "직접 배포했어요" }, { label: "개발만 맡았어요" }],
};
const review = {
  summary: "Improve the product story",
  report: "Use the supported experience",
  data: {
    kind: "review",
    comparison: {
      kind: "comparison",
      diagnoses: [
        {
          requirementId: "R1",
          match: "met",
          rationale: "Both experiences show product development.",
          presentation: "weak",
          target: "North / South",
        },
      ],
    },
    fitVerdict: {
      level: "moderate",
      reason: "Relevant development experience",
    },
    actions: [action, question],
    emptyReason: "",
  },
};

test("simplified output removes the model evidence registry and action reference graph", () => {
  const schema = simpleReviewSchema();
  const validateSchema = (node: typeof schema) => {
    if (node.required)
      assert.deepEqual([...new Set(node.required)], node.required);
    for (const child of Object.values(node.properties ?? {}))
      validateSchema(child);
    if (node.items) validateSchema(node.items);
  };
  validateSchema(schema);
  const d = schema.properties!.data;
  assert.equal(d.properties!.actionCoverage, undefined);
  const a = d.properties!.actions.items!.properties!;
  for (const k of ["id", "evidenceIds", "requirementIds", "linkedActionIds"])
    assert.equal(a[k], undefined);
  assert.equal(
    d.properties!.comparison.properties!.diagnoses.items!.properties!.evidence,
    undefined
  );
  assert.equal(a.options.maxItems, 2);
  assert.equal(a.questions, undefined);
  assert.equal(a.executionPrompt, undefined);
  assert.equal(simpleReviewSchema().properties!.report, undefined);
});

test("analysis through question submission preserves paired edits, options and exact free text without ID validation retries", async () => {
  let calls = 0;
  const result = await runSimulationWorkflow({
    state: {
      version: 5,
      status: "running",
      roleName: "Product engineer",
      documentName: "cv",
      updatedAt: new Date().toISOString(),
      steps: [
        { key: "role", status: "pending" },
        { key: "review", status: "pending" },
      ],
    },
    input: {
      role: "JD",
      candidate: "Profile",
      resume: "Built an API.\nBuilt a UI.",
      language: "ko",
    },
    publish: async () => {},
    complete: async ({ key }) => {
      calls++;
      return JSON.stringify(key === "role" ? role : review);
    },
  });
  assert.equal(result.status, "completed");
  assert.equal(calls, 2);
  assert.deepEqual(parseApplicationSimulation(result), result);
  const s = createSimulationSession({
    roleRef: "job:example",
    roleName: "Product engineer",
    documentId: "cv",
    documentName: "cv",
  });
  s.activity = { version: 1, offerId: 1, outputs: {}, batches: [] };
  const analyzed = finishSimulationAnalysis(s, result, 10);
  const asked = askApplicationInput(
    analyzed,
    {
      purpose: "Prepare resume",
      items: [{ actionId: "A1" }, { actionId: "A2" }],
    },
    "question-batch"
  );
  assert.equal(applicationQuestionItems(asked)[0].edits?.length, 2);
  assert.equal(applicationQuestionItems(asked)[1].inputKind, "choice");
  let answered = mutateSimulationSession(
    asked,
    {
      action: "respond",
      actionId: "A2",
      response: { decision: "answer", optionId: "option-1" },
    },
    11
  );
  assert.equal(answered.preparation?.responses.A2.text, "직접 배포했어요");
  answered = mutateSimulationSession(
    answered,
    {
      action: "respond",
      actionId: "A2",
      response: {
        decision: "answer",
        text: "함께 배포했지만 담당자는 따로 있었어요.",
      },
    },
    12
  );
  assert.equal(
    answered.preparation?.responses.A2.text,
    "함께 배포했지만 담당자는 따로 있었어요."
  );
  answered = finishApplicationAnswer(
    mutateSimulationSession(
      answered,
      { action: "respond", actionId: "A1", response: { decision: "accept" } },
      13
    )
  );
  assert.equal(answered.activity?.batches[0].status, "submitted");
  assert.equal(
    answered.activity?.batches[0].responses.A2.text,
    "함께 배포했지만 담당자는 따로 있었어요."
  );
  assert.equal(
    (normalizeSimpleReview(review) as typeof review).data.actions.length,
    2
  );
});

 test("open-ended writing questions need no forced answer options", async () => {
  const {simpleReviewDecisionIssues}=await import("./simpleReview");
  const data={kind:"review",actions:[{inputKind:"question",title:"What would you like to highlight?",options:[]}]};
  assert.deepEqual(simpleReviewDecisionIssues(data as any),[]);
  data.actions[0].options=[{label:"Only one"}] as any;
  assert.equal(simpleReviewDecisionIssues(data as any).length,1);
 });
