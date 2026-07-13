const UNKNOWN_COMPANY_DATA_TEXT = new Set([
  "unknown",
  "unknown undisclosed",
  "not available",
  "not applicable",
  "not disclosed",
  "n a",
  "na",
  "none",
  "null",
  "undisclosed",
  "미상",
  "알 수 없음",
  "알수 없음",
  "확인 불가",
  "비공개",
]);

export const getKnownCompanyDataText = (value: string | null | undefined) => {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  const normalized = text
    .toLowerCase()
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[()[\]{}.,:;!?]+/g, " ")
    .replace(/[-_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return UNKNOWN_COMPANY_DATA_TEXT.has(normalized) ? "" : text;
};

const FUNDING_STAGE_KEYWORD_PATTERNS: Array<{
  label: string;
  patterns: RegExp[];
}> = [
  {
    label: "Post-IPO",
    patterns: [
      /\bpost\s*[- ]?\s*ipo\b/i,
      /\bpost\s*[- ]?\s*initial\s+public\s+offering\b/i,
    ],
  },
  {
    label: "Pre-IPO",
    patterns: [
      /\bpre\s*[- ]?\s*ipo\b/i,
      /\bpre\s*[- ]?\s*initial\s+public\s+offering\b/i,
    ],
  },
  {
    label: "IPO",
    patterns: [/\bipo\b/i, /\binitial\s+public\s+offering\b/i],
  },
  {
    label: "Pre-Seed",
    patterns: [/\bpre\s*[- ]?\s*seed\b/i],
  },
];

export const parseFundingStageLabel = (
  value: string | null | undefined
) => {
  const text = getKnownCompanyDataText(value);
  if (!text) return "";

  const normalized = text
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  for (const stage of FUNDING_STAGE_KEYWORD_PATTERNS) {
    if (stage.patterns.some((pattern) => pattern.test(normalized))) {
      return stage.label;
    }
  }

  const seriesMatch = normalized.match(
    /\bseries\s*[-:]?\s*([a-z]{1,2})(?:\s*[-.]?\s*\d+)?(?=\b|[\s,.)/+&-])/i
  );
  if (seriesMatch?.[1]) {
    return `Series ${seriesMatch[1].toUpperCase()}`;
  }

  if (/\bseed\b/i.test(normalized)) {
    return "Seed";
  }

  return "";
};
