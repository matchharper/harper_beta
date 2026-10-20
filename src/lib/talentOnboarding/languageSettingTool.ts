export const CAREER_LANGUAGE_SETTING_TOOL_DESCRIPTION =
  "Permanently change the user's saved Harper language, which chat, email and notifications all use. Call only for a clear request to use a language from now on, such as '앞으로 영어로 해줘'. Do not call for a request about this reply only, such as '이번만 영어로 답해줘'; write that reply in the requested language. For an unclear request such as '한글로 대답해봐', do not call; write that reply in the requested language and ask once whether to keep using it. Writing in another language or describing language ability, such as '영어로 미팅은 어렵습니다', is not a request.";

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
