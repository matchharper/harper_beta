import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const onboardingPage = readFileSync(
  path.resolve(process.cwd(), "src/pages/career/onboarding.tsx"),
  "utf8"
);

test("the onboarding page waits for ingestion before completing submission", () => {
  assert.match(
    onboardingPage,
    /await waitForProfileIngestion\(conversationId\);[\s\S]*completeOnboardingSubmission\(payload\)/
  );
});
