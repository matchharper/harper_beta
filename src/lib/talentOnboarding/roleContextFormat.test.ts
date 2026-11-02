import assert from "node:assert/strict";
import test from "node:test";

import { formatRoleContextForModel } from "./roleContextFormat";

test("role context gives the Career model compact readable activity", () => {
  const output = formatRoleContextForModel([
    {
      found: true,
      roleId: "role-1",
      role: { name: "Backend Engineer", status: "ended" },
      companyDb: { name: "Example" },
      recommendation: {
        savedStage: "closed",
        recentActivity:
          "2026-09-30 15:00 KST Harper가 이 역할의 채용 종료를 안내했습니다.",
        activityPage: { offset: 0, limit: 10, hasMore: true },
      },
    },
  ]);

  assert.match(output, /Role: Backend Engineer \(roleId: role-1\)/);
  assert.match(output, /Recent activity:\n2026-09-30 15:00 KST/);
  assert.match(output, /Activity page: offset 0, limit 10, hasMore true/);
  assert.doesNotMatch(output, /\{|"recentActivity"|"metadata"/);
});

test("role evidence formats metadata without altering authored text or emptying meaningful values", () => {
  const timestamp = "2026-10-29T20:21:49.761117+00:00";
  const roles = [{ found: true, roleId: "role-1",
    role: { name: "Engineer", postedAt: timestamp, expiresAt: "2026-11-30T14:59:59+00:00", description: `Source text: ${timestamp}`, type: [] },
    companyDb: { name: "Example", employeeCountRange: { start: 51, end: 200 } },
    recommendation: { recommendedAt: "2026-11-02T03:14:58.415533+00:00", fitReasons: [], tradeoffs: {}, preferenceFit: { empty: null },
      feedback: "declined", feedbackReason: "Different work", savedStage: "closed", activityPage: { offset: 10, limit: 10, hasMore: false } },
  }];
  const original = structuredClone(roles);
  const output = formatRoleContextForModel(roles);
  for (const fact of ["times: Asia/Seoul", "Posted: 2026-10-30 05:21", "Expires: 2026-11-30 23:59",
    "Recommended: 2026-11-02 12:14", "Company size: 51–200 team members", `Source text: ${timestamp}`,
    "Your feedback: declined", "Your feedback reason: Different work", "Saved stage: closed", "offset 10, limit 10, hasMore false"])
    assert.ok(output.includes(fact), fact);
  assert.doesNotMatch(output, /\[object Object\]|Fit reasons:|Tradeoffs:|Preference fit:|Employment type:/);
  assert.deepEqual(roles, original);
  for (const [range, expected] of [[{ start: 0, end: 10 }, "0–10"], [{ start: 51 }, "51+"], [{ end: 50 }, "up to 50"], ["11-50", "11-50"]] as const) {
    const text = formatRoleContextForModel([{ found: true, roleId: "role", companyDb: { employeeCountRange: range },
      recommendation: { fitReasons: ["Owns product"], tradeoffs: ["Travel"], preferenceFit: { salary: false, fit: 0 } } }]);
    for (const fact of [expected, "Owns product", "Travel", "salary: false", "fit: 0"]) assert.ok(text.includes(fact), fact);
  }
});
