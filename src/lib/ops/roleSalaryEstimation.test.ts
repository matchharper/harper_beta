import assert from "node:assert/strict";
import { test } from "node:test";
import prompts from "./roleSalaryEstimation.prompts.json";
import {
  buildSalaryDecisionRequest,
  decodeSalaryEstimate,
  salaryMidpointError,
  salaryRunSchema,
} from "./roleSalaryEstimation";
import {
  blindSalaryText,
  buildSalaryRoleSearchSql,
} from "./roleSalaryEstimationServer";

function probabilities(index: number) {
  return prompts.anchors.KRW.map((amount, value) => ({
    value,
    label: String(amount),
    probability: value === index ? 1 : 0,
  }));
}
function response(low: number, high: number) {
  return {
    answers: [
      { name: "r0_lower", type: "score", probabilities: probabilities(low) },
      { name: "r0_upper", type: "score", probabilities: probabilities(high) },
    ],
  };
}
test("decodes monetary anchors rather than the API index score and preserves wide ranges", () => {
  const raw = response(0, 9);
  const result = decodeSalaryEstimate(raw, 0, "KRW");
  assert.equal(result.min, 30_000_000);
  assert.equal(result.max, 240_000_000);
  assert.ok(result.widthPct > 100);
  raw.answers[0].probabilities[0].probability = 0.25;
  raw.answers[0].probabilities[9].probability = 0.75;
  assert.equal(decodeSalaryEstimate(raw, 0, "KRW").min, 187_500_000);
});
test("rejects reversed, duplicated and malformed probability contracts without repairing them", () => {
  assert.throws(() => decodeSalaryEstimate(response(9, 0), 0, "KRW"));
  const duplicate = response(0, 9);
  duplicate.answers.push(duplicate.answers[0]);
  assert.throws(() => decodeSalaryEstimate(duplicate, 0, "KRW"));
  const bad = response(0, 9);
  bad.answers[0].probabilities[0].probability = -1;
  assert.throws(() => decodeSalaryEstimate(bad, 0, "KRW"));
  const mismatched = response(0, 9);
  mismatched.answers[0].probabilities[0].label = "USD 30";
  assert.throws(() => decodeSalaryEstimate(mismatched, 0, "KRW"));
});
test("compares annual pay only when currency and full bounds match", () => {
  const estimate = decodeSalaryEstimate(response(3, 4), 0, "KRW");
  const salary = {
    min: 60_000_000,
    max: 75_000_000,
    currency: "KRW",
    period: "year",
  };
  assert.equal(salaryMidpointError(estimate, salary), 0);
  assert.equal(
    salaryMidpointError(estimate, { ...salary, period: "month" }),
    null
  );
  assert.equal(
    salaryMidpointError(estimate, { ...salary, currency: "USD" }),
    null
  );
  assert.equal(salaryMidpointError(estimate, { ...salary, max: null }), null);
});
test("blinds numeric salary disclosures including title text and both endpoints", () => {
  for (const source of [
    "연봉 2400 - 5000만원",
    "연봉6000",
    "$160,000 to $200,000 base salary",
    "USD 120,000–160,000",
    "Salary band 120000 to 180000",
    "₩111,754,979–₩124,399,638",
  ])
    assert.doesNotMatch(blindSalaryText(source), /\d/);
  const jd = blindSalaryText(
    "<p>경력 3–7년. React 19 경험.</p><p>연봉 5000~8000만원</p>"
  );
  assert.match(jd, /3–7년/);
  assert.match(jd, /React 19/);
  assert.doesNotMatch(jd, /5000|8000|<p>/);
});
test("bounds selection and builds isolated questions without gold salary fields", () => {
  assert.equal(salaryRunSchema.safeParse({ roleIds: [] }).success, false);
  assert.equal(
    salaryRunSchema.safeParse({
      roleIds: Array(21).fill("389e8ef2-d17a-53c4-a870-032449a21e76"),
    }).success,
    false
  );
  const role = {
    case_id: "role-a",
    company_name: "Example",
    title: "Engineer",
    country: "KR" as const,
    currency: "KRW" as const,
    location: null,
    employment_type: null,
    company_context: {},
    jd: "Build products.",
  };
  const request = buildSalaryDecisionRequest([role], "market_reasoning");
  assert.equal(request.questions.length, 2);
  assert.equal(request.questions[0].levels.length, 10);
  assert.match(request.questions[0].instructions, /ONLY case_id role-a/);
  assert.doesNotMatch(request.input, /salary_min|salary_max/);
  assert.throws(() => buildSalaryDecisionRequest([role, role], "baseline"));
  const roles = Array.from({ length: 20 }, (_, i) => ({
    ...role,
    case_id: `389e8ef2-d17a-53c4-a870-${String(i).padStart(12, "0")}`,
  }));
  assert.equal(
    salaryRunSchema.safeParse({ roleIds: roles.map((r) => r.case_id) }).success,
    true
  );
  const batch = buildSalaryDecisionRequest(roles, "market_reasoning");
  assert.equal(batch.questions.length, 40);
  assert.equal(new Set(batch.questions.map((q) => q.name)).size, 40);
  assert.throws(() =>
    buildSalaryDecisionRequest(
      [...roles, { ...role, case_id: "overflow" }],
      "baseline"
    )
  );
});
test("search treats punctuation as literal data and excludes inactive/test-only roles", () => {
  const sql = buildSalaryRoleSearchSql({
    q: "x'%_",
    country: "KR",
    offset: 20,
  });
  assert.match(sql, /x''\\%\\_/);
  assert.match(sql, /testOnly/);
  assert.match(sql, /expires_at > now\(\)/);
  assert.match(sql, /UNION/);
  assert.match(sql, /LIMIT 21 OFFSET 20/);
});
