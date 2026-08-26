export const OPERATIONAL_OPPORTUNITY_FEEDBACK_REASON = {
  AlreadyApplied: "이미 지원했던 회사/역할입니다.",
  ExpiredPosting: "만료된 공고에요.",
} as const;

export type OperationalOpportunityFeedbackKind =
  | "already_applied"
  | "expired_posting";

const OPERATIONAL_REASON_ENTRIES = [
  {
    kind: "already_applied" as const,
    value: OPERATIONAL_OPPORTUNITY_FEEDBACK_REASON.AlreadyApplied,
  },
  {
    kind: "expired_posting" as const,
    value: OPERATIONAL_OPPORTUNITY_FEEDBACK_REASON.ExpiredPosting,
  },
] as const;

function normalizeReason(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?]+$/g, "")
    .toLowerCase();
}

function parseReasonParts(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as {
      customReason?: unknown;
      selectedOptions?: unknown;
    };
    const selectedOptions = Array.isArray(parsed.selectedOptions)
      ? parsed.selectedOptions
          .map((item) => String(item ?? "").trim())
          .filter(Boolean)
      : [];
    const customReason =
      typeof parsed.customReason === "string" ? parsed.customReason.trim() : "";
    const parts = [...selectedOptions, customReason].filter(Boolean);
    if (parts.length > 0) return parts;
  } catch {
    // Legacy values were stored either as a single reason or ` | `-joined text.
  }

  return raw
    .split(/\s*\|\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function operationalKindForReason(
  reason: string
): OperationalOpportunityFeedbackKind | null {
  const normalized = normalizeReason(reason);
  return (
    OPERATIONAL_REASON_ENTRIES.find(
      (entry) => normalizeReason(entry.value) === normalized
    )?.kind ?? null
  );
}

export function partitionOpportunityFeedbackReasons(
  value: string | null | undefined
) {
  const operationalKinds: OperationalOpportunityFeedbackKind[] = [];
  const operationalReasons: string[] = [];
  const preferenceReasons: string[] = [];

  for (const reason of parseReasonParts(value)) {
    const kind = operationalKindForReason(reason);
    if (kind) {
      if (!operationalKinds.includes(kind)) operationalKinds.push(kind);
      operationalReasons.push(reason);
    } else {
      preferenceReasons.push(reason);
    }
  }

  return {
    hasReason: operationalReasons.length > 0 || preferenceReasons.length > 0,
    isOperationalOnly:
      operationalReasons.length > 0 && preferenceReasons.length === 0,
    operationalKinds,
    operationalReasons,
    preferenceReasons,
  };
}

export function findOperationalOpportunityFeedbackKindsInText(value: unknown) {
  const text = normalizeReason(value);
  return OPERATIONAL_REASON_ENTRIES.filter((entry) =>
    text.includes(normalizeReason(entry.value))
  ).map((entry) => entry.kind);
}
