import assert from "node:assert/strict";
import test from "node:test";
import { en } from "./en";
import { ko } from "./ko";
import { resolveOrgLocale } from "./locale";

test("org locale uses browser language before country", () => {
  assert.equal(resolveOrgLocale("ko-KR", "US"), "ko");
  assert.equal(resolveOrgLocale("ko", "ZZ"), "ko");
  assert.equal(resolveOrgLocale("en-US", "KR"), "en");
  assert.equal(resolveOrgLocale("ja-JP", "KR"), "en");
  assert.equal(resolveOrgLocale(null, "KR"), "ko");
  assert.equal(resolveOrgLocale(null, "US"), "en");
  assert.equal(resolveOrgLocale(null, null), "en");
});

test("org English copy covers every current UI string without Korean", () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(ko).sort());
  for (const [key, source] of Object.entries(ko)) {
    const translated = en[key as keyof typeof ko];
    assert.doesNotMatch(translated, /[가-힣]/, key);
    const placeholders = (value: string) =>
      [...value.matchAll(/\{([a-zA-Z0-9_]+)\}/g)]
        .map((match) => match[1])
        .sort();
    assert.deepEqual(placeholders(translated), placeholders(source), key);
  }
});
