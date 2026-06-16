import { CANDIDATE_MARK_OPTIONS } from "@/lib/candidateMark";
import {
  OPS_MATCHING_EXCLUDE_NOT_INTERESTED_FILTER_VALUE,
  OPS_MATCHING_NO_TAG_FILTER_VALUE,
} from "@/lib/opsMatchingFilters";

export const MATCHING_REVIEW_STAGE_TAG_BY_STAGE = {
  accepted: "내부:수락",
  archived: "내부:아카이브",
  hold: "내부:보류",
  pending_connection: "내부:연결대기",
  rejected: "내부:거절",
} as const;

const CANDIDATE_TAG_STYLE_BY_VALUE = {
  fit: {
    badgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dotClassName: "bg-emerald-500",
  },
  hold: {
    badgeClassName: "border-amber-200 bg-amber-50 text-amber-700",
    dotClassName: "bg-amber-500",
  },
  not_fit: {
    badgeClassName: "border-red-200 bg-red-50 text-red-700",
    dotClassName: "bg-red-500",
  },
  not_interested: {
    badgeClassName: "border-neutral-200 bg-neutral-100 text-neutral-700",
    dotClassName: "bg-neutral-500",
  },
  top_priority: {
    badgeClassName: "border-sky-200 bg-sky-50 text-sky-700",
    dotClassName: "bg-sky-500",
  },
} as const;

export const MATCHING_TAG_OPTIONS = CANDIDATE_MARK_OPTIONS.map((option) => {
  const style =
    CANDIDATE_TAG_STYLE_BY_VALUE[option.value] ??
    CANDIDATE_TAG_STYLE_BY_VALUE.not_interested;
  return {
    ...style,
    label: option.label,
    statusValue: option.value,
    value: option.label,
  };
});

export const MATCHING_NO_TAG_FILTER_OPTION = {
  badgeClassName: "border-neutral-200 bg-neutral-50 text-neutral-700",
  dotClassName: "bg-neutral-400",
  label: "태그 없음",
  statusValue: "no_tag",
  value: OPS_MATCHING_NO_TAG_FILTER_VALUE,
} as const;

export const MATCHING_EXCLUDE_NOT_INTERESTED_FILTER_OPTION = {
  badgeClassName: "border-neutral-200 bg-neutral-50 text-neutral-700",
  dotClassName: "bg-neutral-500",
  label: "관심없음 제외",
  statusValue: "exclude_not_interested",
  value: OPS_MATCHING_EXCLUDE_NOT_INTERESTED_FILTER_VALUE,
} as const;

export const MATCHING_TAG_FILTER_OPTIONS = [
  MATCHING_EXCLUDE_NOT_INTERESTED_FILTER_OPTION,
  MATCHING_NO_TAG_FILTER_OPTION,
  ...MATCHING_TAG_OPTIONS,
] as const;

const MATCHING_INTERNAL_TAG_OPTIONS = [
  {
    badgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dotClassName: "bg-emerald-500",
    label: MATCHING_REVIEW_STAGE_TAG_BY_STAGE.accepted,
    statusValue: "accepted",
    value: MATCHING_REVIEW_STAGE_TAG_BY_STAGE.accepted,
  },
  {
    badgeClassName: "border-red-200 bg-red-50 text-red-700",
    dotClassName: "bg-red-500",
    label: MATCHING_REVIEW_STAGE_TAG_BY_STAGE.rejected,
    statusValue: "rejected",
    value: MATCHING_REVIEW_STAGE_TAG_BY_STAGE.rejected,
  },
  {
    badgeClassName: "border-amber-200 bg-amber-50 text-amber-700",
    dotClassName: "bg-amber-500",
    label: MATCHING_REVIEW_STAGE_TAG_BY_STAGE.hold,
    statusValue: "hold",
    value: MATCHING_REVIEW_STAGE_TAG_BY_STAGE.hold,
  },
  {
    badgeClassName: "border-sky-200 bg-sky-50 text-sky-700",
    dotClassName: "bg-sky-500",
    label: MATCHING_REVIEW_STAGE_TAG_BY_STAGE.pending_connection,
    statusValue: "pending_connection",
    value: MATCHING_REVIEW_STAGE_TAG_BY_STAGE.pending_connection,
  },
  {
    badgeClassName: "border-neutral-200 bg-neutral-100 text-neutral-700",
    dotClassName: "bg-neutral-500",
    label: MATCHING_REVIEW_STAGE_TAG_BY_STAGE.archived,
    statusValue: "archived",
    value: MATCHING_REVIEW_STAGE_TAG_BY_STAGE.archived,
  },
] as const;

const MATCHING_TAG_DISPLAY_OPTIONS = [
  MATCHING_EXCLUDE_NOT_INTERESTED_FILTER_OPTION,
  MATCHING_NO_TAG_FILTER_OPTION,
  ...MATCHING_TAG_OPTIONS,
  ...MATCHING_INTERNAL_TAG_OPTIONS,
];

export const DEFAULT_MATCHING_TAG_BADGE_CLASS =
  "border-neutral-200 bg-neutral-100 text-neutral-700";
export const DEFAULT_MATCHING_TAG_DOT_CLASS = "bg-neutral-500";

export function getMatchingTagOption(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  return (
    MATCHING_TAG_DISPLAY_OPTIONS.find(
      (option) =>
        option.value === normalized ||
        option.label === normalized ||
        option.statusValue === normalized
    ) ?? null
  );
}

export function getMatchingTagLabel(value: string) {
  return getMatchingTagOption(value)?.label ?? value;
}
