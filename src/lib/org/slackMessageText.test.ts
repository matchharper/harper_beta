import assert from "node:assert/strict";
import test from "node:test";
import {
  isOtherSlackBotMessage,
  mentionsOnlyOtherSlackMembers,
  stripSlackSentUsingAttribution,
} from "@/lib/org/slackMessageText";

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

test("recognizes another app's Slack message but not Harper's own", () => {
  const harper = "U0C624AKHPX";
  assert.equal(
    isOtherSlackBotMessage({ bot_id: "B1", user: "U0B50DPAJ0H" }, harper),
    true
  );
  assert.equal(
    isOtherSlackBotMessage({ subtype: "bot_message", bot_id: "B1" }, harper),
    true
  );
  assert.equal(isOtherSlackBotMessage({ bot_id: "B2", user: harper }, harper), false);
  assert.equal(isOtherSlackBotMessage({ user: "U0B02CP0NCA" }, harper), false);
});

test("detects replies addressed only to another member or bot", () => {
  const harper = "U0C624AKHPX";
  assert.equal(mentionsOnlyOtherSlackMembers("<@U0B50DPAJ0H> 얘 뭐래니?", harper), true);
  assert.equal(
    mentionsOnlyOtherSlackMembers("관심 이유 너가 제안해봐 <@U0B50DPAJ0H|bbomi>", harper),
    true
  );
  assert.equal(
    mentionsOnlyOtherSlackMembers("<@U0B50DPAJ0H> 이거 보고 <@U0C624AKHPX> 진행해줘", harper),
    false
  );
  assert.equal(mentionsOnlyOtherSlackMembers("이렇게 보내주렴", harper), false);
  assert.equal(
    mentionsOnlyOtherSlackMembers("이대로 등록해줘. *다음을 사용하여 보냄* <@U0BGN5W480N>", harper),
    false
  );
});
