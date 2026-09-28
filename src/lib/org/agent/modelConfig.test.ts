import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_ORG_AGENT_REASONING_EFFORT,
  DEFAULT_ORG_AGENT_MODEL,
  DEFAULT_SLACK_ORG_AGENT_MODEL,
  getOrgAgentFallbackModel,
  getSlackOrgAgentModel,
  ORG_AGENT_GEMINI_FLASH_MODEL,
  ORG_AGENT_TEMPERATURE,
  ORG_AGENT_CLAUDE_MODEL,
  ORG_AGENT_DEEPSEEK_FLASH_0731_MODEL,
  ORG_AGENT_LUNA_MODEL,
  ORG_AGENT_MODEL_IDS,
  ORG_AGENT_TERRA_MODEL,
  resolveOrgAgentModel,
} from "./modelConfig";

test("exposes every supported company-side LLM", () => {
  assert.deepEqual(ORG_AGENT_MODEL_IDS, [
    ORG_AGENT_GEMINI_FLASH_MODEL,
    ORG_AGENT_DEEPSEEK_FLASH_0731_MODEL,
    ORG_AGENT_LUNA_MODEL,
    ORG_AGENT_TERRA_MODEL,
    ORG_AGENT_CLAUDE_MODEL,
  ]);
});

test("uses Luna as the only company-agent fallback", () => {
  assert.equal(
    getOrgAgentFallbackModel(ORG_AGENT_CLAUDE_MODEL),
    ORG_AGENT_LUNA_MODEL
  );
  assert.equal(
    getOrgAgentFallbackModel(ORG_AGENT_TERRA_MODEL),
    ORG_AGENT_LUNA_MODEL
  );
  assert.equal(getOrgAgentFallbackModel(ORG_AGENT_LUNA_MODEL), null);
});

test("uses Gemini 3.8 Flash with medium reasoning for web and Slack by default", () => {
  assert.equal(DEFAULT_ORG_AGENT_MODEL, ORG_AGENT_GEMINI_FLASH_MODEL);
  assert.equal(DEFAULT_SLACK_ORG_AGENT_MODEL, ORG_AGENT_GEMINI_FLASH_MODEL);
  assert.equal(DEFAULT_ORG_AGENT_REASONING_EFFORT, "medium");
  assert.equal(ORG_AGENT_TEMPERATURE, 0.5);
  assert.equal(getOrgAgentFallbackModel(ORG_AGENT_GEMINI_FLASH_MODEL), null);

  const original = process.env.SLACK_ORG_AGENT_MODEL;
  const originalShared = process.env.ORG_AGENT_MODEL;
  delete process.env.SLACK_ORG_AGENT_MODEL;
  delete process.env.ORG_AGENT_MODEL;

  try {
    assert.equal(getSlackOrgAgentModel(), ORG_AGENT_GEMINI_FLASH_MODEL);
    assert.equal(resolveOrgAgentModel(null).model, ORG_AGENT_GEMINI_FLASH_MODEL);
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

test("uses configured Gemini default for an unsupported Slack override", () => {
  const original = process.env.SLACK_ORG_AGENT_MODEL;
  const originalShared = process.env.ORG_AGENT_MODEL;
  process.env.SLACK_ORG_AGENT_MODEL = "not-a-model";
  delete process.env.ORG_AGENT_MODEL;

  try {
    assert.equal(getSlackOrgAgentModel(), ORG_AGENT_GEMINI_FLASH_MODEL);
  } finally {
    if (original === undefined) delete process.env.SLACK_ORG_AGENT_MODEL;
    else process.env.SLACK_ORG_AGENT_MODEL = original;
    if (originalShared === undefined) delete process.env.ORG_AGENT_MODEL;
    else process.env.ORG_AGENT_MODEL = originalShared;
  }
});
