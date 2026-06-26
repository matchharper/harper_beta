export type CareerPromptLocale = "ko" | "en";

export function parseCareerPromptLocale(
  value: unknown
): CareerPromptLocale | null {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");

  if (normalized === "en" || normalized.startsWith("en-")) return "en";
  if (normalized === "ko" || normalized.startsWith("ko-")) return "ko";
  return null;
}

export function normalizeCareerPromptLocale(
  value: unknown
): CareerPromptLocale {
  return parseCareerPromptLocale(value) ?? "ko";
}

export function getCareerPromptLanguageName(value: unknown) {
  return normalizeCareerPromptLocale(value) === "en" ? "English" : "Korean";
}

export function getCareerPromptToneRule(value: unknown) {
  return normalizeCareerPromptLocale(value) === "en"
    ? "!Most Important! Use natural, warm, professional English. No matter what language the prompt or examples below are written in, always output in English."
    : "!Most Important! Use polite Korean 존댓말. 아래에 어떤 다른 언어로 프롬프트 혹은 예시가 들어가더라도, 꼭 한글로 출력해라.";
}
