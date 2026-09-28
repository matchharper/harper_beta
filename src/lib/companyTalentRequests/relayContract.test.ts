import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { AUTHORIZED_MESSAGE_CONTENT_CONTRACT, COMPANY_RELAY_CONTENT_CONTRACT, COMPANY_RELAY_DELIVERY_RESPONSE_CONTRACT } from "./relayContract";

test("candidate message schema and policy use the same relay content contract", () => {
  const tools = readFileSync(new URL("../talentOnboarding/tools.ts", import.meta.url), "utf8");
  const policy = readFileSync(new URL("../career/prompts/toolPolicyPrompt.ts", import.meta.url), "utf8");
  assert.match(tools, /description:\s*COMPANY_RELAY_CONTENT_CONTRACT/);
  assert.match(policy, /\$\{COMPANY_RELAY_CONTENT_CONTRACT\}/);
  assert.match(tools, /: COMPANY_RELAY_DELIVERY_RESPONSE_CONTRACT/);
});

test("company send schema and email authoring share the same meaning contract", () => {
  const tools = readFileSync(new URL("../org/agent/tools.ts", import.meta.url), "utf8");
  const copy = readFileSync(new URL("./copyPrompt.ts", import.meta.url), "utf8");
  assert.match(tools, /\$\{AUTHORIZED_MESSAGE_CONTENT_CONTRACT\}/);
  assert.match(copy, /\$\{AUTHORIZED_MESSAGE_CONTENT_CONTRACT\}/);
  assert.match(AUTHORIZED_MESSAGE_CONTENT_CONTRACT, /Permission to talk later is not a promise/);
});

test("relay contract separates authorized meaning, privacy and observed delivery", () => {
  assert.match(COMPANY_RELAY_CONTENT_CONTRACT, /conditions, uncertainty and strength/);
  assert.match(COMPANY_RELAY_CONTENT_CONTRACT, /restriction on Harper, not content to quote/);
  assert.match(COMPANY_RELAY_DELIVERY_RESPONSE_CONTRACT, /Do not predict a response/);
  assert.match(COMPANY_RELAY_DELIVERY_RESPONSE_CONTRACT, /or repeat unconfirmed-status disclaimers/);
  assert.match(COMPANY_RELAY_DELIVERY_RESPONSE_CONTRACT, /end the reply unless the user also asked a still-unanswered question/);
});
