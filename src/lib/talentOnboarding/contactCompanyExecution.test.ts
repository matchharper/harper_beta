import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("development dispatches contact_company despite a stale local QA scope", async (t) => {
  const { executeTalentTool, getEnabledTalentTools } = await import("./tools");
  const tool = getEnabledTalentTools("chat").find((entry) => entry.name === "contact_company");
  assert.ok(tool?.execute);
  const context = {
    userId: "11111111-1111-4111-8111-111111111111",
    conversationId: "22222222-2222-4222-8222-222222222222",
    userMessageId: 42,
  };
  const input = {
    recommendationId: "fixture-recommendation", acceptIntroduction: true,
    relayContent: "Please review the candidate's approved introduction.",
  };
  // Exercise the real dispatcher without sending a company introduction.
  const execute = t.mock.method(tool as { execute: NonNullable<typeof tool.execute> }, "execute", async () => ({
    ok: true, status: "accepted", modelOutput: "Fixture executor accepted the request.",
  }));
  const directory = await mkdtemp(path.join(tmpdir(), "career-contact-execution-"));
  const previousEnvironment = process.env.NODE_ENV;
  try {
    await mkdir(path.join(directory, ".local"));
    await writeFile(path.join(directory, ".local/career-qa-execution-boundary.json"), JSON.stringify(context));
    t.mock.method(process, "cwd", () => directory);
    Object.assign(process.env, { NODE_ENV: "development" });
    const result = await executeTalentTool({
      channel: "chat", name: "contact_company", logging: false, context, input,
    }) as Record<string, unknown>;
    assert.equal(execute.mock.callCount(), 1);
    assert.deepEqual(execute.mock.calls[0].arguments, [input, { ...context, channel: "chat" }]);
    assert.equal(result.ok, true);
    assert.equal(result.status, "accepted");
    assert.equal(result.modelOutput, "Fixture executor accepted the request.");
  } finally {
    t.mock.restoreAll();
    if (previousEnvironment === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else Object.assign(process.env, { NODE_ENV: previousEnvironment });
    await rm(directory, { recursive: true, force: true });
  }
});
