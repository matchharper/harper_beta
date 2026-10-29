import {
  assignHistoryFeedbackVariant,
  HISTORY_FEEDBACK_EXPERIMENT,
  HISTORY_FEEDBACK_VIEW_EVENT,
  HISTORY_FEEDBACK_SAVED_EVENT,
  type HistoryFeedbackVariant,
} from "../career/historyFeedbackExperiment";
import {
  makeOpsAbTestRate,
  type OpsAbTestSummary,
  type OpsAbTestVariant,
} from "./abTests";
import type { Json } from "@/types/database.types";

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
      row.type === HISTORY_FEEDBACK_SAVED_EVENT &&
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
        { label: "피드백 수", format: "count", value: primary.numerator },
        {
          label: "열람 대비 피드백",
          format: "rate",
          value: primary.rate,
          description:
            "선택 기간에 새 외부 공고의 상세를 열람하고 긍정·부정 피드백을 저장한 공고 수 ÷ 열람한 공고 수. 같은 사용자·공고는 한 번만 집계합니다.",
        },
      ],
    };
  };
  observed.sort();
  return {
    id: HISTORY_FEEDBACK_EXPERIMENT,
    title: "외부 공고 피드백 버튼",
    allocation: "유저별 고정 50:50",
    caveat: "",
    conclusion: {
      state: "descriptive",
      confidenceHigh: null,
      confidenceLow: null,
      delta: null,
      leaderVariantId: null,
      observedLeaderVariantId: null,
    },
    firstObservedAt: observed[0] ?? null,
    lastObservedAt: observed.at(-1) ?? null,
    primaryMetricLabel: "열람 대비 피드백",
    metricLayout: "summary",
    status: views.size ? "running" : "awaiting_data",
    unitLabel: "공고",
    variants: [
      makeVariant("thumbs", "A · 따봉"),
      makeVariant("save_hide", "B · 숨기기 / 저장"),
    ],
  };
}
