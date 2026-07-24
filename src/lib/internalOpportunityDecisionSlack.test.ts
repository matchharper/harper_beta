import assert from "node:assert/strict";
import test from "node:test";
import {
  getInternalOpportunityDecisionSlackChannelId,
  parseInternalOpportunityFeedbackReasonForSlack,
} from "./internalOpportunityDecisionSlack";

test("routes the configured company workspace to its decision channel", () => {
  assert.equal(
    getInternalOpportunityDecisionSlackChannelId(
      "720254d7-aeb7-4709-a56f-7b822f89eac5"
    ),
    "C09CRN4TFC4"
  );
});

test("keeps the default Slack path for other company workspaces", () => {
  assert.equal(
    getInternalOpportunityDecisionSlackChannelId(
      "00000000-0000-0000-0000-000000000000"
    ),
    null
  );
  assert.equal(getInternalOpportunityDecisionSlackChannelId(null), null);
});

test("formats structured and plain-text feedback reasons for Slack", () => {
  assert.equal(
    parseInternalOpportunityFeedbackReasonForSlack(
      JSON.stringify({
        customReason: "제품과 직접 맞닿아 있어서",
        selectedOptions: ["역할이 잘 맞아요", "성장 가능성이 보여요"],
      })
    ),
    "역할이 잘 맞아요 / 성장 가능성이 보여요 / 제품과 직접 맞닿아 있어서"
  );
  assert.equal(
    parseInternalOpportunityFeedbackReasonForSlack("직접 이야기해 보고 싶어요"),
    "직접 이야기해 보고 싶어요"
  );
  assert.equal(parseInternalOpportunityFeedbackReasonForSlack(""), null);
});
