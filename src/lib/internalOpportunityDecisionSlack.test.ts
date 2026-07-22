import assert from "node:assert/strict";
import test from "node:test";
import { getInternalOpportunityDecisionSlackChannelId } from "./internalOpportunityDecisionSlack";

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
