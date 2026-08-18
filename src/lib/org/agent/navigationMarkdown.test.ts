import assert from "node:assert/strict";
import test from "node:test";

import {
  convertSlackMrkdwnToWebMarkdown,
  renderOrgAgentWebLinks,
} from "@/lib/org/agent/navigationMarkdown";
import { parseHarperSlackChoiceMarkers } from "@/lib/org/slackChoiceButtons";

const workspaceId = "workspace-1";

test("company-side LLM private navigation markers become Harper web links", () => {
  const markdown = [
    "[홈](home)",
    "[역할](roles)",
    "[팀](team)",
    "[Founding Engineer](role:role-1)",
    "[김하퍼](talent:talent-1)",
  ].join("\n");
  const rendered = renderOrgAgentWebLinks({ markdown, workspaceId });

  assert.match(rendered, /\/org\/home\?orgId=workspace-1/);
  assert.match(rendered, /\/org\/jobs\?orgId=workspace-1/);
  assert.match(rendered, /\/org\/team\?orgId=workspace-1/);
  assert.match(rendered, /roleId=role-1&tab=pipeline&view=pipeline/);
  assert.match(rendered, /talentId=talent-1/);
  assert.doesNotMatch(rendered, /\]\((?:home|roles|team|role:|talent:)/);
});

test("external Markdown links and Slack button markers remain unchanged", () => {
  const markdown =
    "[문서](https://example.com) [확인](button:네, 진행해 주세요)";

  assert.equal(renderOrgAgentWebLinks({ markdown, workspaceId }), markdown);
});

test("Slack role-creation messages render as web Markdown", () => {
  assert.equal(
    convertSlackMrkdwnToWebMarkdown(
      "*역할*  Staff Engineer\n<https://example.com/org/role?roleId=1|웹에서 계속 작성하기>"
    ),
    "**역할**  Staff Engineer\n[웹에서 계속 작성하기](https://example.com/org/role?roleId=1)"
  );
});

test("Slack choice transport markers stay out of the shared web transcript", () => {
  const parsed = parseHarperSlackChoiceMarkers(
    "*등록할까요?*\n\n[예](button:등록합니다.) [아니오](button:더 수정합니다.)"
  );

  assert.equal(convertSlackMrkdwnToWebMarkdown(parsed.text), "**등록할까요?**");
  assert.deepEqual(
    parsed.choices.map((choice) => choice.label),
    ["예", "아니오"]
  );
});
