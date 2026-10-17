import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { externalScoringInput } from "./workerInputText";
import { buildScoringInput } from "./scoringInput";
import { buildDecisionRequest } from "./decisions";
import oldQuestions from "./fitQuestions.v3.json";
import rubric from "./fitQuestions.v4.json";

test("Python Worker and TypeScript preserve identical evidence, dates, missing values and multiline facts", () => {
  const payload = {
    user_context: { profile: { profile: { headline: "Engineer" }, experiences: [
      { role: "Lead", start_date: "2020-01", end_date: null, description: "Line one\nLine two" },
      { role: "IC", start: "2018", end: "2019", note: "" },
    ], educations: [] }, search_brief: [{ ref: 1, content: "한국 원격만" }], behavior_context: null },
    candidate_context: { roles: [{ id: "role-1", active: false, score: 0, timestamp: "2026-10-17T23:15:12Z", local: "2026-10-17T23:15:12", facts: {} }] },
  };
  const expected = execFileSync("python3", ["-c", "import sys,json;sys.path.insert(0,'../harper_worker');from opp.matching.text import external_scoring_input;sys.stdout.write(external_scoring_input(json.load(sys.stdin)))"], { input: JSON.stringify(payload), encoding: "utf8" });
  assert.equal(externalScoringInput(payload), expected);
});

test("common instructions move once; every original metric instruction and criterion is preserved verbatim", () => {
  for (const metric of Object.keys(oldQuestions) as Array<keyof typeof oldQuestions>) {
    assert.equal(rubric.commonInstructions + rubric.questions[metric].instructions, oldQuestions[metric].instructions);
    assert.deepEqual(rubric.questions[metric].criteria, oldQuestions[metric].criteria);
    assert.equal(rubric.questions[metric].type, oldQuestions[metric].type);
  }
  const ids = ["role-1", "role-2", "role-3"];
  for (const provider of ["openai", "jev"] as const) {
    const request = buildDecisionRequest(provider, "Verified source facts", ids);
    const serialized = JSON.stringify(request);
    assert.equal(serialized.split(JSON.stringify(rubric.commonInstructions).slice(1, -1)).length - 1, 1);
    assert.equal(Object.keys(request.questions).length, 18);
  }
});

test("company is printed once and complete JD, salary, leadership and candidate facts survive", () => {
  const common = { companyKey: "company-1", companyName: "Example", company: { description: "Company facts" }, companyLeadership: ["Founder history"], companyData: { mainInvestors: "Investor evidence" }, employmentType: "full_time", location: "Seoul", postedAt: null, seniorityLevel: "senior", workMode: "remote", salaryRange: "KRW 200 million" };
  const text = buildScoringInput({ search_brief: [{ content: "Every brief fact" }] }, [
    { ...common, roleId: "r1", roleName: "First", roleDescription: "a".repeat(7000) + "Final important condition" },
    { ...common, roleId: "r2", roleName: "Second", roleDescription: "Distinct duties" },
  ]);
  for (const fact of ["Every brief fact", "Company facts", "Founder history", "Investor evidence", "Final important condition", "Distinct duties", "KRW 200 million", "r1", "r2"]) assert.ok(text.includes(fact));
  assert.equal(text.split("Company facts").length - 1, 1);
});


test("each complete metric rubric occurs once in shared input; per-role questions keep only bindings and native answer structure", () => {
  for (const provider of ["openai", "jev"] as const) {
    const request = buildDecisionRequest(provider, "Source evidence", ["role-1", "role-2", "role-3"]);
    const input = request.input?.map(message => message.content).join("\n\n") ?? request.state!.evidence;
    const serializedQuestions = JSON.stringify(request.questions);
    for (const [metric, q] of Object.entries(rubric.questions)) {
      assert.equal(input.split(q.instructions).length - 1, 1);
      for (const criterion of Object.values(q.criteria)) {
        assert.equal(input.split(criterion).length - 1, 1);
        assert.ok(!serializedQuestions.includes(JSON.stringify(criterion).slice(1, -1)));
      }
      assert.ok(!serializedQuestions.includes(JSON.stringify(q.instructions).slice(1, -1)));
      for (let i = 0; i < 3; i++) {
        const item = Array.isArray(request.questions)
          ? request.questions.find(q => q.name === `r${i}_${metric}`)!
          : request.questions[`r${i}_${metric}`];
        assert.ok(item.instructions.includes(`role_id role-${i + 1}`));
        assert.ok(item.instructions.includes(`Rubric ${metric}`));
      }
    }
    if (Array.isArray(request.questions)) {
      const score = request.questions.find(q => q.type === "score")!;
      assert.deepEqual(score.levels, [0, 1, 2, 3, 4].map(i => ({ label: String(i) })));
      const choice = request.questions.find(q => q.type === "choice")!;
      assert.deepEqual(choice.choices, Object.keys(rubric.questions.evidence.criteria).map(value => ({ value })));
    }
  }
});
