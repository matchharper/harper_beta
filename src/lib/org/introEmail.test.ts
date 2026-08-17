import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  appendOrgIntroCaptureDisclosure,
  ORG_INTRO_CAPTURE_DISCLOSURE,
} from "./introEmailDisclosure";
import { containsOrgIntroProcessHistory } from "./introEmailSafety";

test("does not append an empty organization introduction capture disclosure", () => {
  const first = appendOrgIntroCaptureDisclosure("Best regards,\nHarper");
  const second = appendOrgIntroCaptureDisclosure(first);

  assert.equal(ORG_INTRO_CAPTURE_DISCLOSURE, "");
  assert.equal(first, "Best regards,\nHarper");
  assert.equal(second, first);
});

test("warm intro prompt never exposes a prior company decline or reactivation", () => {
  const source = readFileSync(new URL("./introEmail.ts", import.meta.url), "utf8");

  assert.match(source, /Never mention or imply a previous decline/);
  assert.match(source, /write a normal first warm introduction/);
  assert.match(source, /generate\("safety_retry"\)/);
  assert.match(source, /repeatedly exposed company-process history/);
  assert.doesNotMatch(source, /buildSafeOrgIntroEmailDraft/);
});

test("warm intro output guard detects company-process history in English and Korean", () => {
  for (const unsafe of [
    "Although the company declined before, it would now like to reconnect.",
    "The team reconsidered its decision.",
    "거절했지만 다시 연결하기로 했습니다.",
    "이전 프로세스 종료 안내 이후 상황이 바뀌었습니다.",
  ]) {
    assert.equal(containsOrgIntroProcessHistory(unsafe), true, unsafe);
  }
  assert.equal(
    containsOrgIntroProcessHistory(
      "I'm pleased to introduce you both regarding the Founding Engineer opportunity."
    ),
    false
  );
});
