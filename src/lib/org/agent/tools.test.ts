import assert from "node:assert/strict";
import test from "node:test";
import {
  getEnabledOrgAgentTools,
  ORG_AGENT_TOOLS,
  isOrgAgentToolName,
} from "@/lib/org/agent/tools";

test("candidate connection tools are paused and not exposed", () => {
  assert.equal(isOrgAgentToolName("prepare_candidate_connection"), false);
  const toolNames: string[] = ORG_AGENT_TOOLS.map((item) => item.function.name);

  assert.equal(toolNames.includes("prepare_candidate_connection"), false);
  assert.equal(toolNames.includes("decide_candidate_connection"), false);
  assert.equal(isOrgAgentToolName("decide_candidate_connection"), false);
});

test("company-side tools expose one optional-data reader and one batch writer", () => {
  const toolNames = ORG_AGENT_TOOLS.map((item) => item.function.name);
  assert.equal(toolNames.includes("get_more_data"), true);
  assert.equal(toolNames.includes("update_data"), true);
  assert.equal(toolNames.includes("update_company" as any), false);
  assert.equal(toolNames.includes("update_role" as any), false);
  assert.equal(isOrgAgentToolName("get_more_data"), true);
  assert.equal(isOrgAgentToolName("update_data"), true);

  const updateData = ORG_AGENT_TOOLS.find(
    (item) => item.function.name === "update_data"
  );
  const changes = (updateData?.function.parameters.properties as any).changes;
  assert.equal(changes.maxItems, 12);
  assert.deepEqual(changes.items.properties.kind.enum, [
    "append",
    "replace",
    "rewrite",
  ]);
});

test("read_talent always returns fixed safe insights without topic selectors", () => {
  const readTalent = ORG_AGENT_TOOLS.find(
    (item) => item.function.name === "read_talent"
  );
  const properties = readTalent?.function.parameters.properties as Record<
    string,
    unknown
  >;

  assert.deepEqual(Object.keys(properties).sort(), [
    "includeProfile",
    "progressLimit",
    "roleId",
    "talentId",
  ]);
  assert.equal("preferenceTopics" in properties, false);
  assert.match(
    readTalent?.function.description ?? "",
    /five safe career insights/
  );
  assert.match(
    readTalent?.function.description ?? "",
    /Compensation is never returned/
  );
});

test("company-to-talent relay tools are enabled", () => {
  const enabled = getEnabledOrgAgentTools().map((item) => item.function.name);
  assert.equal(enabled.includes("contact_talent"), true);
  assert.equal(enabled.includes("request_talent_resume"), true);
});
