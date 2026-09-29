import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSlackChannelLinks,
  canProvideOrgCompanyContext,
  getOrgOnboardingRoleCopy,
  getOrgOnboardingRoles,
  getOrgOnboardingSteps,
  isFirstOrgMember,
} from "./onboarding";
import type { OrgMember, OrgRole } from "./server";

const member = (
  userId: string,
  joinedAt: string,
  authority: OrgMember["authority"] = "admin"
): OrgMember => ({
  userId,
  joinedAt,
  authority,
  email: `${userId}@example.test`,
  name: userId,
  role: "Engineer",
  profilePicture: null,
});
const role = (status: string): OrgRole => ({
  roleId: status,
  status,
  name: status,
  createdAt: "",
  updatedAt: "",
  workspaceId: "workspace",
  criteria: [],
  description: null,
  employmentTypes: [],
  externalJdUrl: null,
  locationText: null,
  request: null,
  workMode: null,
});

test("only the earliest company teammate can provide company context, with a stable tie break", () => {
  const first = member("a", "2026-09-20T00:00:00Z");
  const sameTime = member("b", first.joinedAt);
  const later = member("c", "2026-09-21T00:00:00Z", "owner");
  const members = [later, sameTime, first];
  assert.equal(isFirstOrgMember(members, "a"), true);
  assert.equal(canProvideOrgCompanyContext(members, later), false);
  assert.equal(canProvideOrgCompanyContext(members, first), true);
  assert.equal(
    canProvideOrgCompanyContext(
      [member("a", first.joinedAt, "viewer")],
      member("a", first.joinedAt, "viewer")
    ),
    false
  );
});

test("existing Slack and later teammates skip optional steps; missing roles do not produce an empty step", () => {
  assert.deepEqual(
    getOrgOnboardingSteps({ showSlack: false, showCompany: false, roles: [] }),
    ["profile", "done"]
  );
  assert.deepEqual(
    getOrgOnboardingSteps({
      showSlack: true,
      showCompany: true,
      roles: [role("draft")],
    }),
    ["profile", "slack", "company", "roles", "done"]
  );
  assert.deepEqual(
    getOrgOnboardingSteps({
      showSlack: false,
      showCompany: true,
      roles: [role("deleted")],
    }),
    ["profile", "company", "done"]
  );
});

test("role copy never presents paused or ended-only hiring as currently active", () => {
  assert.equal(
    getOrgOnboardingRoleCopy([role("paused"), role("ended")]).title,
    "회사의 채용 역할을 확인해 보세요."
  );
  assert.equal(
    getOrgOnboardingRoleCopy([role("open"), role("draft")]).title,
    "현재 채용 중인 역할이 있어요."
  );
  assert.equal(
    getOrgOnboardingRoleCopy([role("top_priority")]).title,
    "현재 채용 중인 역할이 있어요."
  );
  assert.equal(
    getOrgOnboardingRoleCopy([role("pending")]).title,
    "미리 준비해 둔 역할이 있어요."
  );
  assert.deepEqual(
    getOrgOnboardingRoles([role("deleted"), role("ended")]).map(
      (item) => item.status
    ),
    ["ended"]
  );
});

test("Slack app launch is scoped to both workspace and channel, with a web fallback", () => {
  assert.equal(buildSlackChannelLinks(null, "C123"), null);
  assert.equal(buildSlackChannelLinks("T123", null), null);
  assert.deepEqual(buildSlackChannelLinks("T123", "C456"), {
    app: "slack://channel?team=T123&id=C456",
    web: "https://app.slack.com/client/T123/C456",
  });
  assert.equal(
    buildSlackChannelLinks("T&other=1", "C#2")?.app,
    "slack://channel?team=T%26other%3D1&id=C%232"
  );
});
