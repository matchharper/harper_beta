import test from "node:test";
import assert from "node:assert/strict";
import { externalScoringInput } from "./workerInputText";
import { buildScoringInput, v2PromptCandidate } from "./scoringInput";
import { roleCard } from "../talentOnboarding/jobPostingRecommendations";
import { buildDecisionRequest } from "./decisions";
import rubric from "./fitQuestions.v4.json";
import { descriptionText } from "./descriptionText";

test("V2 projects career evidence without DB metadata and preserves source prose and exact references", () => {
  const payload = {
    user_context: { profile: { profile: { headline: "Engineer" }, experiences: [
      { id: "PRIVATE_ROW_ID", talent_id: "PRIVATE_OWNER", role: "Lead", employment_type: "contract", company_location: "London", months: 59, start_date: "2020-01", end_date: "2024-12", description: "Line one\nLine two" },
      { role: "IC", start: "2018", end: "2019" },
    ] } },
    candidate_context: { roles: [{ id: "role-1", active: false, score: 0, observedAt: "2026-10-17T23:15:12Z", description: "2026-10-17T23:15:12", revision: "2026-10-17T23:15:12Z" }] },
  };
  const text = externalScoringInput(payload);
  for (const fact of ["Lead", "contract", "London", "59 months", "2020-01 → 2024-12", "Line one\nLine two", "2018 → 2019", "active: false", "score: 0", "observedAt: 2026-10-18 08:15", "description: 2026-10-17T23:15:12", "revision: 2026-10-17T23:15:12Z"]) assert.ok(text.includes(fact), fact);
  assert.doesNotMatch(text, /PRIVATE_ROW_ID|PRIVATE_OWNER|\[object Object\]/);
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

test("common instructions occur once and all four metrics bind each role", () => {
  const ids = ["role-1", "role-2", "role-3"];
  for (const provider of ["openai", "jev"] as const) {
    const request = buildDecisionRequest(provider, "Verified source facts", ids);
    const serialized = JSON.stringify(request);
    assert.equal(serialized.split(JSON.stringify(rubric.commonInstructions).slice(1, -1)).length - 1, 1);
    assert.equal(Object.keys(request.questions).length, 12);
  }
});

test("company is printed once and complete JD, salary, leadership and candidate facts survive", () => {
  const common = { companyKey: "company-1", companyName: "Example", company: { description: "Company facts" }, companyLeadership: ["Founder history"], companyData: { mainInvestors: "Investor evidence" }, employmentType: "full_time", location: "Seoul", postedAt: null, seniorityLevel: "senior", workMode: "remote", salaryRange: "KRW 200 million" };
  const text = buildScoringInput({ search_brief: [{ content: "Every brief fact" }] }, [
    { ...common, roleId: "r1", roleName: "First", roleDescription: "a".repeat(7000) + "Final important condition" },
    { ...common, roleId: "r2", roleName: "Second", roleDescription: "Distinct duties" },
  ]);
  for (const fact of ["Every brief fact", "Company facts", "Founder history", "Investor evidence", "Final important condition", "Distinct duties", "KRW 200 million", "role_id: r0", "role_id: r1"]) assert.ok(text.includes(fact));
  assert.equal(text.split("Company facts").length - 1, 1);
  assert.ok(!text.includes("companyKey"));
});

test("predicted salary reaches private Decisions evidence without becoming public compensation", () => {
  const row = { role_id: "role-estimate", role_name: "Engineer", salary_is_predicted: true,
    salary_min: 80000000, salary_max: 120000000, salary_currency: "KRW", salary_period: "year" };
  const card = roleCard(row);
  assert.equal(card.salaryRange, null);
  assert.equal(card.row.salary_min, null);
  const candidate = v2PromptCandidate(card, "en");
  const input = buildScoringInput({}, [candidate]);
  const request = buildDecisionRequest("openai", input, [row.role_id]);
  const evidence = request.input!.find(message => message.role === "user")!.content;
  assert.ok(evidence.includes("KRW 80,000,000–120,000,000 per year"));
  assert.ok(evidence.includes("not employer-disclosed; bonus and equity excluded"));
  assert.ok(evidence.includes("rough prediction; may be substantially inaccurate"));
  const disclosed = v2PromptCandidate(roleCard({ ...row, salary_is_predicted: false }), "en");
  assert.equal(disclosed.estimatedBaseSalary, null);
  assert.ok(disclosed.salaryRange?.includes("80000000-120000000"));
  assert.equal(v2PromptCandidate(roleCard({ ...row, salary_min: null, salary_max: null }), "en").estimatedBaseSalary, null);
});

test("scoring prefers the requested-language summary regardless of cache metadata and falls back to the complete JD", () => {
  const description = "Full original JD\n" + "Detailed duty\n".repeat(500) + "Final source condition";
  const row = { role_id: "summary-role", role_name: "Engineer", description };
  const card = roleCard({ ...row, summary: {
    ko: { content: "한국어 요약\n- 업무\n  - 하위 조건", version: "old", sourceHash: "old" },
    en: { content: "English summary" },
  } });
  const before = structuredClone(card);
  for (const [language, expected] of [["ko", "한국어 요약"], ["en", "English summary"]] as const) {
    const candidate = v2PromptCandidate(card, language);
    const input = buildScoringInput({}, [candidate]);
    assert.ok(input.includes(expected));
    assert.ok(!input.includes("Full original JD"));
    assert.ok(!input.includes(language === "ko" ? "English summary" : "한국어 요약"));
  }
  assert.deepEqual(card, before);
  for (const summary of [undefined, {}, { en: { content: "Only English" } }, { ko: {} },
    { ko: { content: null } }, { ko: { content: 42 } }, { ko: { content: " \n " } }]) {
    const candidate = v2PromptCandidate(roleCard({ ...row, summary }), "ko");
    assert.equal(candidate.roleDescription, description);
    assert.ok(buildScoringInput({}, [candidate]).includes("Final source condition"));
  }
});

test("same-name companies stay separate without exposing their grouping IDs", () => {
  const candidate = { companyName: "Same name", company: {}, employmentType: null, location: null,
    postedAt: null, seniorityLevel: null, workMode: null, roleName: "Engineer", roleDescription: "<p>Build</p><p>Ship</p>" };
  const text = buildScoringInput({}, [
    { ...candidate, companyKey: "workspace-a", roleId: "r1", company: { description: "First company" } },
    { ...candidate, companyKey: "workspace-b", roleId: "r2", company: { description: "Second company" } },
  ]);
  for (const fact of ["First company", "Second company", "role_id: r0", "role_id: r1", "Build", "Ship"]) assert.ok(text.includes(fact));
  for (const absent of ["workspace-a", "workspace-b", "<p>", "## user_context", "employment:", "companyData:"]) assert.ok(!text.includes(absent));
});

test("role refs follow original batch order across company groups and retain authored nesting", () => {
  const ids = [
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000002",
    "00000000-0000-4000-8000-000000000003",
  ];
  const source = `Requirements\n- Build APIs\n  - Keep nested detail\n    - Keep deeper detail\nReference: ${ids[0]}`;
  const candidates = ids.map((roleId, index) => ({
    roleId, roleName: `Role ${index}`, companyKey: index === 1 ? "b" : "a",
    companyName: index === 1 ? "Company B" : "Company A", company: {},
    employmentType: null, seniorityLevel: null, location: null, workMode: null,
    postedAt: null, roleDescription: index === 0 ? source : `Duties ${index}`,
  }));
  const before = structuredClone(candidates);
  const input = buildScoringInput({}, candidates);
  assert.deepEqual([...input.matchAll(/^### role_id: (r\d+)$/gm)].map(match => match[1]), ["r0", "r2", "r1"]);
  for (let index = 0; index < 3; index++) assert.ok(input.includes(`### role_id: r${index}\n- title: Role ${index}`));
  assert.ok(input.includes("\n  - Build APIs\n    - Keep nested detail\n      - Keep deeper detail"));
  assert.ok(input.includes(`Reference: ${ids[0]}`)); // Authored UUIDs are not globally replaced.
  assert.ok(!input.includes(ids[1]) && !input.includes(ids[2]));
  assert.ok(input.indexOf("## company_2") > input.indexOf("### role_id: r2"));
  assert.deepEqual(candidates, before);
  for (const provider of ["openai", "jev"] as const) {
    const request = buildDecisionRequest(provider, input, ids);
    const questions = Array.isArray(request.questions) ? request.questions : Object.values(request.questions);
    for (const [index, id] of ids.entries()) {
      assert.equal(questions.filter(q => q.instructions.startsWith(`For role_id r${index},`)).length, 4);
      assert.ok(!JSON.stringify(questions).includes(id));
    }
  }
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
        assert.ok(item.instructions.includes(`role_id r${i},`));
        assert.ok(item.instructions.includes(`Rubric ${metric}`));
      }
    }
    if (Array.isArray(request.questions)) {
      const score = request.questions.find(q => q.type === "score")!;
      assert.deepEqual(score.levels, [0, 1, 2, 3, 4].map(i => ({ label: String(i) })));
      assert.equal(request.questions.filter(q => q.type === "choice").length, 0);
      assert.doesNotMatch(serializedQuestions, /_roleFit|_evidence/);
    }
  }
});
