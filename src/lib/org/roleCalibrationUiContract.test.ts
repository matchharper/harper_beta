import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("Calibration is read-only UI with a right-pane profile drill-in", () => {
  const list = source(
    "../../components/org/role-overview/OrgRoleCalibrationSection.tsx"
  );
  const panel = source(
    "../../components/org/role-overview/OrgCalibrationProfilePanel.tsx"
  );
  const badge = source(
    "../../components/org/role-overview/OrgCalibrationReviewBadge.tsx"
  );
  const rolePage = source(
    "../../components/org/workspace/pages/OrgRoleCreationPage.tsx"
  );

  assert.match(list, /title="Calibration"/);
  assert.match(list, /미평가/);
  assert.match(badge, /"Good"/);
  assert.match(badge, /"Bad"/);
  assert.doesNotMatch(list, /<Tabs|평가 완료|display\.location/);
  assert.doesNotMatch(
    list,
    /profile\.selection\.reason|profile\.review\.reason/
  );
  assert.doesNotMatch(list, /<textarea|<select/i);
  assert.match(panel, /absolute inset-0/);
  assert.match(panel, /TalentProfileHeader/);
  assert.match(panel, /TalentExperienceSection/);
  assert.doesNotMatch(panel, /Connect|Reject|연결 수락|연결 거절/);
  assert.match(rolePage, /<OrgCalibrationProfilePanel/);
});
