import assert from "node:assert/strict";
import test from "node:test";
import {
  OFFICIAL_JOBS_LAYOUT_ABTEST_A as A,
  OFFICIAL_JOBS_LAYOUT_ABTEST_B as B,
} from "@/lib/officialJobs/experiment";
import { buildLandingLoginEmailType } from "@/lib/landingLogTypes";
import { buildOfficialJobsExperiment } from "./officialJobsExperiment";

test("counts unique exposed browsers and only conversions after exposure in that variant", () => {
  const row = (id: string, variant: string, type: string, second: number) => ({
    local_id: id,
    abtest_type: variant,
    type,
    created_at: `2026-10-01T00:00:${String(second).padStart(2, "0")}Z`,
  });
  const result = buildOfficialJobsExperiment(
    [
      row("a", A, "official_jobs:list_talk_click", 1),
      row("a", A, "official_jobs:list_view", 2),
      row("a", A, "official_jobs:list_view", 3),
      row("a", B, "official_jobs:list_talk_click", 4),
      row("b", B, "official_jobs:job_view:sample-role", 2),
      row("b", B, "official_jobs:talk_click:sample-role", 3),
      row("b", B, "official_jobs:talk_click:sample-role", 4),
      row(
        "b",
        B,
        buildLandingLoginEmailType("candidate@example.com", "official_jobs"),
        5
      ),
      row("internal", B, "official_jobs:list_view", 1),
      row(
        "internal",
        B,
        buildLandingLoginEmailType("internal@example.com", "official_jobs"),
        2
      ),
      row("unexposed", A, "official_jobs:list_talk_click", 1),
    ],
    (email) => email === "internal@example.com"
  );
  assert.equal(result.variants[0].sampleCount, 1);
  assert.equal(result.variants[0].primary.numerator, 0);
  assert.equal(result.variants[1].sampleCount, 1);
  assert.equal(result.variants[1].primary.numerator, 1);
  assert.equal(result.variants[1].metrics[0].value, 1);
});
