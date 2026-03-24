export const CANDIDATE_MARK_STATUS_VALUES = [
  "excluded",
  "not_fit",
  "hold",
  "fit",
] as const;

export type CandidateMarkStatus =
  (typeof CANDIDATE_MARK_STATUS_VALUES)[number];

export type CandidateMarkIconKey =
  | "excluded"
  | "not_fit"
  | "hold"
  | "fit";

export type CandidateMarkMeta = {
  value: CandidateMarkStatus;
  label: string;
  shortLabel: string;
  iconKey: CandidateMarkIconKey;
  textClassName: string;
  bgClassName: string;
  borderClassName: string;
};

export type CandidateMarkRecord = {
  candidId: string;
  status: CandidateMarkStatus;
  createdAt: string | null;
  updatedAt: string | null;
};

export const CANDIDATE_MARK_OPTIONS: CandidateMarkMeta[] = [
  {
    value: "excluded",
    label: "제외",
    shortLabel: "제외",
    iconKey: "excluded",
    textClassName: "text-red-300",
    bgClassName: "bg-red-500/15",
    borderClassName: "border-red-500/25",
  },
  {
    value: "not_fit",
    label: "부적합",
    shortLabel: "부적합",
    iconKey: "not_fit",
    textClassName: "text-orange-300",
    bgClassName: "bg-orange-500/15",
    borderClassName: "border-orange-500/25",
  },
  {
    value: "hold",
    label: "보류",
    shortLabel: "보류",
    iconKey: "hold",
    textClassName: "text-amber-300",
    bgClassName: "bg-amber-500/15",
    borderClassName: "border-amber-500/25",
  },
  {
    value: "fit",
    label: "적합",
    shortLabel: "적합",
    iconKey: "fit",
    textClassName: "text-emerald-300",
    bgClassName: "bg-emerald-500/15",
    borderClassName: "border-emerald-500/25",
  },
];

export function isCandidateMarkStatus(
  value: unknown
): value is CandidateMarkStatus {
  return (
    typeof value === "string" &&
    CANDIDATE_MARK_STATUS_VALUES.includes(value as CandidateMarkStatus)
  );
}

export function getCandidateMarkMeta(
  status?: CandidateMarkStatus | null
): CandidateMarkMeta | null {
  if (!status) return null;
  return CANDIDATE_MARK_OPTIONS.find((option) => option.value === status) ?? null;
}
