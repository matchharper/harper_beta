import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";

const nodeModule = Module as typeof Module & {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalModuleLoad = nodeModule._load;
nodeModule._load = function loadWithServerOnlyStub(
  request: string,
  parent: unknown,
  isMain: boolean
) {
  if (request === "server-only") return {};
  return originalModuleLoad.call(this, request, parent, isMain);
};
const talentToolsPromise = import("./tools").finally(() => {
  nodeModule._load = originalModuleLoad;
});

// Review creation and introduction consent now run through the general tools.
// Their execution boundaries are covered by career/internalApplications/tools.test.ts
// and scripts/localE2e/agentIntroductions.mts.
test("retired priority review cannot be offered or execute database work", async () => {
  const { getOpenAIChatTools, executeTalentTool } = await talentToolsPromise;
  for (const channel of ["chat", "voice"] as const) {
    assert.ok(!getOpenAIChatTools(channel).some(tool => tool.function.name === "internal_role_priority_review"));
  }
  const admin = new Proxy({}, { get: () => assert.fail("A retired tool must never reach the database") });
  await assert.rejects(executeTalentTool({ name: "internal_role_priority_review", input: { roleId: "11111111-1111-4111-8111-111111111111" }, context: { userId: "owner", admin: admin as never }, logging: false }), /Unknown talent tool/);
  const names = getOpenAIChatTools("chat").map(tool => tool.function.name);
  assert.ok(names.includes("apply_to_internal_role"));
  assert.ok(names.includes("contact_company"));
});
