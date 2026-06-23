export type ResolvedLocale = "ko" | "en";

export const DEFAULT_LOCALE: ResolvedLocale = "ko";

export function normalizeLocale(value: unknown): ResolvedLocale | null {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");

  if (normalized === "ko" || normalized.startsWith("ko-")) return "ko";
  if (normalized === "en" || normalized.startsWith("en-")) return "en";
  return null;
}

export function normalizeLocaleOrDefault(
  value: unknown,
  fallback: ResolvedLocale = DEFAULT_LOCALE
): ResolvedLocale {
  return normalizeLocale(value) ?? fallback;
}

function normalizeCountryCode(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function normalizeLanguageCode(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .split("-")[0];
}

export function resolveLocaleFromCountryLanguage(args: {
  countryCode?: unknown;
  language?: unknown;
}): ResolvedLocale {
  const countryCode = normalizeCountryCode(args.countryCode);
  const language = normalizeLanguageCode(args.language);

  if (countryCode === "KR") return "ko";
  if (language === "ko") return "ko";
  return "en";
}

export function resolveLocaleFromCountryLang(
  countryLang?: string | null
): ResolvedLocale {
  const [rawCountry, rawLanguage] = String(countryLang ?? "").split("_");
  return resolveLocaleFromCountryLanguage({
    countryCode: rawCountry || "ZZ",
    language: rawLanguage || "",
  });
}

export function isOverseasCountryLang(countryLang?: string | null) {
  const [rawCountry] = String(countryLang ?? "").split("_");
  const countryCode = normalizeCountryCode(rawCountry);
  return Boolean(countryCode && countryCode !== "ZZ" && countryCode !== "KR");
}

export function getBrowserCountryLang() {
  if (typeof navigator === "undefined") return "ZZ_en";

  const locale =
    (Array.isArray(navigator.languages) && navigator.languages[0]) ||
    navigator.language ||
    "en";
  const [rawLanguage, rawCountry] = locale.split("-");
  const language = (rawLanguage || "en").toLowerCase();
  const countryCode = (rawCountry || "ZZ").toUpperCase();

  return `${countryCode}_${language}`;
}

export function getBrowserInferredLocale(): ResolvedLocale {
  return resolveLocaleFromCountryLang(getBrowserCountryLang());
}
