import test from "node:test";
import assert from "node:assert/strict";
import { buildCompanyRoleCounts } from "./companyRoleSummary";

test("counts current people per role once and prioritizes company proposals over duplicate recommendations", () => {
  const counts = buildCompanyRoleCounts({
    recommendations: [
      { id: "r1", role_id: "role", talent_id: "a", feedback: null },
      { id: "r2", role_id: "role", talent_id: "a", feedback: null },
      { id: "r3", role_id: "role", talent_id: "b", feedback: "negative" },
      { id: "r4", role_id: "other", talent_id: "a", feedback: null },
    ],
    intros: [{ role_id: "role", talent_id: "a", status: "ready" }],
    tags: [],
    stages: [],
    connections: [],
  });
  assert.equal(
    counts.get("role")?.find((s) => s.id === "company_intro")?.count,
    1
  );
  assert.equal(counts.get("role")?.find((s) => s.id === "ended")?.count, 1);
  assert.equal(
    counts.get("role")?.reduce((sum, s) => sum + s.count, 0),
    2
  );
  assert.equal(
    counts.get("other")?.find((s) => s.id === "recommended")?.count,
    1
  );
});

test("current tags take precedence over historical connection, with custom stages and stopped candidates kept distinct", () => {
  const counts = buildCompanyRoleCounts({
    recommendations: [
      { id: "r1", role_id: "role", talent_id: "a", feedback: "like" },
      { id: "r2", role_id: "role", talent_id: "b", feedback: "like" },
      { id: "r3", role_id: "role", talent_id: "c", feedback: "like" },
    ],
    intros: [],
    tags: [
      { opportunity_id: "role", talent_id: "a", tag: "내부:프로세스중단" },
      { opportunity_id: "role", talent_id: "a", tag: "내부:연결됨" },
      { opportunity_id: "role", talent_id: "b", tag: "내부단계:abcd" },
      { opportunity_id: "role", talent_id: "c", tag: "내부:수락" },
    ],
    stages: [{ id: "ab-cd" }],
    connections: [{ recommendation_id: "r1" }, { recommendation_id: "r3" }],
  });
  for (const id of ["ended", "in_progress", "connected"])
    assert.equal(counts.get("role")?.find((s) => s.id === id)?.count, 1);
});
