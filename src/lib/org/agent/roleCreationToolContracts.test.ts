import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./roleCreationTools.ts", import.meta.url),
  "utf8"
);
const stateSource = readFileSync(
  new URL("./roleCreationState.ts", import.meta.url),
  "utf8"
);

function toolBlock(name: string, nextName: string) {
  const start = source.indexOf(`name: "${name}"`);
  const end = source.indexOf(`name: "${nextName}"`, start + 1);
  assert.notEqual(start, -1, `${name} tool is missing`);
  assert.notEqual(end, -1, `${nextName} tool is missing`);
  return source.slice(start, end);
}

test("role updates stay callable without notification-only arguments", () => {
  assert.doesNotMatch(
    toolBlock("update_role_draft", "update_company_context"),
    /assigneeUserId|channelIds/
  );
  assert.doesNotMatch(
    toolBlock("update_company_context", "read_other_roles"),
    /assigneeUserId|channelIds/
  );
});

test("sparse-role source discovery has a dedicated no-argument one-attempt tool", () => {
  const block = toolBlock(
    "research_role_description_sources",
    "update_role_draft"
  );
  assert.match(block, /one automatic source-discovery attempt/);
  assert.match(block, /saved company and role title/);
  assert.match(block, /other roles from this company/);
  assert.match(block, /descriptionSourceResearch is present/);
  assert.match(block, /Do not use ordinary web_search/);
  assert.match(block, /additionalProperties: false/);
  assert.match(source, /fetchOtherRoleDescriptionReferences/);
  assert.match(stateSource, /external_jd_url, source_type, updated_at/);
  assert.match(stateSource, /slice\(0, 6_000\)/);
  assert.match(stateSource, /\.limit\(5\)/);
});

test("role and company updates require at least one declared field", () => {
  const roleBlock = toolBlock("update_role_draft", "update_company_context");
  const companyBlock = toolBlock("update_company_context", "read_other_roles");
  assert.match(roleBlock, /minProperties: 1/);
  assert.doesNotMatch(roleBlock, /anyOf/);
  assert.match(roleBlock, /minItems: 0/);
  assert.match(roleBlock, /maxItems: 6/);
  assert.match(roleBlock, /independently assessable/);
  assert.match(roleBlock, /minimum bar/);
  assert.match(roleBlock, /role eligibility \/ experience fit/);
  assert.match(roleBlock, /company talent quality \/ caliber/);
  assert.match(roleBlock, /comparative overall talent-level gate/);
  assert.match(roleBlock, /still fall below it/);
  assert.match(roleBlock, /Top-tier schools or programs/);
  assert.match(roleBlock, /Top-tier companies/);
  assert.match(roleBlock, /highly selective core teams/);
  assert.match(roleBlock, /Do not automatically rewrite those patterns/);
  assert.match(roleBlock, /prestigious affiliation alone as proof/);
  assert.match(companyBlock, /minProperties: 1/);
  assert.doesNotMatch(companyBlock, /anyOf/);
  assert.doesNotMatch(companyBlock, /required: \["description"\]/);
  assert.doesNotMatch(companyBlock, /required: \["careerUrl"\]/);
  assert.doesNotMatch(companyBlock, /required: \["mainInvestors"\]/);
  assert.doesNotMatch(
    companyBlock,
    /required: \["lastFundingRoundDescription"\]/
  );
});

test("saved Role Descriptions strip private company-information markers", () => {
  assert.match(stateSource, /stripOrgAgentCompanyInfoMarker/);
  assert.match(
    stateSource,
    /stripOrgAgentCompanyInfoMarker\(args\.description\)/
  );
});

test("other role context is available before drafting internal criteria", () => {
  const block = toolBlock("read_other_roles", "set_role_notification");
  assert.match(block, /private request/);
  assert.match(block, /before the first internal request or criteria draft/);
  assert.match(block, /never copy it silently/);
});

test("notification updates require a channel or an assignee", () => {
  const block = toolBlock(
    "set_role_notification",
    "confirm_pending_role_creation"
  );
  assert.match(block, /minProperties: 1/);
  assert.doesNotMatch(block, /anyOf/);
});

test("free-form final confirmation is contextual and terminal", () => {
  const block = toolBlock(
    "confirm_pending_role_creation",
    "request_role_creation_confirmation"
  );
  assert.match(block, /immediately preceding Harper message/);
  assert.match(block, /Natural affirmative replies/);
  assert.match(block, /This is terminal/);
  assert.match(block, /adds, removes, or changes any role detail/);
});

test("final confirmation follows team-preference discovery", () => {
  const start = source.indexOf('name: "request_role_creation_confirmation"');
  assert.notEqual(start, -1);
  const block = source.slice(start, source.indexOf("] as const", start));
  assert.match(block, /at least two distinct opportunities/);
  assert.match(block, /beyond the JD and technical must-haves/);
  assert.match(block, /representative ideal current team member/);
  assert.match(block, /any useful professional source/);
  assert.match(block, /LinkedIn is one possible source, not a requirement/);
  assert.match(block, /why that person is a strong reference/);
});

test("the private hiring brief stores reference-profile calibration", () => {
  const block = toolBlock("update_role_draft", "update_company_context");
  assert.match(block, /complete private Hiring Brief/);
  assert.match(block, /role eligibility \/ experience fit/);
  assert.match(block, /company talent quality \/ caliber/);
  assert.match(block, /comparative overall talent-level gate/);
  assert.match(block, /still fall below it/);
  assert.match(block, /below-bar boundary/);
  assert.match(block, /exact source URLs/);
  assert.match(
    block,
    /user-stated reasons, observed professional facts, and Harper's tentative interpretation/
  );
  assert.match(block, /Top-tier schools or programs/);
  assert.match(block, /Top-tier companies/);
  assert.match(block, /highly selective core teams/);
  assert.match(block, /Do not automatically rewrite those patterns/);
  assert.match(block, /prestigious affiliation alone as proof/);
  assert.match(block, /Treat one profile as a tentative anchor/);
  assert.match(
    block,
    /compare multiple profiles to find the smallest stable company-specific caliber rules/
  );
  assert.match(block, /User-stated judgment takes precedence/);
  assert.match(
    block,
    /Do not use protected traits or non-job-related similarity/
  );
});
