import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_ORG_AGENT_REASONING_EFFORT,
  DEFAULT_ORG_AGENT_MODEL,
  DEFAULT_SLACK_ORG_AGENT_MODEL,
  getOrgAgentFallbackModel,
  getOrgAgentReasoningEffort,
  getSlackOrgAgentModel,
  migrateOrgAgentModel,
  ORG_AGENT_GEMINI_FLASH_MODEL,
  ORG_AGENT_HAIKU_MODEL,
  ORG_AGENT_TEMPERATURE,
  ORG_AGENT_CLAUDE_MODEL,
  ORG_AGENT_GLM_53_FLASH_MODEL,
  ORG_AGENT_LUNA_MODEL,
  ORG_AGENT_MODEL_IDS,
  ORG_AGENT_SOL_MODEL,
  resolveOrgAgentModel,
} from "./modelConfig";

test("exposes every supported company-side LLM", () => {
  assert.deepEqual(ORG_AGENT_MODEL_IDS, [
    ORG_AGENT_GEMINI_FLASH_MODEL,
    ORG_AGENT_GLM_53_FLASH_MODEL,
    ORG_AGENT_LUNA_MODEL,
    ORG_AGENT_CLAUDE_MODEL,
    ORG_AGENT_HAIKU_MODEL,
    ORG_AGENT_SOL_MODEL,
  ]);
});

test("uses the requested Haiku 5.5 with high reasoning without switching models on failure", () => {
  assert.equal(
    resolveOrgAgentModel(ORG_AGENT_HAIKU_MODEL).model,
    ORG_AGENT_HAIKU_MODEL
  );
  assert.equal(getOrgAgentReasoningEffort(ORG_AGENT_HAIKU_MODEL), "high");
  assert.equal(getOrgAgentFallbackModel(ORG_AGENT_HAIKU_MODEL), null);
});

test("uses Luna as the only company-agent fallback", () => {
  assert.equal(
    getOrgAgentFallbackModel(ORG_AGENT_CLAUDE_MODEL),
    ORG_AGENT_LUNA_MODEL
  );
  assert.equal(
    getOrgAgentFallbackModel(ORG_AGENT_SOL_MODEL),
    null
  );
  assert.equal(getOrgAgentFallbackModel(ORG_AGENT_LUNA_MODEL), null);
});

test("maps the previous DeepSeek selection to GLM", () => {
  assert.equal(
    migrateOrgAgentModel("deepseek/deepseek-v4.1-flash"),
    ORG_AGENT_GLM_53_FLASH_MODEL
  );
  assert.equal(
    resolveOrgAgentModel("deepseek/deepseek-v4.1-flash").model,
    ORG_AGENT_GLM_53_FLASH_MODEL
  );
});

test("uses Gemini 3.8 Flash with medium reasoning for web and Slack by default", () => {
  assert.equal(DEFAULT_ORG_AGENT_MODEL, ORG_AGENT_GEMINI_FLASH_MODEL);
  assert.equal(DEFAULT_SLACK_ORG_AGENT_MODEL, ORG_AGENT_GEMINI_FLASH_MODEL);
  assert.equal(DEFAULT_ORG_AGENT_REASONING_EFFORT, "medium");
  assert.equal(
    getOrgAgentReasoningEffort(ORG_AGENT_GLM_53_FLASH_MODEL),
    "high"
  );
  assert.equal(
    getOrgAgentReasoningEffort(ORG_AGENT_GEMINI_FLASH_MODEL),
    "medium"
  );
  assert.equal(ORG_AGENT_TEMPERATURE, 0.5);
  assert.equal(getOrgAgentFallbackModel(ORG_AGENT_GEMINI_FLASH_MODEL), null);

  const original = process.env.SLACK_ORG_AGENT_MODEL;
  const originalShared = process.env.ORG_AGENT_MODEL;
  delete process.env.SLACK_ORG_AGENT_MODEL;
  delete process.env.ORG_AGENT_MODEL;

  try {
    assert.equal(getSlackOrgAgentModel(), ORG_AGENT_GEMINI_FLASH_MODEL);
    assert.equal(
      resolveOrgAgentModel(null).model,
      ORG_AGENT_GEMINI_FLASH_MODEL
    );
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
  process.env.ORG_AGENT_MODEL = ORG_AGENT_SOL_MODEL;

  try {
    assert.equal(getSlackOrgAgentModel(), ORG_AGENT_SOL_MODEL);
    assert.equal(resolveOrgAgentModel(null).model, ORG_AGENT_SOL_MODEL);
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

test("migrates a saved Terra selection to Sol", () => {
  assert.equal(migrateOrgAgentModel("gpt-5.6-terra"), ORG_AGENT_SOL_MODEL);
  assert.equal(resolveOrgAgentModel("gpt-5.6-terra").model, ORG_AGENT_SOL_MODEL);
});

test("preserves explicit Terra environment overrides", () => {
  const originalSlack = process.env.SLACK_ORG_AGENT_MODEL;
  const originalShared = process.env.ORG_AGENT_MODEL;
  try {
    process.env.ORG_AGENT_MODEL = "gpt-5.6-terra";
    delete process.env.SLACK_ORG_AGENT_MODEL;
    assert.equal(resolveOrgAgentModel(null).model, "gpt-5.6-terra");
    assert.equal(getSlackOrgAgentModel(), "gpt-5.6-terra");
    process.env.SLACK_ORG_AGENT_MODEL = "gpt-5.6-terra";
    assert.equal(getSlackOrgAgentModel(), "gpt-5.6-terra");
    assert.equal(resolveOrgAgentModel(getSlackOrgAgentModel()).model, "gpt-5.6-terra");
    assert.equal(migrateOrgAgentModel(getSlackOrgAgentModel()), "gpt-5.6-terra");
  } finally {
    if (originalSlack === undefined) delete process.env.SLACK_ORG_AGENT_MODEL;
    else process.env.SLACK_ORG_AGENT_MODEL = originalSlack;
    if (originalShared === undefined) delete process.env.ORG_AGENT_MODEL;
    else process.env.ORG_AGENT_MODEL = originalShared;
  }
});
