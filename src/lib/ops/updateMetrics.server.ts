import "server-only";

import { attributeTalentSignups } from "@/lib/growthTalentGtmReport";
import { listTestTalentAccountEmails } from "@/lib/testAccounts";
import {
  NOT_SUBMITTED_SENTENCE,
  readOnly,
  SUBMITTED_SENTENCE,
} from "@/lib/ops/talentMetricsOverview.server";
import { OVERVIEW_ACCOUNT_SIGN_INS_SQL } from "@/lib/ops/talentMetricsOverview.sql";
import {
  addDays,
  buildOpsUpdateMetrics,
  kstMidnightMs,
  updateMetricsWindow,
  type OpsUpdateMetricsResponse,
  type UpdateMetricsApplicationRow,
  type UpdateMetricsEmailRow,
  type UpdateMetricsLandingRow,
  type UpdateMetricsRecommendationRow,
  type UpdateMetricsSignupRow,
  type UpdateMetricsUnseenReplyRow,
  type UpdateMetricsUsageRow,
} from "@/lib/ops/updateMetrics";
import {
  UPDATE_METRICS_APPLICATIONS_SQL,
  UPDATE_METRICS_EMAILS_SQL,
  UPDATE_METRICS_JOBS_WITHOUT_ROLE_SQL,
  UPDATE_METRICS_LANDING_SQL,
  UPDATE_METRICS_LLM_USAGE_SQL,
  UPDATE_METRICS_RECOMMENDATIONS_SQL,
  UPDATE_METRICS_SIGNUPS_SQL,
  UPDATE_METRICS_UNSEEN_REPLIES_SQL,
} from "@/lib/ops/updateMetrics.sql";

/**
 * Daily values for KST days [from, to], read from 28 days before the earliest tracked deploy when that is earlier
 * (updateMetricsWindow) so every tracked change has its before period.
 */
export async function fetchOpsUpdateMetrics(args: {
  excludedEmails?: string[];
  from: string;
  to: string;
}): Promise<OpsUpdateMetricsResponse> {
  const range = updateMetricsWindow(args);
  const excludedEmails = Array.from(
    new Set(
      // Test accounts never count as talents.
      [...(args.excludedEmails ?? []), ...(await listTestTalentAccountEmails())]
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    )
  ).sort();
  const nowMs = Date.now();
  const startMs = kstMidnightMs(range.from);
  const endMs = Math.min(kstMidnightMs(addDays(range.to, 1)), nowMs);
  if (endMs <= startMs) throw new Error("볼 기간이 없습니다.");
  const window = [new Date(startMs).toISOString(), new Date(endMs).toISOString()];
  const withPeople = [...window, excludedEmails];

  const signupsWithJobs = readOnly<Omit<UpdateMetricsSignupRow, "costUsd3d" | "llmMs3d">>(
    UPDATE_METRICS_SIGNUPS_SQL,
    withPeople
  ).then(async (signups) => {
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
      if (item.jobSlug && slugsWithoutRole.has(item.jobSlug)) jobsWithoutRoleUserIds.add(userId);
    }
    return { jobsWithoutRoleUserIds, signups };
  });

  const [
    { jobsWithoutRoleUserIds, signups },
    usage,
    recommendations,
    landing,
    emails,
    unseenReplies,
    applications,
  ] = await Promise.all([
    signupsWithJobs,
    readOnly<UpdateMetricsUsageRow>(UPDATE_METRICS_LLM_USAGE_SQL, withPeople, {
      enable_indexscan: "off",
    }),
    readOnly<UpdateMetricsRecommendationRow>(UPDATE_METRICS_RECOMMENDATIONS_SQL, withPeople),
    readOnly<UpdateMetricsLandingRow>(UPDATE_METRICS_LANDING_SQL, window),
    readOnly<UpdateMetricsEmailRow>(UPDATE_METRICS_EMAILS_SQL, withPeople),
    readOnly<UpdateMetricsUnseenReplyRow>(UPDATE_METRICS_UNSEEN_REPLIES_SQL, withPeople),
    // The same submitted-sentence rules as /ops/metrics, passed as parameters like there.
    readOnly<UpdateMetricsApplicationRow>(UPDATE_METRICS_APPLICATIONS_SQL, [
      ...withPeople,
      SUBMITTED_SENTENCE,
      NOT_SUBMITTED_SENTENCE,
    ]),
  ]);

  const usageByUser = new Map(usage.map((row) => [row.userId, row]));
  return buildOpsUpdateMetrics({
    applications,
    emails,
    from: range.from,
    jobsWithoutRoleUserIds,
    landing,
    nowMs,
    recommendations,
    signups: signups.map((row) => ({
      ...row,
      costUsd3d: usageByUser.get(row.userId)?.costUsd3d ?? 0,
      llmMs3d: usageByUser.get(row.userId)?.llmMs3d ?? 0,
    })),
    to: range.to,
    unseenReplies,
  });
}
