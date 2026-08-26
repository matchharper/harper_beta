import assert from "node:assert/strict";
import test from "node:test";
import { extractSentAutoIntroRecommendationBody } from "@/lib/org/autoIntroRecommendation";

test("extracts the authored body from a successfully sent Slack candidate card", () => {
  const body = `*TL;DR* - 핵심 요약

*Harper Note* - Harper의 해석
--------
Work Summary:
*Engineer @ Harper*
• 제품을 만들었습니다.
------------

*Preferences:*
• 서울 근무 선호`;
  assert.equal(
    extractSentAutoIntroRecommendationBody({
      metadata: {
        candidateCopy: `*Role:* Engineer
*Location:* Seoul

_*PLEASE REPLY TO REQUEST AN INTRO*_

${body}`,
        slackSent: true,
      },
    }),
    body
  );
});

test("does not expose an intro that Slack did not send", () => {
  assert.equal(
    extractSentAutoIntroRecommendationBody({
      metadata: {
        candidateCopy: "*TL;DR* - 전송되지 않은 소개",
        deliveryStatus: "failed",
      },
    }),
    null
  );
});
