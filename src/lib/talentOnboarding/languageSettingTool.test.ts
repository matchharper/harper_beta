import assert from "node:assert/strict";
import test from "node:test";

import {
  CAREER_LANGUAGE_SETTING_TOOL_DESCRIPTION,
  CAREER_LANGUAGE_SETTING_TOOL_PARAMETERS,
  getCareerLanguageSettingToolStatus,
  parseCareerLanguageSetting,
} from "./languageSettingTool";

test("language setting tool has a minimal language-only schema", () => {
  assert.deepEqual(CAREER_LANGUAGE_SETTING_TOOL_PARAMETERS, {
    type: "object",
    properties: {
      language: {
        type: "string",
        enum: ["en", "ko"],
      },
    },
    required: ["language"],
    additionalProperties: false,
  });
});

test("language setting tool accepts only supported languages", () => {
  assert.equal(parseCareerLanguageSetting("en"), "en");
  assert.equal(parseCareerLanguageSetting("ko"), "ko");
  assert.equal(parseCareerLanguageSetting("English"), null);
  assert.equal(parseCareerLanguageSetting(null), null);
});

test("language setting status uses the target language", () => {
  assert.equal(
    getCareerLanguageSettingToolStatus("en"),
    "Changing your language to English."
  );
  assert.equal(
    getCareerLanguageSettingToolStatus("ko"),
    "언어를 한국어로 변경하고 있습니다."
  );
  assert.equal(getCareerLanguageSettingToolStatus("ja"), "");
});

test("language setting tool explains persistence and ambiguous requests", () => {
  assert.match(CAREER_LANGUAGE_SETTING_TOOL_DESCRIPTION, /Permanently/);
  assert.match(CAREER_LANGUAGE_SETTING_TOOL_DESCRIPTION, /ask whether/);
});
