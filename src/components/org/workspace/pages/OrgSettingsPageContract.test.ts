import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./OrgSettingsPage.tsx", import.meta.url),
  "utf8"
);

test("Calendar settings keep the interview availability entry point", () => {
  assert.match(source, /lg:grid-cols-2/);
  assert.match(source, /workspace\.pages\.OrgSettingsPage\.16c1f28c/);
  assert.match(source, /workspace\.pages\.OrgSettingsPage\.500a2a19/);
  assert.match(source, /workspace\.pages\.OrgSettingsPage\.d0572490/);
  assert.match(source, /onClick=\{\(\) => void openAvailability\(\)\}/);
  assert.match(source, /dialog: "interview-availability"/);
  assert.match(source, /useOrgMeetingAvailability/);
});
