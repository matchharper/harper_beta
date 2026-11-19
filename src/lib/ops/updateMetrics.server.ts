import "server-only";

import { attributeTalentSignups } from "@/lib/growthTalentGtmReport";
import { listTestTalentAccountEmails } from "@/lib/testAccounts";
import { readOnly } from "@/lib/ops/talentMetricsOverview.server";
import { OVERVIEW_ACCOUNT_SIGN_INS_SQL } from "@/lib/ops/talentMetricsOverview.sql";
import {
  buildOpsUpdateMetrics,
  buildUpdateMetricsBuckets,
  kstMidnightMs,
  type OpsUpdateMetricsResponse,
  type UpdateMetricsLandingRow,
  type UpdateMetricsRecommendationRow,
  type UpdateMetricsSignupRow,
} from "@/lib/ops/updateMetrics";
import {
  UPDATE_METRICS_JOBS_WITHOUT_ROLE_SQL,
  UPDATE_METRICS_LANDING_SQL,
  UPDATE_METRICS_RECOMMENDATIONS_SQL,
  UPDATE_METRICS_SIGNUPS_SQL,
} from "@/lib/ops/updateMetrics.sql";

const CACHE_TTL_MS = 2 * 60 * 1_000;
const RESPONSE_CACHE_LIMIT = 8;
const responseCache = new Map<
  string,
  { expiresAt: number; value: OpsUpdateMetricsResponse }
>();

export async function fetchOpsUpdateMetrics(args: {
  deployedOn: string;
  excludedEmails?: string[];
}): Promise<OpsUpdateMetricsResponse> {
  const deployedAtMs = kstMidnightMs(args.deployedOn);
  const excludedEmails = Array.from(
    new Set(
      // Test accounts never count as talents.
      [...(args.excludedEmails ?? []), ...(await listTestTalentAccountEmails())]
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    )
  ).sort();
  const cacheKey = JSON.stringify({ deployedOn: args.deployedOn, excludedEmails });
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const nowMs = Date.now();
  const buckets = buildUpdateMetricsBuckets(deployedAtMs, nowMs);
  const first = buckets[0];
  const last = buckets.at(-1);
  if (!first || !last) throw new Error("비교할 기간이 없습니다.");
  const boundaries = [first.start, ...buckets.map((bucket) => bucket.end)];
  const window = [first.start, last.end];

  const signupsWithJobs = readOnly<UpdateMetricsSignupRow>(UPDATE_METRICS_SIGNUPS_SQL, [
    ...window,
    excludedEmails,
  ]).then(async (signups) => {
    const [attribution, jobsWithoutRole] = await Promise.all([
      attributeTalentSignups({
        excludedEmails,
        readAccountSignIns: ({ emails, endIso, startIso }) =>
          readOnly<{ created_at: string; local_id: string | null; type: string }>(
            OVERVIEW_ACCOUNT_SIGN_INS_SQL,
            [emails, startIso, endIso]
          ),
        signups: signups.map((row) => ({
          at: new Date(row.signedUpAt).toISOString(),
          userId: row.userId,
        })),
      }),
      readOnly<{ slug: string }>(UPDATE_METRICS_JOBS_WITHOUT_ROLE_SQL, []),
    ]);
    const slugsWithoutRole = new Set(jobsWithoutRole.map((job) => job.slug));
    const jobsWithoutRoleUserIds = new Set<string>();
    for (const [userId, item] of attribution) {
      if (item.jobSlug && slugsWithoutRole.has(item.jobSlug)) {
        jobsWithoutRoleUserIds.add(userId);
      }
    }
    return { jobsWithoutRoleUserIds, signups };
  });

  const [{ jobsWithoutRoleUserIds, signups }, recommendations, landing] =
    await Promise.all([
      signupsWithJobs,
      readOnly<UpdateMetricsRecommendationRow>(UPDATE_METRICS_RECOMMENDATIONS_SQL, [
        ...window,
        excludedEmails,
        boundaries,
      ]),
      readOnly<UpdateMetricsLandingRow>(UPDATE_METRICS_LANDING_SQL, window),
    ]);

  const value = buildOpsUpdateMetrics({
    deployedAtMs,
    jobsWithoutRoleUserIds,
    landing,
    nowMs,
    recommendations,
    signups,
  });
  if (responseCache.size >= RESPONSE_CACHE_LIMIT) {
    const oldestKey = responseCache.keys().next().value;
    if (oldestKey) responseCache.delete(oldestKey);
  }
  responseCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}
