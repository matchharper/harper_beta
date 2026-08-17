export const CAREER_LANGUAGE_SETTING_TOOL_DESCRIPTION =
  "Permanently change the user's saved Career language. Call for clear ongoing requests such as '앞으로 영어로 해줘'; for a bare request such as '한글로 대답해봐', ask whether to change the saved language instead of calling.";

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
