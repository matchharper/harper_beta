import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { externalScoringInput } from "./workerInputText";
import { buildScoringInput } from "./scoringInput";
import { buildDecisionRequest } from "./decisions";
import oldQuestions from "./fitQuestions.v3.json";
import rubric from "./fitQuestions.v4.json";
import { descriptionText } from "./descriptionText";

test("V2 keeps Worker formatting for supplied facts, booleans, zero and timestamps", () => {
  const payload = {
    user_context: { profile: { profile: { headline: "Engineer" }, experiences: [
      { role: "Lead", start_date: "2020-01", end_date: "2024-12", description: "Line one\nLine two" },
      { role: "IC", start: "2018", end: "2019" },
    ] } },
    candidate_context: { roles: [{ id: "role-1", active: false, score: 0, timestamp: "2026-10-17T23:15:12Z", local: "2026-10-17T23:15:12" }] },
  };
  const expected = execFileSync("python3", ["-c", "import sys,json;sys.path.insert(0,'../harper_worker');from opp.matching.text import external_scoring_input;sys.stdout.write(external_scoring_input(json.load(sys.stdin)))"], { input: JSON.stringify(payload), encoding: "utf8" });
  assert.equal(externalScoringInput(payload), expected);
});

test("empty nested fields vanish while actual statements, false and zero survive", () => {
  const text = externalScoringInput({ user_context: {
    profile: { experiences: [{ role: "Lead", start_date: "2020", end_date: null, memo: null }], educations: [],
      extras: [{ id: "private-extra-id", title: "Award", memo: "" }] },
    search_brief: [{ ref: 91, label: "이직 적극도", content: "현재 이직 기회를 적극적으로 찾고 있습니다." },
      { ref: 98, label: "새로운 자유 주제", content: "미제공이라고 말한 조건은 아직 미정" }],
    behavior_version: 47, behavior_context: null,
  }, company: { companyLeadership: [], nested: { a: null, b: [undefined, {}, "   "] }, active: false, count: 0 } });
  assert.ok(text.includes("1. 이직 적극도 : 현재 이직 기회를 적극적으로 찾고 있습니다."));
  assert.ok(text.includes("2. 새로운 자유 주제 : 미제공이라고 말한 조건은 아직 미정"));
  assert.ok(text.includes("시작: 2020"));
  assert.ok(text.includes("Award"));
  assert.ok(text.includes("- active: false"));
  assert.ok(text.includes("- count: 0"));
  for (const absent of ["- memo:", "- ref:", "behavior_version", "private-extra-id", "companyLeadership", "nested:", "(항목 없음)", "(빈 값)", "→ 미제공", "#### 학력"])
    assert.ok(!text.includes(absent), absent);
});

test("HTML loses attributes and tags while duties, lists, table columns and links remain legible", () => {
  const html = '<h2 class="job-title">Requirements</h2><p data-id="tracking">C++ &amp; Rust; experience &lt; 5 years</p>' +
    '<ul><li>Build <strong>APIs</strong></li><li>Deploy<br>on call</li></ul>' +
    '<table><tr><th>Location</th><th>Pay</th></tr><tr><td>Seoul</td><td>$100k</td></tr></table>' +
    '<p>See <a href="https://example.com/terms">terms</a>. <del>Remote only</del></p>' +
    '<style>.job-title{color:red}</style><script>tracking()</script>';
  const text = descriptionText(html);
  for (const fact of ["Requirements", "C++ & Rust; experience < 5 years", "Build APIs", "Deploy", "on call", "| Location | Pay |", "| Seoul | $100k |", "https://example.com/terms", "~~Remote only~~"])
    assert.ok(text.includes(fact), fact);
  assert.match(text, /- +Build APIs\n- +Deploy/);
  for (const absent of ["<p", "data-id", "tracking", "color:red", "<strong>"]) assert.ok(!text.includes(absent));
  const plain = 'Experience < 5 years\nList<T>\n- Rust & C++';
  assert.equal(descriptionText(plain), plain);
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
  assert.ok(!text.includes("companyKey"));
});

test("same-name companies stay separate without exposing their grouping IDs", () => {
  const candidate = { companyName: "Same name", company: {}, employmentType: null, location: null,
    postedAt: null, seniorityLevel: null, workMode: null, roleName: "Engineer", roleDescription: "<p>Build</p><p>Ship</p>" };
  const text = buildScoringInput({}, [
    { ...candidate, companyKey: "workspace-a", roleId: "r1", company: { description: "First company" } },
    { ...candidate, companyKey: "workspace-b", roleId: "r2", company: { description: "Second company" } },
  ]);
  for (const fact of ["First company", "Second company", "role_id: r1", "role_id: r2", "Build", "Ship"]) assert.ok(text.includes(fact));
  for (const absent of ["workspace-a", "workspace-b", "<p>", "## user_context", "employment:", "companyData:"]) assert.ok(!text.includes(absent));
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
