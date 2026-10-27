import { asObject, EmailPermanentError, type EmailRow } from "./types";

export const OPS_EMAIL_TEST_KIND = "ops_email_test";
export const isOpsEmailTest = (job: EmailRow) => job.kind === OPS_EMAIL_TEST_KIND;

// Only the authenticated Ops endpoint creates this envelope. Webhook input
// cannot set job.kind or copy arbitrary metadata into a job.
export function opsEmailTestInput(job: EmailRow) {
  if (!isOpsEmailTest(job)) return null;
  const test = asObject(asObject(job.metadata).opsEmailTest);
  const email = asObject(test.email);
  if (!test.actorId || !job.talent_id || !job.conversation_id ||
      typeof email.text !== "string" || typeof email.from !== "string")
    throw new EmailPermanentError("Invalid Ops email test envelope");
  return email;
}

// These executors read account/public facts or save owned documents/preparation.
// Other mutations can enqueue company updates, matching or future contact; a
// transport-only dry run cannot prevent those later deliveries.
const ACCOUNT_LOCAL_TOOLS = new Set([
  "read_talent_activity_events", "read_recommended_opportunities",
  "get_internal_roles", "get_role_context", "open_url", "list_documents",
  "read_document", "read_talent_context", "read_company_connections",
  "generate_resume", "simulate_application",
  "manage_application_suggestions", "ready_for_role", "manage_simulation_session",
  "manage_career_coaching_activity",
]);

export function opsEmailTestToolBlock(job: EmailRow, name: string) {
  if (!isOpsEmailTest(job) || ACCOUNT_LOCAL_TOOLS.has(name)) return null;
  return {
    ok: false,
    error: "ops_email_test_external_effect_disabled",
    reason: "This Ops email test can read the account and save real documents and application preparation. Email delivery, company contact, application submission, and changes that can schedule matching or contact are disabled. This action was not executed; do not describe it as attempted or completed.",
  };
}
