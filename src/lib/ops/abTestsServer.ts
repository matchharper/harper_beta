import "server-only";
import {
  buildHistoryFeedbackExperiment,
  type HistoryFeedbackLog,
} from "./historyFeedbackExperiment";
import {
  HISTORY_FEEDBACK_VIEW_EVENT,
  HISTORY_FEEDBACK_CLICK_EVENT,
} from "@/lib/career/historyFeedbackExperiment";
import {
  buildExternalRecommendationExperiment,
  selectExternalExperimentRuns,
  type ExternalSurface,
} from "./externalRecommendationExperiment";
import {
  fetchExternalExperimentRuns,
  fetchExternalExperimentOutcomes,
} from "./externalRecommendationExperimentServer";
import { buildOfficialJobsExperiment } from "./officialJobsExperiment";
import { buildLandingStatsExperiment } from "./landingStatsExperiment";
import { fetchLandingStatsExperimentRows } from "./landingStatsExperimentServer";
import {
  buildOnboardingStepOrderExperiment,
  type OnboardingStepOrderLog,
} from "./onboardingStepOrderExperiment";
import { CAREER_ONBOARDING_STEP_ORDER_EXPOSURE_EVENT } from "@/lib/career/onboardingStepOrderExperiment";
import {
  OFFICIAL_JOBS_LAYOUT_ABTEST_A,
  OFFICIAL_JOBS_LAYOUT_ABTEST_B,
} from "@/lib/officialJobs/experiment";

import { isInternalEmail } from "@/lib/internalAccess";
import {
  type OpsAbTestKey,
  type OpsAbTestSummary,
  type OpsAbTestsResponse,
} from "@/lib/ops/abTests";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import type { Database } from "@/types/database.types";

const DAY_MS = 24 * 60 * 60 * 1_000;
const BATCH_SIZE = 1_000;
const USER_ID_CHUNK_SIZE = 300;
const CACHE_TTL_MS = 30_000;
const responseCache = new Map<
  string,
  { expiresAt: number; value: OpsAbTestsResponse }
>();

type LandingLogRow = Pick<
  Database["public"]["Tables"]["landing_logs"]["Row"],
  "abtest_type" | "created_at" | "id" | "local_id" | "type"
>;

function parseDays(value: unknown) {
  if (value === null || value === undefined || value === "") return 30;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return 30;
  return Math.min(180, Math.max(1, parsed));
}

function normalizeExclusionTerms(values: readonly string[]) {
  return Array.from(
    new Set(
      values
        .map((value) =>
          String(value ?? "")
            .trim()
            .toLowerCase()
        )
        .filter(Boolean)
        .slice(0, 50)
    )
  ).sort();
}

function shouldExcludeEmail(email: string | null | undefined, terms: string[]) {
  const normalizedEmail = String(email ?? "")
    .trim()
    .toLowerCase();
  return (
    isInternalEmail(normalizedEmail) ||
    terms.some((term) => normalizedEmail.includes(term))
  );
}

async function fetchOnboardingStepOrderRows(startIso: string) {
  const admin = getTalentSupabaseAdmin();
  const rows: OnboardingStepOrderLog[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await admin
      .from("logs")
      .select("id,user_id,type,created_at,meta_data")
      .in("type", [
        CAREER_ONBOARDING_STEP_ORDER_EXPOSURE_EVENT,
        "career_onboarding_submitted",
      ])
      .gte("created_at", startIso)
      .order("id", { ascending: true })
      .range(from, from + BATCH_SIZE - 1);

    if (error)
      throw new Error(error.message || "온보딩 순서 실험 로그 조회 실패");
    const page = (data ?? []) as OnboardingStepOrderLog[];
    rows.push(...page);
    if (page.length < BATCH_SIZE) break;
    from += BATCH_SIZE;
  }

  return rows;
}

async function fetchLandingRows(startIso: string, abtestTypes: string[]) {
  const admin = getTalentSupabaseAdmin();
  const rows: LandingLogRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await admin
      .from("landing_logs")
      .select("id,local_id,type,created_at,abtest_type")
      .in("abtest_type", abtestTypes)
      .gte("created_at", startIso)
      .order("id", { ascending: true })
      .range(from, from + BATCH_SIZE - 1);

    if (error) throw new Error(error.message || "랜딩 실험 로그 조회 실패");
    const page = (data ?? []) as LandingLogRow[];
    rows.push(...page);
    if (page.length < BATCH_SIZE) break;
    from += BATCH_SIZE;
  }

  return rows;
}

async function fetchExcludedUserIds(
  userIds: string[],
  exclusionTerms: string[]
) {
  const excluded = new Set<string>();
  if (userIds.length === 0) return excluded;

  const admin = getTalentSupabaseAdmin();
  for (let index = 0; index < userIds.length; index += USER_ID_CHUNK_SIZE) {
    const chunk = userIds.slice(index, index + USER_ID_CHUNK_SIZE);
    const { data, error } = await admin
      .from("talent_users")
      .select("user_id,email")
      .in("user_id", chunk);
    if (error) throw new Error(error.message || "실험 유저 조회 실패");

    for (const row of data ?? []) {
      if (shouldExcludeEmail(row.email, exclusionTerms)) {
        excluded.add(row.user_id);
      }
    }
  }

  return excluded;
}

export async function fetchOpsAbTests(args: {
  experiment: OpsAbTestKey;
  days?: unknown;
  externalSurface?: unknown;
  excludedEmails?: readonly string[];
}) {
  const days = parseDays(args.days);
  const externalSurface: ExternalSurface =
    args.externalSurface === "web" ||
    args.externalSurface === "worker" ||
    args.externalSurface === "daily"
      ? args.externalSurface
      : "all";
  const now = Date.now();
  const exclusionTerms = normalizeExclusionTerms(args.excludedEmails ?? []);
  const cacheKey = JSON.stringify({
    experiment: args.experiment,
    days,
    exclusionTerms,
    externalSurface,
  });
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const startIso = new Date(Date.now() - days * DAY_MS).toISOString();
  let experiment: OpsAbTestSummary;
  switch (args.experiment) {
    case "history-feedback": {
      const admin = getTalentSupabaseAdmin();
      const rows: HistoryFeedbackLog[] = [];
      let afterId: number | undefined;
      for (;;) {
        let query = admin
          .from("logs")
          .select("id,user_id,type,created_at,meta_data")
          .in("type", [
            HISTORY_FEEDBACK_VIEW_EVENT,
            HISTORY_FEEDBACK_CLICK_EVENT,
          ])
          .gte("created_at", startIso)
          .lte("created_at", new Date(now).toISOString())
          .order("id", { ascending: true })
          .limit(BATCH_SIZE);
        if (afterId !== undefined) query = query.gt("id", afterId);
        const { data, error } = await query;
        if (error)
          throw new Error(error.message || "피드백 버튼 실험 조회 실패");
        rows.push(...(data ?? []));
        if (!data || data.length < BATCH_SIZE) break;
        afterId = data[data.length - 1].id;
      }
      experiment = buildHistoryFeedbackExperiment(
        rows,
        await fetchExcludedUserIds(
          [
            ...new Set(
              rows.flatMap((row) => (row.user_id ? [row.user_id] : []))
            ),
          ],
          exclusionTerms
        )
      );
      break;
    }
    case "external": {
      const admin = getTalentSupabaseAdmin();
      const endIso = new Date(now).toISOString();
      const runs = await fetchExternalExperimentRuns(
        admin,
        startIso,
        endIso,
        externalSurface
      );
      const excludedUserIds = await fetchExcludedUserIds(
        [...new Set(runs.map((row) => row.talent_id))],
        exclusionTerms
      );
      const selected = selectExternalExperimentRuns({
        runs,
        excludedUserIds,
        surface: externalSurface,
      });
      const outcomes = await fetchExternalExperimentOutcomes(
        admin,
        selected.runs,
        startIso,
        endIso
      );
      experiment = buildExternalRecommendationExperiment({
        runs,
        ...outcomes,
        surface: externalSurface,
        now,
        excludedUserIds,
      });
      break;
    }
    case "jobs":
      experiment = buildOfficialJobsExperiment(
        await fetchLandingRows(startIso, [
          OFFICIAL_JOBS_LAYOUT_ABTEST_A,
          OFFICIAL_JOBS_LAYOUT_ABTEST_B,
        ]),
        (email) => shouldExcludeEmail(email, exclusionTerms)
      );
      break;
    case "landing-stats": {
      const rows = await fetchLandingStatsExperimentRows(
        getTalentSupabaseAdmin(),
        startIso,
        new Date(now).toISOString()
      );
      experiment = buildLandingStatsExperiment({
        ...rows,
        excludedUserIds: await fetchExcludedUserIds(
          [...new Set(rows.signups.map((row) => row.userId))],
          exclusionTerms
        ),
        excludeEmail: (email) => shouldExcludeEmail(email, exclusionTerms),
        now,
      });
      break;
    }
    case "onboarding": {
      const rows = await fetchOnboardingStepOrderRows(startIso);
      const userIds = [
        ...new Set(
          rows.map((row) => String(row.user_id ?? "").trim()).filter(Boolean)
        ),
      ];
      experiment = buildOnboardingStepOrderExperiment(
        rows,
        await fetchExcludedUserIds(userIds, exclusionTerms)
      );
      break;
    }
  }
  const value: OpsAbTestsResponse = {
    days,
    experiments: [experiment],
    generatedAt: new Date().toISOString(),
  };

  if (responseCache.size >= 24) {
    const oldestKey = responseCache.keys().next().value;
    if (oldestKey) responseCache.delete(oldestKey);
  }
  responseCache.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value,
  });
  return value;
}
