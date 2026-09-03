import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260901130000_company_talent_requests_active_pipeline.sql",
  "utf8"
);
const deliveryRoute = readFileSync(
  "src/app/api/internal/company-talent-requests/deliver/route.ts",
  "utf8"
);

test("candidate requests remain available throughout active company stages", () => {
  assert.match(
    migration,
    /company_talent_request_target_is_active_v1[\s\S]*내부:연결대기[\s\S]*내부:연결됨[\s\S]*내부:최종오퍼[\s\S]*내부단계:%/
  );
  assert.match(
    migration,
    /schedule_company_talent_request_v1[\s\S]*company_talent_request_target_is_active_v1/
  );
  assert.match(migration, /company_talent_request_target_not_active/);
  assert.doesNotMatch(
    migration,
    /message = 'company_talent_request_stage_not_pending'/
  );
  assert.match(
    deliveryRoute,
    /company_talent_request_target_is_active_v1/
  );
  assert.doesNotMatch(
    deliveryRoute,
    /company_talent_request_stage_is_pending_v1/
  );
});

test("the legacy stage helper delegates to the active-target contract", () => {
  assert.match(
    migration,
    /company_talent_request_stage_is_pending_v1[\s\S]*select public\.company_talent_request_target_is_active_v1\(p_request_id\)/
  );
});
