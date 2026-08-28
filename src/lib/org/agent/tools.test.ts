import assert from "node:assert/strict";
import test from "node:test";
import {
  getEnabledOrgAgentTools,
  ORG_AGENT_TERMINAL_TOOL_NAMES,
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
  assert.deepEqual(prepareParameters.properties.connectionMethod.enum, [
    "intro_email",
    "direct_contact",
    "schedule_interview",
  ]);
  assert.equal(
    prepareParameters.properties.meetingDurationMinutes.multipleOf,
    15
  );
  assert.equal(prepareParameters.properties.meetingDurationMinutes.minimum, 15);
  assert.match(
    prepareParameters.properties.connectionMethod.description,
    /60-minute duration/
  );
  assert.match(
    prepareParameters.properties.connectionMethod.description,
    /\[company\] <> \[candidate\] Intro/
  );
  assert.match(
    prepareParameters.properties.meetingAttendeeEmails.description,
    /requester remains the default organizer/
  );
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
    prepare?.function.description ?? "",
    /Always call it with connectionMethod=direct_contact/
  );
  assert.match(
    prepare?.function.description ?? "",
    /meeting_setup_required.*without asking for approval/
  );
  assert.match(
    decide?.function.description ?? "",
    /current message authorizes all of it/
  );
  assert.match(
    prepare?.function.description ?? "",
    /company-stopped candidate/
  );
  assert.match(decide?.function.description ?? "", /neutral warm introduction/);
  assert.match(
    decide?.function.description ?? "",
    /omitted connectionMethod defaults to intro_email/
  );
  assert.match(decide?.function.description ?? "", /meeting draft/);
  assert.match(decide?.function.description ?? "", /does not contact/);
  assert.match(
    decide?.function.description ?? "",
    /Never proactively offer direct_contact/
  );
  assert.match(
    prepareParameters.properties.connectionMethod.description,
    /default CC introduction/
  );
  assert.doesNotMatch(
    decide?.function.description ?? "",
    /matching prepare_candidate_connection confirmation must have appeared/
  );
});

test("company agent can save the current user's interview availability", () => {
  assert.equal(isOrgAgentToolName("manage_interview_availability"), true);
  assert.equal(
    ORG_AGENT_TERMINAL_TOOL_NAMES.has("manage_interview_availability"),
    true
  );
  const tool = ORG_AGENT_TOOLS.find(
    (item) => item.function.name === "manage_interview_availability"
  );
  const parameters = tool?.function.parameters as any;

  assert.ok(tool);
  assert.equal(parameters.additionalProperties, false);
  assert.equal(parameters.properties.weeklyUpdates.maxItems, 7);
  assert.deepEqual(
    parameters.properties.weeklyUpdates.items.properties.days.items.enum,
    ["1", "2", "3", "4", "5", "6", "7"]
  );
  assert.match(tool?.function.description ?? "", /current company user's own/);
  assert.match(
    tool?.function.description ?? "",
    /never changes another member/
  );
  assert.match(tool?.function.description ?? "", /must be the only tool call/);
});

test("role creation is exposed only on Slack and transfers bounded source context", () => {
  const webNames = getEnabledOrgAgentTools().map((tool) => tool.function.name);
  const slackTools = getEnabledOrgAgentTools("slack");
  const start = slackTools.find(
    (tool) => tool.function.name === "start_role_creation"
  );

  assert.equal(webNames.includes("start_role_creation"), false);
  assert.ok(start);
  const parameters = start.function.parameters as {
    additionalProperties: boolean;
    required: string[];
  };
  assert.deepEqual(parameters.required, ["roleTitle", "contextMessageCount"]);
  const properties = (start?.function.parameters as any).properties;
  assert.equal(properties.contextMessageCount.minimum, 1);
  assert.equal(properties.contextMessageCount.maximum, 12);
  assert.match(start?.function.description ?? "", /exact recent Slack context/);
  assert.match(
    start?.function.description ?? "",
    /exact role title established from the available context/
  );
  assert.match(
    start?.function.description ?? "",
    /Do not ask the user to restate a title that is already clear/
  );
  assert.doesNotMatch(start?.function.description ?? "", /JD URL/);
  assert.doesNotMatch(start?.function.description ?? "", /open_url first/);
  assert.match(properties.roleTitle.description, /available context/);
  assert.match(
    start?.function.description ?? "",
    /automatically continues before the user has to say anything/
  );
  assert.match(
    start?.function.description ?? "",
    /exact required continuation link/
  );
  assert.match(
    start?.function.description ?? "",
    /author the final handoff reply naturally as Harper/
  );
  assert.equal(parameters.additionalProperties, false);
  assert.equal(ORG_AGENT_TERMINAL_TOOL_NAMES.has("start_role_creation"), true);
});

test("company-side tools separate lifecycle changes from the batch writer", () => {
  const toolNames = ORG_AGENT_TOOLS.map((item) => item.function.name);
  assert.equal(toolNames.includes("calibrate_role_hiring_brief"), true);
  assert.equal(toolNames.includes("get_more_data"), true);
  assert.equal(toolNames.includes("update_role_criteria"), true);
  assert.equal(toolNames.includes("update_data"), true);
  assert.equal(toolNames.includes("change_role_status"), true);
  assert.equal(toolNames.includes("update_company" as any), false);
  assert.equal(toolNames.includes("update_role" as any), false);
  assert.equal(isOrgAgentToolName("get_more_data"), true);
  assert.equal(isOrgAgentToolName("update_role_criteria"), true);
  assert.equal(isOrgAgentToolName("update_data"), true);
  assert.equal(isOrgAgentToolName("change_role_status"), true);
  assert.equal(isOrgAgentToolName("calibrate_role_hiring_brief"), true);

  const calibration = ORG_AGENT_TOOLS.find(
    (item) => item.function.name === "calibrate_role_hiring_brief"
  );
  const calibrationParameters = calibration?.function.parameters as any;
  assert.ok(calibration);
  assert.equal(
    ORG_AGENT_TERMINAL_TOOL_NAMES.has("calibrate_role_hiring_brief"),
    true
  );
  assert.deepEqual(calibrationParameters.required, ["roleId"]);
  assert.deepEqual(Object.keys(calibrationParameters.properties), ["roleId"]);
  assert.match(
    calibration?.function.description ?? "",
    /keywords never determine intent/
  );
  assert.match(calibration?.function.description ?? "", /gpt-5\.6-terra/);
  assert.match(calibration?.function.description ?? "", /max reasoning/);
  assert.match(calibration?.function.description ?? "", /GitHub/);
  assert.match(calibration?.function.description ?? "", /batch read tools/);

  const updateRoleCriteria = ORG_AGENT_TOOLS.find(
    (item) => item.function.name === "update_role_criteria"
  );
  const criteriaParameters = updateRoleCriteria?.function.parameters as any;
  assert.deepEqual(criteriaParameters.required, ["roleId"]);
  assert.equal(criteriaParameters.minProperties, 2);
  assert.equal(criteriaParameters.anyOf, undefined);
  assert.equal(criteriaParameters.properties.criteria.minItems, 0);
  assert.equal(criteriaParameters.properties.criteria.maxItems, 6);
  assert.deepEqual(criteriaParameters.properties.criteria.items.required, [
    "name",
    "criteria",
  ]);
  assert.equal(criteriaParameters.properties.edits.minItems, 1);
  assert.equal(criteriaParameters.properties.edits.maxItems, 6);
  assert.deepEqual(
    criteriaParameters.properties.edits.items.properties.operation.enum,
    ["add", "update", "delete"]
  );
  assert.deepEqual(criteriaParameters.properties.edits.items.required, [
    "operation",
  ]);
  assert.match(updateRoleCriteria?.function.description ?? "", /targetName/);
  assert.match(updateRoleCriteria?.function.description ?? "", /exactly one/);
  assert.match(updateRoleCriteria?.function.description ?? "", /0-6/);
  assert.match(updateRoleCriteria?.function.description ?? "", /prefer 2-4/);
  assert.match(
    updateRoleCriteria?.function.description ?? "",
    /one technical-fit dimension/
  );

  const updateData = ORG_AGENT_TOOLS.find(
    (item) => item.function.name === "update_data"
  );
  const changes = (updateData?.function.parameters.properties as any).changes;
  const updateKeys = changes.items.properties.key.enum as string[];
  assert.equal(changes.maxItems, 12);
  assert.deepEqual(changes.items.properties.kind.enum, [
    "append",
    "replace",
    "rewrite",
  ]);
  assert.equal(updateKeys.includes("role_status"), false);
  for (const removed of [
    "company_description",
    "short_description",
    "logo_url",
    "career_url",
    "funding_url",
    "specialities",
    "investors",
    "main_investors",
    "last_funding_round_description",
  ]) {
    assert.equal(updateKeys.includes(removed), false, removed);
  }
  for (const retained of [
    "pitch",
    "homepage_url",
    "linkedin_url",
    "related_links",
  ]) {
    assert.equal(updateKeys.includes(retained), true, retained);
  }

  const changeRoleStatus = ORG_AGENT_TOOLS.find(
    (item) => item.function.name === "change_role_status"
  );
  const statusParameters = changeRoleStatus?.function.parameters as any;
  assert.deepEqual(statusParameters.required, ["roleId", "status"]);
  assert.deepEqual(statusParameters.properties.status.enum, [
    "active",
    "paused",
    "ended",
    "deleted",
  ]);
  assert.match(changeRoleStatus?.function.description ?? "", /active \(진행\)/);
  assert.match(changeRoleStatus?.function.description ?? "", /paused \(중단\)/);
  assert.match(changeRoleStatus?.function.description ?? "", /ended \(종료\)/);
  assert.match(
    changeRoleStatus?.function.description ?? "",
    /deleted \(삭제\)[\s\S]*status=deleted and is_expired=true/
  );
  assert.match(
    changeRoleStatus?.function.description ?? "",
    /Do not reinterpret 종료 as deletion/
  );
  assert.match(
    changeRoleStatus?.function.description ?? "",
    /Candidate processes and connections already in progress remain open/
  );
  assert.match(
    changeRoleStatus?.function.description ?? "",
    /does not atomically close every existing candidate stage or company request/
  );
  assert.doesNotMatch(
    changeRoleStatus?.function.description ?? "",
    /close candidate processes and connections already in progress/
  );
});

test("pipeline management exposes separate terminal structure and candidate movement tools", () => {
  const manage = ORG_AGENT_TOOLS.find(
    (item) => item.function.name === "manage_role_pipeline_stages"
  );
  const move = ORG_AGENT_TOOLS.find(
    (item) => item.function.name === "move_candidate_stage"
  );
  assert.ok(manage);
  assert.ok(move);
  assert.equal(isOrgAgentToolName("manage_role_pipeline_stages"), true);
  assert.equal(isOrgAgentToolName("move_candidate_stage"), true);
  assert.equal(
    ORG_AGENT_TERMINAL_TOOL_NAMES.has("manage_role_pipeline_stages"),
    true
  );
  assert.equal(ORG_AGENT_TERMINAL_TOOL_NAMES.has("move_candidate_stage"), true);

  const manageParameters = manage.function.parameters as any;
  assert.deepEqual(manageParameters.required, ["action", "roleId"]);
  assert.deepEqual(manageParameters.properties.action.enum, [
    "add",
    "rename",
    "delete",
  ]);
  assert.equal(manageParameters.properties.labels.maxItems, 6);
  assert.equal(manageParameters.properties.label.maxLength, 40);
  assert.match(manage.function.description, /no candidate currently occupies/);

  const moveParameters = move.function.parameters as any;
  assert.deepEqual(moveParameters.required, [
    "roleId",
    "talentId",
    "expectedCurrentStageId",
    "targetStageId",
  ]);
  assert.match(move.function.description, /compare-and-set/);
  assert.match(move.function.description, /cannot move.*pending_connection/);
  assert.doesNotMatch(JSON.stringify(moveParameters), /recommendationId/);
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
  const properties = readRole?.function.parameters.properties as any;
  const stageDescription = String(properties.stage.description);

  assert.deepEqual(properties.include.items.enum, [
    "criteria",
    "memory",
    "pipeline",
    "description",
  ]);
  assert.match(stageDescription, /pending_connection=연결 대기/);
  assert.match(stageDescription, /connected=진행 중/);
  assert.match(stageDescription, /process_stopped=프로세스 종료/);
});

test("read_talent accepts up to ten IDs and keeps resume output availability-only", () => {
  const readTalent = ORG_AGENT_TOOLS.find(
    (item) => item.function.name === "read_talent"
  );
  const parameters = readTalent?.function.parameters as any;
  const properties = readTalent?.function.parameters.properties as Record<
    string,
    unknown
  >;

  assert.deepEqual(Object.keys(properties).sort(), [
    "includeProfile",
    "progressLimit",
    "roleId",
    "talentId",
    "talentIds",
  ]);
  assert.equal(parameters.minProperties, 1);
  assert.equal(parameters.anyOf, undefined);
  assert.equal((properties.talentIds as any).minItems, 1);
  assert.equal((properties.talentIds as any).maxItems, 10);
  assert.equal((properties.talentIds as any).uniqueItems, true);
  assert.equal("preferenceTopics" in properties, false);
  assert.match(
    readTalent?.function.description ?? "",
    /five safe career insights/
  );
  assert.match(
    readTalent?.function.description ?? "",
    /Compensation.*never returned/
  );
  assert.match(
    readTalent?.function.description ?? "",
    /raw resume text are never returned/
  );
  assert.match(
    readTalent?.function.description ?? "",
    /includeProfile=false \(the compact default\).*candidate name, email, and headline/
  );
  assert.match(
    readTalent?.function.description ?? "",
    /includeProfile=true.*current profile location, bio, structured work history, education, and extras/
  );
  assert.match(
    String((properties.includeProfile as any).description),
    /false \(default\) returns the compact base/
  );
  assert.match(
    String((properties.includeProfile as any).description),
    /companies or roles worked at, schools or education/
  );
});

test("candidate contact uses one draft-lifecycle tool", () => {
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
  assert.deepEqual(parameters.properties.action.enum, [
    "create_draft",
    "revise_draft",
    "schedule",
    "immediate",
    "cancel",
  ]);
  assert.deepEqual(parameters.properties.kind.enum, ["question", "resume"]);
  assert.deepEqual(parameters.properties.deliveryMode.enum, [
    "standard",
    "immediate",
  ]);
  assert.deepEqual(parameters.required, ["action"]);
  assert.match(
    parameters.properties.requestContext.description,
    /create_draft with kind=question/
  );
  assert.match(
    parameters.properties.requestContext.description,
    /latest user's language/
  );
  assert.match(
    contactTalent?.function.description ?? "",
    /action=create_draft/
  );
  assert.match(
    contactTalent?.function.description ?? "",
    /saves the complete subject and body without queuing delivery/
  );
  assert.match(
    contactTalent?.function.description ?? "",
    /action=revise_draft/
  );
  assert.match(
    contactTalent?.function.description ?? "",
    /action=schedule.*immediately previous Harper message presented the same contactId and revision/
  );
  assert.match(
    contactTalent?.function.description ?? "",
    /Scheduling never regenerates or rewrites copy/
  );
  assert.match(
    contactTalent?.function.description ?? "",
    /standard schedules exactly 20 minutes later at any time of day/
  );
  assert.match(
    parameters.properties.deliveryMode.description,
    /20 minutes after approval at any time of day/
  );
  assert.doesNotMatch(
    contactTalent?.function.description ?? "",
    /within 08:00–20:00 KST/
  );
  assert.match(
    contactTalent?.function.description ?? "",
    /action=immediate.*already queued.*preserves the approved subject and body/
  );
  assert.match(
    contactTalent?.function.description ?? "",
    /already said the request would be sent later, today, or tomorrow, never call schedule again/
  );
  assert.match(
    parameters.properties.contactId.description,
    /schedule, immediate, and cancel/
  );
  assert.match(contactTalent?.function.description ?? "", /action=cancel/);
  assert.match(
    contactTalent?.function.description ?? "",
    /pending draft context or candidate_contact_ref/
  );
  assert.equal(enabled.includes("change_talent_contact"), false);
  assert.equal(isOrgAgentToolName("change_talent_contact"), false);
  assert.equal(isOrgAgentToolName("cancel_talent_contact"), false);
});

test("candidate connection execution declares the server confirmation gate", () => {
  const decision = ORG_AGENT_TOOLS.find(
    (item) => item.function.name === "decide_candidate_connection"
  );

  assert.match(
    decision?.function.description ?? "",
    /immediately previous Harper message asked for approval/
  );
  assert.match(
    decision?.function.description ?? "",
    /server verifies that adjacency.*confirmation_required/
  );
  assert.match(
    decision?.function.description ?? "",
    /never after meeting_setup_required/
  );
});
