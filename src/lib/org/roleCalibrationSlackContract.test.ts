import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOrgRoleCalibrationSlackBlocks,
  buildOrgRoleCalibrationProfileUrl,
  buildOrgRoleCalibrationSlackMessage,
} from "@/lib/org/slackMessages";

test("calibration Slack root links profiles and asks for thread text feedback", () => {
  const message = buildOrgRoleCalibrationSlackMessage({
    calibrationId: "calibration-id",
    profiles: [
      {
        display: {
          headline: "Backend Engineer",
          name: "김민준",
          profilePicture: "/images/profiles/avatar1.png",
        },
        profileId: "A",
        selection: { reason: "제품과 팀 단계가 맞을 가능성이 있어요." },
      },
    ],
    roleId: "role-id",
    roleName: "ML Engineer",
    workspaceId: "workspace-id",
  });

  assert.match(message, /Profile A/);
  assert.match(message, /김민준/);
  assert.match(message, /이 스레드에서/);
  assert.doesNotMatch(message, /button|actions|callback_id/i);

  const url = new URL(
    buildOrgRoleCalibrationProfileUrl({
      calibrationId: "calibration-id",
      profileId: "A",
      roleId: "role-id",
      workspaceId: "workspace-id",
    })
  );
  assert.equal(url.pathname, "/org/role");
  assert.equal(url.searchParams.get("calibration"), "calibration-id");
  assert.equal(url.searchParams.get("profile"), "A");
  assert.equal(url.searchParams.get("tab"), "matching");

  const blocks = buildOrgRoleCalibrationSlackBlocks({
    calibrationId: "calibration-id",
    profiles: [
      {
        display: {
          headline: "Backend Engineer",
          name: "김민준",
          profilePicture: "/images/profiles/avatar1.png",
        },
        profileId: "A",
        selection: { reason: "제품과 팀 단계가 맞을 가능성이 있어요." },
      },
    ],
    roleId: "role-id",
    roleName: "ML Engineer",
    workspaceId: "workspace-id",
  });
  const serialized = JSON.stringify(blocks);
  assert.match(serialized, /images\/profiles\/avatar1\.png/);
  assert.doesNotMatch(serialized, /"type":"actions"|"type":"button"/);
});
