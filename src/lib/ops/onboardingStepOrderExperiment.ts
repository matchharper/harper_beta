import {
  compareOpsAbTestRates,
  makeOpsAbTestRate,
  type OpsAbTestSummary,
  type OpsAbTestVariant,
} from "./abTests";
import {
  CAREER_ONBOARDING_STEP_ORDER_EXPERIMENT,
  CAREER_ONBOARDING_STEP_ORDER_EXPOSURE_EVENT,
  PROFILE_FIRST_VARIANT,
  VISIBILITY_FIRST_VARIANT,
} from "@/lib/career/onboardingStepOrderExperiment";
import type { Json } from "@/types/database.types";

const ONBOARDING_SUBMITTED_EVENT = "career_onboarding_submitted";
const VARIANTS = [PROFILE_FIRST_VARIANT, VISIBILITY_FIRST_VARIANT] as const;
type Variant = (typeof VARIANTS)[number];

export type OnboardingStepOrderLog = {
  created_at: string;
  id: number;
  meta_data: Json | null;
  type: string | null;
  user_id: string | null;
};

type Exposure = {
  at: string;
  id: number;
  variant: Variant;
};

function record(value: Json | null): Record<string, Json | undefined> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function isVariant(value: Json | undefined): value is Variant {
  return value === PROFILE_FIRST_VARIANT || value === VISIBILITY_FIRST_VARIANT;
}

function isAfterExposure(log: OnboardingStepOrderLog, exposure: Exposure) {
  return (
    log.created_at > exposure.at ||
    (log.created_at === exposure.at && log.id > exposure.id)
  );
}

export function buildOnboardingStepOrderExperiment(
  rows: OnboardingStepOrderLog[],
  excludedUserIds: ReadonlySet<string>
): OpsAbTestSummary {
  const exposures = new Map<string, Exposure>();
  const sorted = [...rows].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id
  );

  for (const row of sorted) {
    const userId = String(row.user_id ?? "").trim();
    if (
      !userId ||
      excludedUserIds.has(userId) ||
      exposures.has(userId) ||
      row.type !== CAREER_ONBOARDING_STEP_ORDER_EXPOSURE_EVENT
    ) {
      continue;
    }
    const metadata = record(row.meta_data);
    if (
      metadata?.experiment !== CAREER_ONBOARDING_STEP_ORDER_EXPERIMENT ||
      !isVariant(metadata.variant)
    ) {
      continue;
    }
    exposures.set(userId, {
      at: row.created_at,
      id: row.id,
      variant: metadata.variant,
    });
  }

  const submitted = new Set<string>();
  const choiceByUserId = new Map<
    string,
    "open_to_matches" | "exceptional_only"
  >();
  for (const row of sorted) {
    if (row.type !== ONBOARDING_SUBMITTED_EVENT) continue;
    const userId = String(row.user_id ?? "").trim();
    const exposure = exposures.get(userId);
    if (!exposure || !isAfterExposure(row, exposure)) continue;

    submitted.add(userId);
    if (choiceByUserId.has(userId)) continue;
    const choice = record(row.meta_data)?.profileVisibility;
    if (choice === "open_to_matches" || choice === "exceptional_only") {
      choiceByUserId.set(userId, choice);
    }
  }

  const makeVariant = (
    id: Variant,
    label: string,
    description: string
  ): OpsAbTestVariant => {
    const users = [...exposures.entries()]
      .filter(([, exposure]) => exposure.variant === id)
      .map(([userId]) => userId);
    const submittedUsers = users.filter((userId) => submitted.has(userId));
    const choiceUsers = submittedUsers.filter((userId) =>
      choiceByUserId.has(userId)
    );
    const openToMatchesCount = choiceUsers.filter(
      (userId) => choiceByUserId.get(userId) === "open_to_matches"
    ).length;

    return {
      description,
      id,
      label,
      metrics: [
        {
          format: "count",
          label: "제출 성공 유저",
          value: submittedUsers.length,
        },
        {
          format: "count",
          label: "공개 설정 확인 가능",
          value: choiceUsers.length,
        },
        {
          format: "rate",
          label: "Harper 먼저 공유 선택률",
          value: choiceUsers.length
            ? openToMatchesCount / choiceUsers.length
            : null,
        },
      ],
      primary: makeOpsAbTestRate(submittedUsers.length, users.length),
      sampleCount: users.length,
    };
  };

  const variants: [OpsAbTestVariant, OpsAbTestVariant] = [
    makeVariant(
      PROFILE_FIRST_VARIANT,
      "A · 기존 순서",
      "기회 유형 → 프로필 연결 → 공개 설정"
    ),
    makeVariant(
      VISIBILITY_FIRST_VARIANT,
      "B · 공개 설정 먼저",
      "기회 유형 → 공개 설정 → 프로필 연결"
    ),
  ];
  const observedAt = [...exposures.values()].map((exposure) => exposure.at);
  observedAt.sort();

  return {
    allocation: "유저별 고정 50:50",
    caveat:
      "노출 로그가 있는 유저 중 노출 후 프로필 제출 성공 로그가 남은 비율입니다. 유저는 첫 노출 그룹으로 한 번만 셉니다. 공개 설정 선택률은 제출 성공 로그에 선택값이 기록된 유저만 분모에 포함하며, 기본 선택을 유지한 경우도 포함합니다. 최근 노출 유저는 아직 제출할 시간이 짧을 수 있습니다.",
    conclusion: compareOpsAbTestRates({
      first: variants[0].primary,
      firstVariantId: variants[0].id,
      second: variants[1].primary,
      secondVariantId: variants[1].id,
    }),
    firstObservedAt: observedAt[0] ?? null,
    id: CAREER_ONBOARDING_STEP_ORDER_EXPERIMENT,
    lastObservedAt: observedAt.at(-1) ?? null,
    primaryMetricLabel: "프로필 제출 성공률",
    status: "running",
    title: "Career 온보딩 공개 설정 순서",
    unitLabel: "유저",
    variants,
  };
}
