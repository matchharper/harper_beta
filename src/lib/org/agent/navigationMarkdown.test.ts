import assert from "node:assert/strict";
import test from "node:test";

import { renderOrgAgentWebLinks } from "@/lib/org/agent/navigationMarkdown";

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
  assert.match(rendered, /roleId=role-1&view=pipeline/);
  assert.match(rendered, /talentId=talent-1/);
  assert.doesNotMatch(rendered, /\]\((?:home|roles|team|role:|talent:)/);
});

test("external Markdown links and Slack button markers remain unchanged", () => {
  const markdown =
    "[문서](https://example.com) [확인](button:네, 진행해 주세요)";

  assert.equal(renderOrgAgentWebLinks({ markdown, workspaceId }), markdown);
});
