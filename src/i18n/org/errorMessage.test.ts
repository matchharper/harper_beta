import assert from "node:assert/strict";
import test from "node:test";
import { localizedOrgErrorMessage } from "./errorMessage";
import { getSlackChannelNameError } from "@/lib/org/slackChannelCreation";

test("English org errors do not expose Korean server copy", () => {
  assert.equal(
    localizedOrgErrorMessage(
      new Error("같은 이름의 Slack 채널이 이미 있어요. 다른 이름을 입력해 주세요."),
      "en",
      "Could not create channel."
    ),
    "A Slack channel with that name already exists. Choose another name."
  );
  assert.equal(
    localizedOrgErrorMessage(new Error("접근 권한이 없습니다."), "en", "Request failed."),
    "Request failed."
  );
  assert.equal(
    localizedOrgErrorMessage(new Error("접근 권한이 없습니다."), "ko", "요청 실패"),
    "접근 권한이 없습니다."
  );
  assert.equal(getSlackChannelNameError("Bad Name", "en"), "Use only lowercase letters, numbers, hyphens, or underscores.");
});
