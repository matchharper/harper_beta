import assert from "node:assert/strict";
import test from "node:test";
import { localeFromHeadquarters } from "./workspaceLocale";

test("workspace language follows Headquarters country, with English for unknown locations", () => {
  assert.equal(localeFromHeadquarters("Seoul, South Korea"), "ko");
  assert.equal(localeFromHeadquarters("대한민국 서울"), "ko");
  assert.equal(localeFromHeadquarters("서울"), "ko");
  assert.equal(localeFromHeadquarters("Korea"), "ko");
  assert.equal(localeFromHeadquarters("Jeju"), "ko");
  assert.equal(
    localeFromHeadquarters("San Francisco, CA, United States"),
    "en"
  );
  assert.equal(localeFromHeadquarters("Seoul, North Korea"), "en");
  assert.equal(localeFromHeadquarters(null), "en");
});
