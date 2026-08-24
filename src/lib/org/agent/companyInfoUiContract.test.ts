import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const messageSource = readFileSync(
  new URL("../../../components/org/agent/OrgAgentMessage.tsx", import.meta.url),
  "utf8"
);
const rolePageSource = readFileSync(
  new URL(
    "../../../components/org/workspace/pages/OrgRoleCreationPage.tsx",
    import.meta.url
  ),
  "utf8"
);

test("renders the company-information card at the marker with compact styling", () => {
  assert.match(messageSource, /splitOrgAgentCompanyInfoMarker\(visibleContent\)/);
  assert.match(messageSource, /companyInfoSegments\.map\(\(segment, index\)/);
  assert.match(messageSource, /w-fit max-w-\[min\(360px,100%\)\]/);
  assert.doesNotMatch(messageSource, /ArrowRight/);
});

test("keeps role tabs above company information without a separate back bar", () => {
  const tabListIndex = rolePageSource.indexOf('role="tablist"');
  const companyInfoContentIndex = rolePageSource.indexOf(
    'aria-label="회사 정보 상세 내용"'
  );

  assert.ok(tabListIndex >= 0);
  assert.ok(companyInfoContentIndex > tabListIndex);
  assert.doesNotMatch(rolePageSource, /ArrowLeft|역할 상세로 돌아가기/);
  assert.doesNotMatch(
    rolePageSource,
    /flex h-14 shrink-0 items-center justify-between/
  );
  assert.match(rolePageSource, /<PanelRightClose/);
  assert.ok(rolePageSource.indexOf("<PanelRightClose") < tabListIndex);
  assert.match(rolePageSource, /\{tab\.icon\}/);
  assert.match(
    rolePageSource,
    /gap-1\.5 rounded-xs px-3 py-3 text-\[14px\] font-light/
  );
  assert.match(
    rolePageSource,
    /hidden=\{companyInfoOpen \|\| activeTab !== "matching"\}/
  );
  assert.match(rolePageSource, /onCompanyInfoClose\?\.\(\)/);
});
