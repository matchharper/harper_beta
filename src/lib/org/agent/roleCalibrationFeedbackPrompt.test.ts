import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRoleCalibrationFeedbackSystemPrompt,
  parseRoleCalibrationFeedbackDraft,
} from "@/lib/org/agent/roleCalibrationFeedbackPrompt";

test("prepared-profile feedback stays distinct from new reference calibration", () => {
  const prompt = buildRoleCalibrationFeedbackSystemPrompt();

  assert.match(prompt, /profile examples prepared for one Role/);
  assert.match(
    prompt,
    /reasonless Good or Bad changes only the profile status/
  );
  assert.match(prompt, /not connection acceptance or rejection decisions/);
  assert.match(prompt, /do not create preferences on their own/);
});

test("feedback parser accepts several explicit reviews with one complete brief", () => {
  const result = parseRoleCalibrationFeedbackDraft({
    finishCalibration: false,
    hiringBrief: "## 가산점\n\n- 0-to-1 제품 출시 경험",
    reviews: [
      { profileId: "A", reason: "제품을 직접 출시함", status: "good" },
      { profileId: "C", reason: "백엔드 깊이가 부족함", status: "bad" },
    ],
    summary: "A와 C 피드백을 반영함",
    userReply: "A는 Good, C는 Bad로 기록하고 말씀하신 기준을 반영했어요.",
  });

  assert.deepEqual(
    result.reviews.map((review) => [review.profileId, review.status]),
    [
      ["A", "good"],
      ["C", "bad"],
    ]
  );
  assert.match(result.hiringBrief ?? "", /0-to-1/);
});

test("reasonless profile feedback cannot silently rewrite the Hiring Brief", () => {
  assert.throws(
    () =>
      parseRoleCalibrationFeedbackDraft({
        finishCalibration: false,
        hiringBrief: "changed",
        reviews: [{ profileId: "B", reason: null, status: "good" }],
        summary: "B를 Good으로 기록",
        userReply: "B를 Good으로 기록했어요.",
      }),
    /Reasonless calibration feedback changed the Hiring Brief/
  );
});
