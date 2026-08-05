import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_ORG_AGENT_MODEL,
  DEFAULT_SLACK_ORG_AGENT_MODEL,
  getSlackOrgAgentModel,
  ORG_AGENT_CLAUDE_MODEL,
  ORG_AGENT_LUNA_MODEL,
} from "./modelConfig";

test("uses Luna for the web company-side LLM by default", () => {
  assert.equal(DEFAULT_ORG_AGENT_MODEL, ORG_AGENT_LUNA_MODEL);
});

test("uses Luna for Slack when no model override is configured", () => {
  const original = process.env.SLACK_ORG_AGENT_MODEL;
  delete process.env.SLACK_ORG_AGENT_MODEL;

  try {
    assert.equal(DEFAULT_SLACK_ORG_AGENT_MODEL, ORG_AGENT_LUNA_MODEL);
    assert.equal(getSlackOrgAgentModel(), ORG_AGENT_LUNA_MODEL);
  } finally {
    if (original === undefined) delete process.env.SLACK_ORG_AGENT_MODEL;
    else process.env.SLACK_ORG_AGENT_MODEL = original;
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

test("falls back to Luna for an unsupported Slack model override", () => {
  const original = process.env.SLACK_ORG_AGENT_MODEL;
  process.env.SLACK_ORG_AGENT_MODEL = "not-a-model";

  try {
    assert.equal(getSlackOrgAgentModel(), ORG_AGENT_LUNA_MODEL);
  } finally {
    if (original === undefined) delete process.env.SLACK_ORG_AGENT_MODEL;
    else process.env.SLACK_ORG_AGENT_MODEL = original;
  }
});
