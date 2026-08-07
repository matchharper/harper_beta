import assert from "node:assert/strict";
import test from "node:test";
import {
  getEnabledOrgAgentTools,
  ORG_AGENT_TOOLS,
  isOrgAgentToolName,
} from "@/lib/org/agent/tools";

test("candidate decisions expose LLM-judged context and terminal execution tools", () => {
  assert.equal(isOrgAgentToolName("prepare_candidate_connection"), true);
  const toolNames: string[] = ORG_AGENT_TOOLS.map((item) => item.function.name);

  assert.equal(toolNames.includes("prepare_candidate_connection"), true);
  assert.equal(toolNames.includes("decide_candidate_connection"), true);
  assert.equal(isOrgAgentToolName("decide_candidate_connection"), true);

  const prepare = ORG_AGENT_TOOLS.find(
    (item) => item.function.name === "prepare_candidate_connection"
  );
  const decide = ORG_AGENT_TOOLS.find(
    (item) => item.function.name === "decide_candidate_connection"
  );
  const prepareParameters = prepare?.function.parameters as any;
  const decideParameters = decide?.function.parameters as any;

  assert.deepEqual(prepareParameters.required, [
    "decision",
    "roleId",
    "talentId",
  ]);
  assert.deepEqual(prepareParameters.properties.decision.enum, [
    "accept",
    "decline",
  ]);
  assert.equal("recommendationId" in prepareParameters.properties, false);
  assert.equal("recommendationId" in decideParameters.properties, false);
  assert.equal("confirmed" in decideParameters.properties, false);
  assert.match(
    prepare?.function.description ?? "",
    /judge the user's intent from the meaning of the full conversation/
  );
  assert.match(
    prepare?.function.description ?? "",
    /write any confirmation or clarification yourself/
  );
  assert.match(
    decide?.function.description ?? "",
    /meaning of the current message and relevant conversation/
  );
  assert.doesNotMatch(
    decide?.function.description ?? "",
    /matching prepare_candidate_connection confirmation must have appeared/
  );
});

test("company-side tools separate lifecycle changes from the batch writer", () => {
  const toolNames = ORG_AGENT_TOOLS.map((item) => item.function.name);
  assert.equal(toolNames.includes("get_more_data"), true);
  assert.equal(toolNames.includes("update_data"), true);
  assert.equal(toolNames.includes("change_role_status"), true);
  assert.equal(toolNames.includes("update_company" as any), false);
  assert.equal(toolNames.includes("update_role" as any), false);
  assert.equal(isOrgAgentToolName("get_more_data"), true);
  assert.equal(isOrgAgentToolName("update_data"), true);
  assert.equal(isOrgAgentToolName("change_role_status"), true);

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
  assert.equal(
    changes.items.properties.key.enum.includes("role_status"),
    false
  );

  const changeRoleStatus = ORG_AGENT_TOOLS.find(
    (item) => item.function.name === "change_role_status"
  );
  const statusParameters = changeRoleStatus?.function.parameters as any;
  assert.deepEqual(statusParameters.required, ["roleId", "status"]);
  assert.deepEqual(statusParameters.properties.status.enum, [
    "active",
    "paused",
    "ended",
  ]);
  assert.match(changeRoleStatus?.function.description ?? "", /active \(진행\)/);
  assert.match(changeRoleStatus?.function.description ?? "", /paused \(중단\)/);
  assert.match(changeRoleStatus?.function.description ?? "", /ended \(종료\)/);
  assert.match(
    changeRoleStatus?.function.description ?? "",
    /Candidate processes and connections already in progress remain open/
  );
  assert.match(
    changeRoleStatus?.function.description ?? "",
    /close candidate processes and connections already in progress/
  );
});

test("conversation history uses one bounded scope-and-cursor reader", () => {
  const history = ORG_AGENT_TOOLS.find(
    (item) => item.function.name === "read_conversation_history"
  );
  const parameters = history?.function.parameters as any;

  assert.equal(isOrgAgentToolName("read_conversation_history"), true);
  assert.deepEqual(parameters.required, ["scope", "limit"]);
  assert.deepEqual(parameters.properties.scope.enum, [
    "current_thread",
    "workspace",
  ]);
  assert.equal(parameters.properties.limit.maximum, 30);
  assert.equal(parameters.properties.cursor.maxLength, 500);
  assert.equal("query" in parameters.properties, false);
  assert.match(history?.function.description ?? "", /already stored by Harper/);
  assert.match(history?.function.description ?? "", /not access.*full Slack/);
});

test("read_role documents built-in pipeline stage filter values", () => {
  const readRole = ORG_AGENT_TOOLS.find(
    (item) => item.function.name === "read_role"
  );
  const stageDescription = String(
    (readRole?.function.parameters.properties as any).stage.description
  );

  assert.match(stageDescription, /pending_connection=연결 대기/);
  assert.match(stageDescription, /connected=진행 중/);
  assert.match(stageDescription, /process_stopped=프로세스 종료/);
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

test("company-to-talent relay uses one kind-discriminated tool", () => {
  const enabled: string[] = getEnabledOrgAgentTools().map(
    (item) => item.function.name
  );
  assert.equal(enabled.includes("contact_talent"), true);
  assert.equal(enabled.includes("request_talent_resume"), false);
  assert.equal(isOrgAgentToolName("request_talent_resume"), false);

  const contactTalent = ORG_AGENT_TOOLS.find(
    (item) => item.function.name === "contact_talent"
  );
  const parameters = contactTalent?.function.parameters as any;
  assert.deepEqual(parameters.properties.kind.enum, ["question", "resume"]);
  assert.deepEqual(parameters.required, ["kind", "talentId", "roleId"]);
  assert.match(
    parameters.properties.requestContext.description,
    /Required for kind=question/
  );
  assert.match(
    parameters.properties.requestContext.description,
    /latest user's language/
  );
  assert.match(
    contactTalent?.function.description ?? "",
    /mandatory two-turn candidate-contact flow/
  );
  assert.match(
    contactTalent?.function.description ?? "",
    /Never call it on the initial user turn/
  );
  assert.match(
    contactTalent?.function.description ?? "",
    /nothing has been queued or sent yet/
  );
  assert.match(
    contactTalent?.function.description ?? "",
    /immediately previous assistant message presented that exact confirmation/
  );
  assert.match(
    contactTalent?.function.description ?? "",
    /if there is no resume, request one now/
  );
  assert.match(
    contactTalent?.function.description ?? "",
    /accepted-but-not-delivered state; restate the exact candidate, company, role/
  );
  assert.match(
    contactTalent?.function.description ?? "",
    /Never offer arbitrary rescheduling/
  );

  const changeContact = ORG_AGENT_TOOLS.find(
    (item) => item.function.name === "change_talent_contact"
  );
  const changeParameters = changeContact?.function.parameters as any;
  assert.equal(enabled.includes("change_talent_contact"), true);
  assert.equal(isOrgAgentToolName("change_talent_contact"), true);
  assert.equal(isOrgAgentToolName("cancel_talent_contact"), false);
  assert.deepEqual(changeParameters.required, [
    "action",
    "requestId",
    "talentId",
    "roleId",
  ]);
  assert.deepEqual(changeParameters.properties.action.enum, [
    "cancel",
    "immediate",
  ]);
  assert.match(changeContact?.function.description ?? "", /clearly instructs/);
  assert.match(changeContact?.function.description ?? "", /not authorization/);
  assert.match(
    changeContact?.function.description ?? "",
    /bypasses the standard/
  );
});
