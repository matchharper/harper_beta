import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./roleCreationTools.ts", import.meta.url),
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

test("role and company updates require at least one declared field", () => {
  const roleBlock = toolBlock("update_role_draft", "update_company_context");
  const companyBlock = toolBlock(
    "update_company_context",
    "read_other_roles"
  );
  assert.match(roleBlock, /anyOf/);
  assert.match(roleBlock, /required: \["name"\]/);
  assert.match(roleBlock, /required: \["memory"\]/);
  assert.match(companyBlock, /anyOf/);
  assert.match(companyBlock, /required: \["companyName"\]/);
  assert.match(
    companyBlock,
    /required: \["lastFundingRoundDescription"\]/
  );
});

test("notification updates require a channel or an assignee", () => {
  const block = toolBlock(
    "set_role_notification",
    "request_role_creation_confirmation"
  );
  assert.match(block, /anyOf/);
  assert.match(block, /required: \["assigneeUserId"\]/);
  assert.match(block, /required: \["channelIds"\]/);
});
