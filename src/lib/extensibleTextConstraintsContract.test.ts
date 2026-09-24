import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260924063038_relax_extensible_text_value_constraints.sql",
    import.meta.url
  ),
  "utf8"
);

const removedChecks = [
  "run_variants_variant_check",
  "official_jobs_employment_type_check",
  "official_job_events_event_type_check",
  "company_talent_requests_response_disposition_check",
  "jobposting_company_identity_provider_check",
  "opportunity_source_registry_access_mode_check",
  "opportunity_source_document_status_check",
  "opportunity_source_document_type_check",
] as const;

test("extensible and legacy text fields no longer duplicate finite vocabularies", () => {
  for (const constraint of removedChecks) {
    assert.match(
      migration,
      new RegExp(`drop constraint if exists ${constraint}`)
    );
  }
});

test("workflow, authorization, privacy, and relational checks stay out of scope", () => {
  const protectedChecks = [
    "contact_queue_status_check",
    "company_user_workspace_authority_check",
    "talent_setting_profile_visibility_check",
    "talent_setting_status_check",
    "talent_opportunity_fit_label_check",
    "jobposting_company_identity_key_check",
    "opportunity_source_registry_priority_check",
    "opportunity_source_registry_ttl_check",
  ] as const;

  for (const constraint of protectedChecks) {
    assert.doesNotMatch(migration, new RegExp(constraint));
  }
});
