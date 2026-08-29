import assert from "node:assert/strict";
import test from "node:test";

import { partitionOpportunityFeedbackReasons } from "./opportunityFeedbackSignals";

test("treats already-applied and expired posting as operational-only reasons", () => {
  assert.deepEqual(
    partitionOpportunityFeedbackReasons("이미 지원했던 회사/역할입니다."),
    {
      hasReason: true,
      isOperationalOnly: true,
      operationalKinds: ["already_applied"],
      operationalReasons: ["이미 지원했던 회사/역할입니다."],
      preferenceReasons: [],
    }
  );
  assert.equal(
    partitionOpportunityFeedbackReasons("만료된 공고에요.").isOperationalOnly,
    true
  );
});

test("keeps non-operational selections and custom text as preference evidence", () => {
  const result = partitionOpportunityFeedbackReasons(
    JSON.stringify({
      customReason: "핀테크 도메인은 선호하지 않아요",
      selectedOptions: [
        "만료된 공고에요.",
        "근무 조건이 맞지않아요(리모트, 위치 등)",
      ],
    })
  );

  assert.equal(result.isOperationalOnly, false);
  assert.deepEqual(result.operationalKinds, ["expired_posting"]);
  assert.deepEqual(result.preferenceReasons, [
    "근무 조건이 맞지않아요(리모트, 위치 등)",
    "핀테크 도메인은 선호하지 않아요",
  ]);
});
