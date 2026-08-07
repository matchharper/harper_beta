import assert from "node:assert/strict";
import test from "node:test";
import { buildHarperSlackWelcomeMessage } from "./slackWelcome";

test("builds the Korean channel welcome message with workspace and bot links", () => {
  const message = buildHarperSlackWelcomeMessage({
    botUserId: "U123HARPER",
    publicSiteUrl: "https://app.matchharper.com/some/path",
    workspaceId: "workspace id",
  });

  assert.equal(
    message,
    [
      ":tada: 이 채널이 <https://app.matchharper.com/org?orgId=workspace+id|Harper>와 연결됐어요!",
      "",
      "이제 이곳에서 채용 진행 상황을 확인하고 Harper와 함께 후보자를 검토할 수 있어요.",
      "",
      "이 채널에서 알려드려요:",
      "• :bar_chart: 주요 채용 활동과 진행 상황",
      "• :red_circle: 확인이나 결정이 필요한 요청",
      "",
      ":bulb: 궁금한 점은 <@U123HARPER>를 태그해 물어보세요.",
      "> <@U123HARPER> 지금 우선 검토해야 할 후보자를 알려줘",
    ].join("\n")
  );
});

test("falls back to the public Harper site for an invalid configured URL", () => {
  const message = buildHarperSlackWelcomeMessage({
    botUserId: "U123HARPER",
    publicSiteUrl: "://invalid",
    workspaceId: "workspace-id",
  });

  assert.match(
    message,
    /<https:\/\/matchharper\.com\/org\?orgId=workspace-id\|Harper>/
  );
});
