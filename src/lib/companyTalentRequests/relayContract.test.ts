import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { AUTHORIZED_MESSAGE_CONTENT_CONTRACT, COMPANY_RELAY_CONTENT_CONTRACT, COMPANY_RELAY_DELIVERY_RESPONSE_CONTRACT } from "./relayContract";

test("candidate correspondence exposes authorization, meaning and observed delivery", () => {
  const tools = readFileSync(new URL("../talentOnboarding/tools.ts", import.meta.url), "utf8");
  const policy = readFileSync(new URL("../career/prompts/toolPolicyPrompt.ts", import.meta.url), "utf8");
  assert.match(tools, /TOOL_DESCRIPTIONS\.contact_company/);
  const descriptions = readFileSync(new URL("../llm/toolDescriptions.ts", import.meta.url), "utf8");
  assert.match(descriptions, /faithfully preserving qualifications, uncertainty, and refusal/);
  assert.match(policy, /Preserve the candidate's meaning and conditions/);
  assert.match(tools, /: COMPANY_RELAY_DELIVERY_RESPONSE_CONTRACT/);
});

test("email authoring keeps the meaning contract; the company tool only messages the candidate's agent", () => {
  const tools = readFileSync(new URL("../org/agent/tools.ts", import.meta.url), "utf8");
  const copy = readFileSync(new URL("./copyPrompt.ts", import.meta.url), "utf8");
  // PR-9: company messages to candidates go to the candidate's agent (AGENT_MESSAGE_DESCRIPTION).
  assert.doesNotMatch(tools, /AUTHORIZED_MESSAGE_CONTENT_CONTRACT|DIRECT_CONTACT_MESSAGE_CONTRACT/);
  assert.match(copy, /\$\{AUTHORIZED_MESSAGE_CONTENT_CONTRACT\}/);
  assert.match(AUTHORIZED_MESSAGE_CONTENT_CONTRACT, /Permission to talk later is not a promise/);
});

test("relay contract separates authorized meaning, privacy and observed delivery", () => {
  assert.match(COMPANY_RELAY_CONTENT_CONTRACT, /conditions, uncertainty and strength/);
  assert.match(COMPANY_RELAY_CONTENT_CONTRACT, /restriction on Harper, not content to quote/);
  assert.match(COMPANY_RELAY_DELIVERY_RESPONSE_CONTRACT, /Delivery does not establish that the company read, answered, agreed, or will act at a particular time/);
});
