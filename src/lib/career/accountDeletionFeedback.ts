export const ACCOUNT_DELETE_CONFIRMATION = "delete_account";
export const ACCOUNT_DELETION_DETAIL_MAX_LENGTH = 500;

export const ACCOUNT_DELETION_REASON_CODES = [
  "missing_opportunities",
  "recommendation_quality",
  "infrequent_use",
  "difficult_to_use",
  "privacy_concern",
  "new_account",
  "other",
] as const;

export type AccountDeletionReasonCode =
  (typeof ACCOUNT_DELETION_REASON_CODES)[number];

export type AccountDeletionFeedback = {
  detail: string | null;
  reasonCode: AccountDeletionReasonCode | null;
  submissionId: string;
};

const ACCOUNT_DELETION_REASON_CODE_SET = new Set<string>(
  ACCOUNT_DELETION_REASON_CODES
);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseAccountDeletionFeedback(
  value: unknown
): AccountDeletionFeedback | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  const reasonCode =
    typeof record.reasonCode === "string" ? record.reasonCode.trim() : "";
  const submissionId =
    typeof record.submissionId === "string" ? record.submissionId.trim() : "";
  const detail = typeof record.detail === "string" ? record.detail.trim() : "";

  if (reasonCode && !ACCOUNT_DELETION_REASON_CODE_SET.has(reasonCode)) {
    return null;
  }
  if (!UUID_PATTERN.test(submissionId)) return null;
  if (detail.length > ACCOUNT_DELETION_DETAIL_MAX_LENGTH) return null;

  return {
    detail: detail || null,
    reasonCode: reasonCode ? (reasonCode as AccountDeletionReasonCode) : null,
    submissionId,
  };
}
