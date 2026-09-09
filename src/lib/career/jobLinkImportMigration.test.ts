import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260908120000_user_job_link_import.sql",
    import.meta.url
  ),
  "utf8"
);
const route = readFileSync(
  new URL(
    "../../app/api/talent/opportunities/import-url/route.ts",
    import.meta.url
  ),
  "utf8"
);

test("job-link import reuses existing tables and is transactional", () => {
  assert.doesNotMatch(migration, /create\s+table/i);
  assert.match(
    migration,
    /create or replace function public\.import_talent_job_link/i
  );
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(
    migration,
    /grant execute on function public\.import_talent_job_link[\s\S]*to service_role/i
  );
});

test("new user-submitted roles stay outside every ordinary recommendation path", () => {
  assert.match(
    migration,
    /drop constraint if exists talent_opportunity_recommendation_kind_check[\s\S]*add constraint talent_opportunity_recommendation_kind_check[\s\S]*'user_link_import'/i
  );
  assert.match(migration, /'user_submitted'/);
  assert.match(migration, /external_roles_enabled[\s\S]*false/i);
  assert.match(
    migration,
    /coalesce\(new\.kind, ''\) <> 'user_link_import'[\s\S]*role\.source_provider = 'user_submitted'/i
  );
  assert.match(
    migration,
    /create trigger enforce_user_submitted_role_recommendation_isolation_v1/i
  );
});

test("batch imports accept all four history stages with bounded concurrency", () => {
  assert.match(
    migration,
    /p_saved_stage not in \('saved', 'applied', 'connected', 'closed'\)/
  );
  assert.match(route, /const MAX_IMPORT_ITEMS = 20/);
  assert.match(route, /const IMPORT_CONCURRENCY = 4/);
  assert.match(route, /const requestedItems = body\.items/);
  assert.match(route, /Array\.isArray\(requestedItems\)/);
  assert.match(route, /chunk\.map\(async \(item, chunkIndex\)/);
  assert.match(
    migration,
    /update public\.talent_opportunity_recommendation[\s\S]*saved_stage = p_saved_stage,[\s\S]*feedback = 'like',[\s\S]*feedback_at = v_now/
  );
});

test("imported links satisfy the existing saved-position bucket contract", () => {
  assert.match(
    migration,
    /p_saved_stage,[\s\n]*'like',[\s\n]*v_now,[\s\n]*'\[\]'::jsonb/
  );
  assert.match(
    migration,
    /where kind = 'user_link_import'[\s\S]*and feedback is null[\s\S]*and saved_stage in \('saved', 'applied', 'connected', 'closed'\)/
  );
});

test("link imports do not fabricate fit analysis", () => {
  assert.match(
    migration,
    /'\[\]'::jsonb,[\s\n]*'\[\]'::jsonb,[\s\n]*null,[\s\n]*'\{\}'::jsonb,[\s\n]*'\[\]'::jsonb/i
  );
});

test("link imports persist one salary range and omit optional company links and dates", () => {
  assert.match(migration, /p_role->>'salaryRange'/);
  assert.doesNotMatch(
    migration,
    /p_role->>'(?:salaryCurrency|salaryMin|salaryMax|salaryPeriod|postedAt|expiresAt)'/
  );
  assert.doesNotMatch(
    migration,
    /p_workspace->>'(?:companyHomepageUrl|companyLinkedinUrl)'/
  );
});

test("link imports persist the Exa job summary in the existing description summary column", () => {
  assert.match(
    migration,
    /description_summary,[\s\S]*p_role->>'descriptionSummary'/
  );
  assert.doesNotMatch(migration, /create\s+table/i);
});
