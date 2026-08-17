import assert from "node:assert/strict";
import test from "node:test";
import { stripSlackSentUsingAttribution } from "@/lib/org/slackMessageText";

test("removes Slack sent-using attribution from Korean user text", () => {
  assert.equal(
    stripSlackSentUsingAttribution(
      "이대로 등록해줘. *다음을 사용하여 보냄* <@U0BGN5W480N>"
    ),
    "이대로 등록해줘."
  );
});

test("removes a separate English sent-using attribution line", () => {
  assert.equal(
    stripSlackSentUsingAttribution(
      "Please continue.\n\n*Sent using* <@U012ABCDEF>"
    ),
    "Please continue."
  );
});

test("does not remove an ordinary Slack mention", () => {
  assert.equal(
    stripSlackSentUsingAttribution("<@U012ABCDEF>에게 확인해줘."),
    "<@U012ABCDEF>에게 확인해줘."
  );
});
