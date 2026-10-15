import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./OrgSettingsPage.tsx", import.meta.url),
  "utf8"
);

test("Calendar settings keep the interview availability entry point", () => {
  assert.match(source, /lg:grid-cols-2/);
  assert.match(source, /인터뷰 일정/);
  assert.match(source, /내 인터뷰 가능 시간 설정 열기/);
  assert.match(source, /c\("열기", "Open"\)/);
  assert.match(source, /onClick=\{\(\) => void openAvailability\(\)\}/);
  assert.match(source, /dialog: "interview-availability"/);
  assert.match(source, /useOrgMeetingAvailability/);
});
