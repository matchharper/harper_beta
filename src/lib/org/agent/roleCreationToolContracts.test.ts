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
  assert.match(roleBlock, /anyOf/);
  assert.match(roleBlock, /required: \["name"\]/);
  assert.match(roleBlock, /required: \["criteria"\]/);
  assert.match(roleBlock, /required: \["memory"\]/);
  assert.match(roleBlock, /minItems: 0/);
  assert.match(roleBlock, /maxItems: 6/);
  assert.match(roleBlock, /independently assessable/);
  assert.match(roleBlock, /minimum bar/);
  assert.match(companyBlock, /anyOf/);
  assert.match(companyBlock, /required: \["companyName"\]/);
  assert.match(companyBlock, /required: \["pitch"\]/);
  assert.match(companyBlock, /required: \["relatedLinks"\]/);
  assert.doesNotMatch(companyBlock, /required: \["description"\]/);
  assert.doesNotMatch(companyBlock, /required: \["careerUrl"\]/);
  assert.doesNotMatch(companyBlock, /required: \["mainInvestors"\]/);
  assert.doesNotMatch(
    companyBlock,
    /required: \["lastFundingRoundDescription"\]/
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
  assert.match(block, /anyOf/);
  assert.match(block, /required: \["assigneeUserId"\]/);
  assert.match(block, /required: \["channelIds"\]/);
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
});
