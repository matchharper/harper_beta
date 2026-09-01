import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_ORG_AGENT_REASONING_EFFORT,
  DEFAULT_ORG_AGENT_MODEL,
  DEFAULT_SLACK_ORG_AGENT_MODEL,
  getSlackOrgAgentModel,
  ORG_AGENT_CLAUDE_MODEL,
  ORG_AGENT_DEEPSEEK_FLASH_MODEL,
  ORG_AGENT_DEEPSEEK_PRO_MODEL,
  ORG_AGENT_LUNA_MODEL,
  ORG_AGENT_MODEL_IDS,
  ORG_AGENT_TERRA_MODEL,
  resolveOrgAgentModel,
} from "./modelConfig";

test("exposes every supported company-side LLM", () => {
  assert.deepEqual(ORG_AGENT_MODEL_IDS, [
    ORG_AGENT_DEEPSEEK_FLASH_MODEL,
    ORG_AGENT_DEEPSEEK_PRO_MODEL,
    ORG_AGENT_LUNA_MODEL,
    ORG_AGENT_TERRA_MODEL,
    ORG_AGENT_CLAUDE_MODEL,
    "grok-4.3",
  ]);
});

test("uses GPT-5.6 Luna with xhigh reasoning for web and Slack by default", () => {
  assert.equal(DEFAULT_ORG_AGENT_MODEL, ORG_AGENT_LUNA_MODEL);
  assert.equal(DEFAULT_SLACK_ORG_AGENT_MODEL, ORG_AGENT_LUNA_MODEL);
  assert.equal(DEFAULT_ORG_AGENT_REASONING_EFFORT, "xhigh");

  const original = process.env.SLACK_ORG_AGENT_MODEL;
  const originalShared = process.env.ORG_AGENT_MODEL;
  delete process.env.SLACK_ORG_AGENT_MODEL;
  delete process.env.ORG_AGENT_MODEL;

  try {
    assert.equal(getSlackOrgAgentModel(), ORG_AGENT_LUNA_MODEL);
    assert.equal(resolveOrgAgentModel(null).model, ORG_AGENT_LUNA_MODEL);
  } finally {
    if (original === undefined) delete process.env.SLACK_ORG_AGENT_MODEL;
    else process.env.SLACK_ORG_AGENT_MODEL = original;
    if (originalShared === undefined) delete process.env.ORG_AGENT_MODEL;
    else process.env.ORG_AGENT_MODEL = originalShared;
  }
});

test("allows an approved Slack model override", () => {
  const original = process.env.SLACK_ORG_AGENT_MODEL;
  process.env.SLACK_ORG_AGENT_MODEL = ORG_AGENT_CLAUDE_MODEL;

  try {
    assert.equal(getSlackOrgAgentModel(), ORG_AGENT_CLAUDE_MODEL);
  } finally {
    if (original === undefined) delete process.env.SLACK_ORG_AGENT_MODEL;
    else process.env.SLACK_ORG_AGENT_MODEL = original;
  }
});

test("uses the shared model setting for web and Slack", () => {
  const original = process.env.SLACK_ORG_AGENT_MODEL;
  const originalShared = process.env.ORG_AGENT_MODEL;
  delete process.env.SLACK_ORG_AGENT_MODEL;
  process.env.ORG_AGENT_MODEL = ORG_AGENT_TERRA_MODEL;

  try {
    assert.equal(getSlackOrgAgentModel(), ORG_AGENT_TERRA_MODEL);
    assert.equal(resolveOrgAgentModel(null).model, ORG_AGENT_TERRA_MODEL);
  } finally {
    if (original === undefined) delete process.env.SLACK_ORG_AGENT_MODEL;
    else process.env.SLACK_ORG_AGENT_MODEL = original;
    if (originalShared === undefined) delete process.env.ORG_AGENT_MODEL;
    else process.env.ORG_AGENT_MODEL = originalShared;
  }
});

test("falls back to Luna for an unsupported Slack override", () => {
  const original = process.env.SLACK_ORG_AGENT_MODEL;
  const originalShared = process.env.ORG_AGENT_MODEL;
  process.env.SLACK_ORG_AGENT_MODEL = "not-a-model";
  delete process.env.ORG_AGENT_MODEL;

  try {
    assert.equal(getSlackOrgAgentModel(), ORG_AGENT_LUNA_MODEL);
  } finally {
    if (original === undefined) delete process.env.SLACK_ORG_AGENT_MODEL;
    else process.env.SLACK_ORG_AGENT_MODEL = original;
    if (originalShared === undefined) delete process.env.ORG_AGENT_MODEL;
    else process.env.ORG_AGENT_MODEL = originalShared;
  }
});
