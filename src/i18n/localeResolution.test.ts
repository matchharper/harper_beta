import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveLocaleFromCountryLang,
  resolveLocaleFromLanguage,
} from "./localeResolution";

test("countryLang uses only its language segment", () => {
  assert.equal(resolveLocaleFromCountryLang("KR_en"), "en");
  assert.equal(resolveLocaleFromCountryLang("US_ko"), "ko");
});

test("browser language variants normalize to the supported locale", () => {
  assert.equal(resolveLocaleFromLanguage("ko-KR"), "ko");
  assert.equal(resolveLocaleFromLanguage("en-KR"), "en");
  assert.equal(resolveLocaleFromLanguage("ja-JP"), "en");
});
