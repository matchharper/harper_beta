import { TOOL_DESCRIPTIONS } from "@/lib/llm/toolDescriptions";
export const CAREER_LANGUAGE_SETTING_TOOL_DESCRIPTION =
  TOOL_DESCRIPTIONS.update_language_setting;

export const CAREER_LANGUAGE_SETTING_TOOL_PARAMETERS = {
  type: "object",
  properties: {
    language: {
      type: "string",
      enum: ["en", "ko"],
    },
  },
  required: ["language"],
  additionalProperties: false,
};

export function parseCareerLanguageSetting(value: unknown) {
  return value === "en" || value === "ko" ? value : null;
}

export function getCareerLanguageSettingToolStatus(value: unknown) {
  const language = parseCareerLanguageSetting(value);
  if (language === "en") return "Changing your language to English.";
  if (language === "ko") return "언어를 한국어로 변경하고 있습니다.";
  return "";
}
