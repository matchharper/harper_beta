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
