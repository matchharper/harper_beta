import assert from "node:assert/strict";
import test from "node:test";
import {
  calibrationPublicState,
  sanitizeCompanyRoleCalibrationProfile,
} from "@/lib/org/roleCalibration";

test("calibration serializer exposes only the company-safe display contract", () => {
  const result = sanitizeCompanyRoleCalibrationProfile({
    display: {
      bio: "제품을 만든 엔지니어",
      educations: [{ school: "학교", url: "https://private.example/edu" }],
      email: "private@example.com",
      experiences: [{ companyName: "회사", role: "Engineer" }],
      headline: "Backend Engineer",
      links: ["https://linkedin.com/in/private"],
      name: "김민준",
      profilePicture: "https://private.example/photo.jpg",
    },
    profileId: "A",
    review: {
      reason: "초기 제품 경험이 좋아요",
      reviewedAt: "2026-09-04T00:00:00Z",
      reviewedBy: "private-user-id",
      sourceMessageId: 123,
      status: "good",
    },
    selection: { reason: "서로 연결 가능성을 확인할 만해요." },
    source: { candidId: "private-candid-id", sourceFingerprint: "secret" },
  });

  assert.ok(result);
  assert.equal(result.display.profilePicture, null);
  assert.deepEqual(Object.keys(result).sort(), [
    "display",
    "profileId",
    "review",
    "selection",
  ]);
  assert.deepEqual(Object.keys(result.review).sort(), [
    "reason",
    "reviewedAt",
    "status",
  ]);
  assert.equal("source" in result, false);
  assert.equal("email" in result.display, false);
  assert.equal("links" in result.display, false);
  assert.equal("url" in result.display.educations[0]!, false);

  const protocolRelative = sanitizeCompanyRoleCalibrationProfile({
    display: { name: "이서윤", profilePicture: "//private.example/photo.jpg" },
    profileId: "B",
    review: { status: "unreviewed" },
    selection: { reason: "확인할 가치가 있어요." },
  });
  assert.equal(protocolRelative?.display.profilePicture, null);
});

test("calibration lifecycle maps only published states to ready", () => {
  assert.equal(calibrationPublicState(null), "none");
  assert.equal(calibrationPublicState("queued"), "preparing");
  assert.equal(calibrationPublicState("running"), "preparing");
  assert.equal(calibrationPublicState("ready"), "ready");
  assert.equal(calibrationPublicState("sent"), "ready");
  assert.equal(calibrationPublicState("completed"), "ready");
  assert.equal(calibrationPublicState("failed"), "unavailable");
  assert.equal(calibrationPublicState("canceled"), "unavailable");
});
