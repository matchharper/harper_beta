export function getLocalizedRoleSummaryContent(
  value: unknown,
  locale?: string | null
) {
  const normalizedLocale = String(locale ?? "")
    .trim()
    .toLowerCase();
  if (!normalizedLocale) return null;

  const languageKey = normalizedLocale.startsWith("ko") ? "ko" : "en";
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const entry = (value as Record<string, unknown>)[languageKey];
  const rawContent =
    entry && typeof entry === "object" && !Array.isArray(entry)
      ? (entry as Record<string, unknown>).content
      : entry;
  const content = String(rawContent ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
  return content || null;
}

