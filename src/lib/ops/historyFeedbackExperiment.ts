import {
  compareOpsAbTestRates,
  makeOpsAbTestRate,
  type OpsAbTestSummary,
  type OpsAbTestVariant,
} from "./abTests";
import type { Json } from "@/types/database.types";

// Ended 2026-11-19: every user now sees A (thumbs). The constants and
// allocation stay here only to read the logs collected during the experiment.
export const HISTORY_FEEDBACK_EXPERIMENT = "career_history_feedback_actions_v1";
export const HISTORY_FEEDBACK_VIEW_EVENT =
  "career_history_feedback_actions_viewed";
export const HISTORY_FEEDBACK_CLICK_EVENT =
  "career_history_feedback_actions_clicked";

export type HistoryFeedbackVariant = "thumbs" | "save_hide";

export function assignHistoryFeedbackVariant(
  userId?: string | null
): HistoryFeedbackVariant {
  const normalized = userId?.trim().toLowerCase();
  if (!normalized) return "thumbs";
  let hash = 0x811c9dc5;
  const input = `${HISTORY_FEEDBACK_EXPERIMENT}:${normalized}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0 < 0x80000000 ? "thumbs" : "save_hide";
}

export type HistoryFeedbackLog = {
  user_id: string | null;
  type: string | null;
  created_at: string;
  meta_data: Json | null;
};

export function buildHistoryFeedbackExperiment(
  rows: HistoryFeedbackLog[],
  excludedUserIds: ReadonlySet<string> = new Set()
): OpsAbTestSummary {
  const views = new Map<string, HistoryFeedbackVariant>();
  const feedback = new Set<string>();
  const observed: string[] = [];
  for (const row of rows) {
    const meta = row.meta_data;
    if (
      !row.user_id ||
      excludedUserIds.has(row.user_id) ||
      !meta ||
      typeof meta !== "object" ||
      Array.isArray(meta) ||
      meta.experiment !== HISTORY_FEEDBACK_EXPERIMENT ||
      typeof meta.opportunityId !== "string" ||
      !meta.opportunityId
    )
      continue;
    const variant = assignHistoryFeedbackVariant(row.user_id);
    if (meta.variant !== variant) continue;
    const key = `${row.user_id}:${meta.opportunityId}`;
    if (row.type === HISTORY_FEEDBACK_VIEW_EVENT) {
      views.set(key, variant);
    } else if (
      row.type === HISTORY_FEEDBACK_CLICK_EVENT &&
      (meta.feedback === "positive" || meta.feedback === "negative")
    ) {
      feedback.add(key);
    } else continue;
    observed.push(row.created_at);
  }

  const makeVariant = (
    id: HistoryFeedbackVariant,
    label: string
  ): OpsAbTestVariant => {
    const keys = [...views]
      .filter(([, variant]) => variant === id)
      .map(([key]) => key);
    const primary = makeOpsAbTestRate(
      keys.filter((key) => feedback.has(key)).length,
      keys.length
    );
    return {
      id,
      label,
      description: "",
      sampleCount: keys.length,
      primary,
      metrics: [],
      summaryMetrics: [
        { label: "열람 수", format: "count", value: primary.denominator },
        {
          label: "피드백 버튼 클릭 수",
          format: "count",
          value: primary.numerator,
        },
        {
          label: "열람 대비 버튼 클릭",
          format: "rate",
          value: primary.rate,
          description:
            "선택 기간에 새 외부 공고의 상세를 열람하고 피드백 버튼을 클릭한 공고 수 ÷ 열람한 공고 수. 채팅·메일로 남긴 피드백은 제외하며, 같은 사용자·공고는 한 번만 집계합니다.",
        },
      ],
    };
  };
  observed.sort();
  const variants: OpsAbTestSummary["variants"] = [
    makeVariant("thumbs", "A · 따봉"),
    makeVariant("save_hide", "B · 숨기기 / 저장"),
  ];
  return {
    id: HISTORY_FEEDBACK_EXPERIMENT,
    title: "외부 공고 피드백 버튼",
    allocation: "A · 따봉 100%",
    caveat:
      "2026-11-19에 A로 확정하고 실험을 종료했습니다. 종료 전에 기록된 열람·클릭만 집계합니다. 같은 유저의 여러 공고가 함께 집계되므로 신뢰구간은 실제보다 좁게 나올 수 있습니다.",
    conclusion: compareOpsAbTestRates({
      first: variants[0].primary,
      firstVariantId: variants[0].id,
      second: variants[1].primary,
      secondVariantId: variants[1].id,
    }),
    firstObservedAt: observed[0] ?? null,
    lastObservedAt: observed.at(-1) ?? null,
    primaryMetricLabel: "열람 대비 버튼 클릭",
    metricLayout: "summary",
    status: "ended",
    unitLabel: "공고",
    variants,
  };
}
