export const CANDIDATE_MARK_STATUS_VALUES = ["not_fit", "hold", "fit"] as const;

export type CandidateMarkStatus = (typeof CANDIDATE_MARK_STATUS_VALUES)[number];

export type CandidateMarkIconKey = "not_fit" | "hold" | "fit";

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
    value: "not_fit",
    label: "부적합",
    shortLabel: "부적합",
    iconKey: "not_fit",
    textClassName: "text-red-500",
    bgClassName: "bg-red-500/15 ",
    borderClassName: "border-red-500/0",
  },
  {
    value: "hold",
    label: "보류",
    shortLabel: "보류",
    iconKey: "hold",
    textClassName: "text-amber-300",
    bgClassName: "bg-amber-500/15",
    borderClassName: "border-amber-500/0",
  },
  {
    value: "fit",
    label: "적합",
    shortLabel: "적합",
    iconKey: "fit",
    textClassName: "text-emerald-500",
    bgClassName: "bg-emerald-500/15",
    borderClassName: "border-emerald-500/0",
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
  return (
    CANDIDATE_MARK_OPTIONS.find((option) => option.value === status) ?? null
  );
}
