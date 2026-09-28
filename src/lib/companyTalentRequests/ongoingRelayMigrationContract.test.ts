import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const baseMigration = readFileSync(
  "supabase/migrations/20260915130000_company_talent_ongoing_relays.sql",
  "utf8"
);
const mutualMigration = readFileSync(
  "supabase/migrations/20260922190000_mutual_company_talent_relays.sql",
  "utf8"
);
const candidateTools = readFileSync(
  "src/lib/talentOnboarding/tools.ts",
  "utf8"
);
const candidateRequestServer = readFileSync(
  "src/lib/companyTalentRequests/server.ts",
  "utf8"
);
const candidateCopy = readFileSync(
  "src/lib/companyTalentRequests/copy.ts",
  "utf8"
);
const companyTools = readFileSync("src/lib/org/agent/tools.ts", "utf8");
const contactPolicies = readFileSync("src/lib/org/agent/capabilities/policies.ts", "utf8");
const companyToolExecution = readFileSync(
  "src/lib/org/agent/toolExecution.ts",
  "utf8"
);
const deliveryRoute = readFileSync(
  "src/lib/companyTalentRequests/delivery.ts",
  "utf8"
);
const companyContext = readFileSync("src/lib/org/agent/context.ts", "utf8");
const careerToolSelection = readFileSync("src/lib/career/llmTools.ts", "utf8");
const opportunityHistory = readFileSync("src/lib/talentOpportunity.ts", "utf8");

test("relay persistence is recommendation-based while preserving request provenance", () => {
  assert.match(
    mutualMigration,
    /add column if not exists recommendation_id uuid[\s\S]*talent_opportunity_recommendation/
  );
  assert.match(
    mutualMigration,
    /alter column recommendation_id set not null,[\s\S]*alter column company_talent_request_id drop not null/
  );
  assert.match(
    mutualMigration,
    /company_talent_relays_recommendation_created_idx/
  );
  assert.match(
    mutualMigration,
    /company_talent_relays_recommendation_source_uidx/
  );
  assert.match(
    baseMigration,
    /contact_queue_company_talent_relay_delivery_uidx[\s\S]*company_talent_relay_id/
  );
});

test("mutual relay authorization recognizes all durable connection origins", () => {
  const functionSql =
    mutualMigration.match(
      /create or replace function public\.create_company_talent_relay_v2[\s\S]*?\n\$\$;/
    )?.[0] ?? "";
  assert.match(functionSql, /company_request_candidate_delivery/);
  assert.match(functionSql, /intro\.status in \('connecting', 'connected'\)/);
  assert.match(
    functionSql,
    /'내부:연결대기', '내부:연결됨', '내부:최종오퍼'[\s\S]*'내부단계:%'/
  );
  assert.match(
    functionSql,
    /talent_progress[\s\S]*org_stage_change[\s\S]*pending_connection[\s\S]*custom:%/
  );
  assert.match(functionSql, /recommendation\.feedback = 'like'/);
  assert.match(functionSql, /message\.user_id = p_talent_id/);
  assert.doesNotMatch(functionSql, /role\.status|role\.is_expired/);
});

test("Career exposes one general connection reader and one relay writer", () => {
  assert.match(
    candidateTools,
    /READ_COMPANY_CONNECTIONS: "read_company_connections"/
  );
  assert.match(candidateTools, /CONTACT_COMPANY: "contact_company"/);
  assert.match(
    careerToolSelection,
    /CAREER_CHAT_ONBOARDING_TOOL_NAMES[\s\S]*TALENT_TOOL_NAMES\.READ_COMPANY_CONNECTIONS[\s\S]*TALENT_TOOL_NAMES\.CONTACT_COMPANY/
  );
  assert.match(
    candidateRequestServer,
    /company_intro_candidates[\s\S]*talent_opportunity_tag[\s\S]*company_talent_requests[\s\S]*company_talent_relays[\s\S]*talent_progress/
  );
  assert.match(candidateTools, /required: \["connectionId", "relayContent"\]/);
  assert.doesNotMatch(candidateTools, /LIST_COMPANY_REQUESTS/);
});

test("Career waits for immediate delivery without exposing requestId or a pending-send state", () => {
  const relayTool =
    candidateTools.match(
      /\[TALENT_TOOL_NAMES\.CONTACT_COMPANY\]: \{[\s\S]*?\n  \},\n  \[TALENT_TOOL_NAMES\.UPDATE_RECOMMENDED_OPPORTUNITY_FEEDBACK\]/
    )?.[0] ?? "";
  assert.notEqual(relayTool, "");
  assert.match(relayTool, /status=\$\{relay\.status\}/);
  assert.doesNotMatch(
    relayTool,
    /requestId:|relayQueued|Do not say delivery completed/
  );
  assert.match(candidateRequestServer, /await deliverCompanyTalentRelay/);
  assert.match(
    candidateRequestServer,
    /return \{ \.\.\.result, status: "sent" \}/
  );
  assert.match(deliveryRoute, /store_company_talent_relay_body_v2/);
  assert.match(deliveryRoute, /finalize_company_talent_relay_delivery_v1/);
});

test("Request Intro progress is fact-based and bypasses 7/21 fixed progress", () => {
  assert.match(
    opportunityHistory,
    /TalentCompanyRequestIntroProgressFacts[\s\S]*origin: "company_request_intro"/
  );
  assert.match(
    opportunityHistory,
    /args\.item\.opportunityType === OpportunityType\.IntroRequest[\s\S]*return null/
  );
  for (const field of [
    "requestedAt",
    "talentAcceptedAt",
    "latestCompanyContactAt",
    "latestCandidateRelayStatus",
  ]) {
    assert.match(opportunityHistory, new RegExp(`${field}:`));
  }
});

test("contact_talent lets the model choose a verified direct relay reply", () => {
  assert.match(companyTools, /"create_draft",[\s\S]*"send",/);
  assert.match(
    contactPolicies,
    /Decide from the whole conversation whether delivery is authorized/
  );
  assert.match(companyTools, /messageContent:[\s\S]*relayId:/);
  assert.match(
    companyToolExecution,
    /if \(action === "send" && has\(args.input, "relayId"\)\)[\s\S]*fetchCompanyTalentRelayReplyTarget[\s\S]*prepareDirectCandidateMessage[\s\S]*sendCompanyTalentRelayReply/
  );
  assert.match(
    companyToolExecution,
    /candidateMessageSent = sent\.status === "sent"[\s\S]*sent\.status === "queued"[\s\S]*"scheduled"[\s\S]*"not_sent"/
  );
  assert.match(companyTools, /For send provide talentId \+ roleId \+ messageContent, or relayId \+ messageContent/);
  assert.match(
    candidateCopy,
    /validateCompanyContactContext\(args\.requestContext\)/
  );
  const directSendServer =
    candidateRequestServer.match(
      /export async function sendCompanyTalentRelayReply[\s\S]*?\n\}/
    )?.[0] ?? "";
  assert.notEqual(directSendServer, "");
  assert.doesNotMatch(directSendServer, /assertSafeProfessionalQuestion/);
});

test("direct replies retain exact relay context and enforce it in the database", () => {
  const functionSql =
    mutualMigration.match(
      /create or replace function public\.send_company_talent_relay_reply_v1[\s\S]*?\n\$\$;/
    )?.[0] ?? "";
  assert.match(functionSql, /candidateRelayRef,relayId[\s\S]*p_relay_id::text/);
  assert.match(
    functionSql,
    /prior\.conversation_id = v_source_conversation_id/
  );
  assert.match(
    functionSql,
    /in_reply_to_company_talent_relay_id[\s\S]*'deliveryMode', 'immediate'/
  );
  assert.match(functionSql, /pg_advisory_xact_lock/);
  assert.match(
    functionSql,
    /company_request_candidate_delivery[\s\S]*v_delivery_status = 'sent'[\s\S]*then 'sent'/
  );
  assert.match(
    deliveryRoute,
    /candidateRelayRef:[\s\S]*relayId:[\s\S]*recommendationId:[\s\S]*roleId[\s\S]*talentId/
  );
  assert.match(
    companyContext,
    /candidate_contact_ref\{[\s\S]*recommendation_id=[\s\S]*relay_id=/
  );
});
