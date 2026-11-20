import assert from "node:assert/strict";
import test from "node:test";
import {
  ALL_COMPANY_TERMS,
  companyStageName,
  withKoreanRo,
} from "@/lib/org/terms";

test("every stored pipeline stage has one name, and names are unique per meaning", () => {
  for (const stage of [
    "company_intro",
    "pending_connection",
    "intro_requested",
    "connected",
    "final_offer",
    "process_stopped",
    "archived",
    "accepted",
  ]) {
    assert.ok(companyStageName(stage, "ko"), stage);
    assert.ok(companyStageName(stage, "en"), stage);
  }
  assert.equal(companyStageName("custom:abc", "ko"), null);
  const formers = ALL_COMPANY_TERMS.flatMap((value) => value.former);
  const currents = new Set(ALL_COMPANY_TERMS.flatMap((value) => [value.ko, value.en]));
  for (const former of formers) assert.ok(!currents.has(former), `${former} is both former and current`);
});

test("Korean (으)로 follows the last syllable of a name", () => {
  assert.equal(withKoreanRo("연결을 요청할 후보"), "연결을 요청할 후보로");
  assert.equal(withKoreanRo("연결 요청함"), "연결 요청함으로");
  assert.equal(withKoreanRo("연결됨"), "연결됨으로");
  assert.equal(withKoreanRo("보관"), "보관으로");
  assert.equal(withKoreanRo("1차 인터뷰"), "1차 인터뷰로");
  assert.equal(withKoreanRo("기술 면접 (2차)"), "기술 면접 (2차)(으)로");
});
