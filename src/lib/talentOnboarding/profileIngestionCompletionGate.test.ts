import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const onboardingRoute = readFileSync(
  path.resolve(process.cwd(), "src/app/api/talent/onboarding/start/route.ts"),
  "utf8"
);
const onboardingPage = readFileSync(
  path.resolve(process.cwd(), "src/pages/career/onboarding.tsx"),
  "utf8"
);
const statusMigration = readFileSync(
  path.resolve(
    process.cwd(),
    "supabase/migrations/20260812110000_track_talent_profile_ingestion.sql"
  ),
  "utf8"
);

test("the server marks ingestion completed only after profile ingestion returns", () => {
  const ingestionCall = onboardingRoute.indexOf(
    "await ingestTalentProfileFromLinkedin"
  );
  const completedWrite = onboardingRoute.indexOf(
    'profile_ingestion_status: "completed"'
  );

  assert.ok(ingestionCall >= 0);
  assert.ok(completedWrite > ingestionCall);
});

test("the onboarding page waits for ingestion before completing submission", () => {
  assert.match(
    onboardingPage,
    /await waitForProfileIngestion\(conversationId\);[\s\S]*completeOnboardingSubmission\(payload\)/
  );
});

test("ingestion status columns do not restrict generated status values", () => {
  assert.match(statusMigration, /profile_ingestion_status text/i);
  assert.doesNotMatch(statusMigration, /check\s*\(/i);
  assert.doesNotMatch(statusMigration, /create unique index/i);
});
