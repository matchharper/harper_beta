import assert from "node:assert/strict";
import test from "node:test";

import {
  CAREER_LANGUAGE_SETTING_TOOL_PARAMETERS,
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
