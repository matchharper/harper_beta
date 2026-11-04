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
  return parseCareerPromptLocale(value) ?? "en";
}

export function getCareerPromptLanguageName(value: unknown) {
  return normalizeCareerPromptLocale(value) === "en" ? "English" : "Korean";
}
