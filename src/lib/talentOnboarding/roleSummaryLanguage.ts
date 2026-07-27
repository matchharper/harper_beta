export type RoleSummaryLanguageKey = "en" | "ko";

export type RoleSummaryLanguageValidation = {
  confidentMatch: boolean;
  englishSignalCount: number;
  englishWordCount: number;
  hangulCharCount: number;
  languageKey: RoleSummaryLanguageKey;
  latinCharCount: number;
  reason:
    | "confident_english"
    | "confident_korean"
    | "insufficient_english"
    | "insufficient_korean"
    | "mixed_or_korean"
    | "mixed_or_english";
};

const ENGLISH_SIGNAL_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "build",
  "builds",
  "company",
  "develop",
  "develops",
  "for",
  "from",
  "in",
  "is",
  "of",
  "on",
  "role",
  "that",
  "the",
  "this",
  "to",
  "with",
]);

function characterCount(value: string, pattern: RegExp) {
  return value.match(pattern)?.length ?? 0;
}

export function validateRoleSummaryLanguage(
  value: unknown,
  languageKey: RoleSummaryLanguageKey
): RoleSummaryLanguageValidation {
  const text = typeof value === "string" ? value.trim() : "";
  const hangulCharCount = characterCount(text, /[가-힣]/g);
  const latinCharCount = characterCount(text, /[A-Za-z]/g);
  const englishWords = text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? [];
  const englishSignalCount = englishWords.filter((word) =>
    ENGLISH_SIGNAL_WORDS.has(word)
  ).length;

  if (languageKey === "en") {
    if (
      latinCharCount < 80 ||
      englishWords.length < 15 ||
      englishSignalCount < 3
    ) {
      return {
        confidentMatch: false,
        englishSignalCount,
        englishWordCount: englishWords.length,
        hangulCharCount,
        languageKey,
        latinCharCount,
        reason: "insufficient_english",
      };
    }
    if (
      hangulCharCount > 12 ||
      (hangulCharCount > 0 && latinCharCount < hangulCharCount * 12)
    ) {
      return {
        confidentMatch: false,
        englishSignalCount,
        englishWordCount: englishWords.length,
        hangulCharCount,
        languageKey,
        latinCharCount,
        reason: "mixed_or_korean",
      };
    }
    return {
      confidentMatch: true,
      englishSignalCount,
      englishWordCount: englishWords.length,
      hangulCharCount,
      languageKey,
      latinCharCount,
      reason: "confident_english",
    };
  }

  if (hangulCharCount < 40) {
    return {
      confidentMatch: false,
      englishSignalCount,
      englishWordCount: englishWords.length,
      hangulCharCount,
      languageKey,
      latinCharCount,
      reason: "insufficient_korean",
    };
  }
  if (hangulCharCount * 4 < latinCharCount) {
    return {
      confidentMatch: false,
      englishSignalCount,
      englishWordCount: englishWords.length,
      hangulCharCount,
      languageKey,
      latinCharCount,
      reason: "mixed_or_english",
    };
  }
  return {
    confidentMatch: true,
    englishSignalCount,
    englishWordCount: englishWords.length,
    hangulCharCount,
    languageKey,
    latinCharCount,
    reason: "confident_korean",
  };
}
