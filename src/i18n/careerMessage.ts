import { ko } from "@/lang/ko";
import type { MessageDictionary } from "@/i18n/useMessage";

const CAREER_SOURCE_TO_KEY = new Map(
  Object.entries((ko.career ?? {}) as Record<string, string>).map(
    ([key, value]) => [normalizeCareerMessage(value), key]
  )
);

function normalizeCareerMessage(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function interpolate(
  value: string,
  params: Record<string, string | number> | undefined
) {
  if (!params) return value;
  return value.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(params, name)
      ? String(params[name])
      : match
  );
}

export function formatCareerMessage(
  messages: MessageDictionary,
  koSource: string,
  params?: Record<string, string | number>
) {
  const key = CAREER_SOURCE_TO_KEY.get(normalizeCareerMessage(koSource));
  const translated =
    key && typeof messages.career?.[key] === "string"
      ? messages.career[key]
      : koSource;

  return interpolate(translated, params);
}

export function formatCareerMessageByKey(
  messages: MessageDictionary,
  key: string,
  fallback = "",
  params?: Record<string, string | number>
) {
  const translated =
    typeof messages.career?.[key] === "string"
      ? messages.career[key]
      : fallback;

  return interpolate(translated, params);
}
