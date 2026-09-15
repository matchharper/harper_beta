import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260915130000_company_talent_ongoing_relays.sql",
  "utf8"
);
const candidateTools = readFileSync(
  "src/lib/talentOnboarding/tools.ts",
  "utf8"
);
const candidateRequestPresentation = readFileSync(
  "src/lib/companyTalentRequests/presentation.ts",
  "utf8"
);
const candidateRequestServer = readFileSync(
  "src/lib/companyTalentRequests/server.ts",
  "utf8"
);
const companyTools = readFileSync("src/lib/org/agent/tools.ts", "utf8");
const deliveryRoute = readFileSync(
  "src/app/api/internal/company-talent-requests/deliver/route.ts",
  "utf8"
);
const companyContext = readFileSync("src/lib/org/agent/context.ts", "utf8");
const careerToolSelection = readFileSync("src/lib/career/llmTools.ts", "utf8");

test("each candidate transmission has an independent durable delivery identity", () => {
  assert.match(
    migration,
    /create table if not exists public\.company_talent_relays/
  );
  assert.match(
    migration,
    /unique \(company_talent_request_id, source_talent_message_id\)/
  );
  assert.match(
    migration,
    /contact_queue_company_talent_relay_delivery_uidx[\s\S]*company_talent_relay_id/
  );
  assert.match(
    migration,
    /jsonb_build_object\('requestId', v_request\.id, 'relayId', v_relay\.id\)[\s\S]*v_request\.role_id,[\s\S]*null,[\s\S]*null,[\s\S]*v_relay\.id/
  );
  assert.match(
    deliveryRoute,
    /idempotencyKey: relayId[\s\S]*finalize_company_talent_relay_delivery_v1/
  );
});

test("the outbox is the only relay delivery-state owner", () => {
  const tableSql =
    migration.match(
      /create table if not exists public\.company_talent_relays \([\s\S]*?\n\);/
    )?.[0] ?? "";
  assert.doesNotMatch(
    tableSql,
    /delivery_body|delivered_at|slack_message_ts|slack_bot_user_id|\bstatus\b|updated_at/
  );
  const bodyWriter =
    migration.match(
      /create or replace function public\.store_company_talent_relay_body_v2[\s\S]*?\n\$\$;/
    )?.[0] ?? "";
  assert.match(bodyWriter, /update public\.contact_queue/);
  assert.doesNotMatch(bodyWriter, /update public\.company_talent_relays/);
});

test("ongoing relay authorization depends on a sent prior contact, not request state", () => {
  const functionSql =
    migration.match(
      /create or replace function public\.create_company_talent_relay_v1[\s\S]*?\n\$\$;/
    )?.[0] ?? "";
  assert.match(functionSql, /company_request_candidate_delivery/);
  assert.match(functionSql, /delivery\.status = 'sent'/);
  assert.match(functionSql, /message\.user_id = p_talent_id/);
  assert.doesNotMatch(functionSql, /v_request\.workflow_status/);
  assert.doesNotMatch(
    functionSql,
    /role\.status|role\.is_expired|expires_at > now/
  );
});

test("company contact and candidate ongoing-relay tools are additive", () => {
  assert.match(companyTools, /enum: \["contact", "question", "resume"\]/);
  assert.match(
    candidateTools,
    /LIST_COMPANY_REQUESTS: "list_company_requests"/
  );
  assert.match(candidateTools, /RELAY_TO_COMPANY: "relay_to_company"/);
  assert.match(
    candidateTools,
    /answered contacts remain valid relay destinations/
  );
  assert.match(
    careerToolSelection,
    /CAREER_CHAT_ONBOARDING_TOOL_NAMES[\s\S]*TALENT_TOOL_NAMES\.LIST_COMPANY_REQUESTS[\s\S]*TALENT_TOOL_NAMES\.RELAY_TO_COMPANY/
  );
  assert.match(
    careerToolSelection,
    /toolName === TALENT_TOOL_NAMES\.RECORD_COMPANY_REQUEST_RESPONSE[\s\S]*activeCompanyTalentRequestMode === "text"[\s\S]*activeCompanyTalentRequestMode === "document"/
  );
});

test("candidate contact list includes the latest relay delivery state", () => {
  assert.match(
    candidateRequestServer,
    /relays:company_talent_relays\(id,created_at,deliveries:contact_queue\(type,status,sent_at,updated_at\)\)/
  );
  assert.match(
    candidateRequestServer,
    /referencedTable: "relays"[\s\S]*\.limit\(1, \{ referencedTable: "relays" \}\)/
  );
  assert.match(
    candidateRequestServer,
    /latestRelayStatus:[\s\S]*normalizeCompanyTalentRelayDeliveryStatus/
  );
  assert.match(
    candidateRequestServer,
    /최근 후보자→회사 relay: \$\{latestRelay\}/
  );
  assert.match(
    candidateTools,
    /latest relay as queued, sent, failed, or cancelled/
  );
});

test("candidate relay replies omit queue and unsupported follow-up promises", () => {
  const responseTool =
    candidateTools.match(
      /\[TALENT_TOOL_NAMES\.RECORD_COMPANY_REQUEST_RESPONSE\]: \{[\s\S]*?\n  \},\n  \[TALENT_TOOL_NAMES\.LIST_COMPANY_REQUESTS\]/
    )?.[0] ?? "";
  const listTool =
    candidateTools.match(
      /\[TALENT_TOOL_NAMES\.LIST_COMPANY_REQUESTS\]: \{[\s\S]*?\n  \},\n  \[TALENT_TOOL_NAMES\.RELAY_TO_COMPANY\]/
    )?.[0] ?? "";
  const relayTool =
    candidateTools.match(
      /\[TALENT_TOOL_NAMES\.RELAY_TO_COMPANY\]: \{[\s\S]*?\n  \},\n  \[TALENT_TOOL_NAMES\.UPDATE_RECOMMENDED_OPPORTUNITY_FEEDBACK\]/
    )?.[0] ?? "";

  for (const tool of [responseTool, listTool, relayTool]) {
    assert.notEqual(tool, "");
    assert.match(tool, /skipCommonAssistantInstruction: true/);
  }
  assert.doesNotMatch(
    `${responseTool}\n${relayTool}\n${candidateRequestPresentation}`,
    /queued_for_company|already_queued|will relay|accepted this message for delivery/i
  );
  assert.match(responseTool, /status=delivered_to_company/);
  assert.match(relayTool, /delivered_to_company/);
});

test("renewed-interest first response keeps its existing state side effect", () => {
  assert.match(
    migration,
    /v_first_response and v_request\.intent = 'candidate_reengagement'[\s\S]*candidate_reengagement_requires_response_recording/
  );
});

test("legacy responses and repeated resume attachments share the relay ledger", () => {
  assert.match(
    migration,
    /insert into public\.company_talent_relays[\s\S]*request\.talent_source_message_id[\s\S]*on conflict \(company_talent_request_id, source_talent_message_id\) do nothing/
  );
  assert.match(
    migration,
    /document_id uuid references public\.talent_documents/
  );
  assert.match(
    migration,
    /create or replace function public\.finalize_company_talent_resume_relay_v1/
  );
  assert.match(
    migration,
    /origin_type[\s\S]*'company_talent_relay'[\s\S]*company_contact_company_delivery/
  );
});

test("contact kind remains structurally consistent with document expectation", () => {
  assert.match(migration, /expects_document = \(contact_kind = 'resume'\)/);
  assert.match(
    migration,
    /case when p_expects_document then 'resume' else 'question' end/
  );
  assert.match(
    migration,
    /record_contact_queue_org_candidate_activity_v1[\s\S]*request\.contact_kind[\s\S]*'requestKind', v_contact_kind/
  );
});

test("delivered relays carry an exact private company-conversation reference", () => {
  assert.match(
    deliveryRoute,
    /candidateRelayRef:[\s\S]*relayId:[\s\S]*requestId:[\s\S]*roleId[\s\S]*talentId/
  );
  assert.match(
    companyContext,
    /candidate_contact_ref\{[\s\S]*talent_id=[\s\S]*role_id=[\s\S]*request_id=[\s\S]*relay_id=/
  );
});
