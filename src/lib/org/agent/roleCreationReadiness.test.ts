import assert from "node:assert/strict";
import test from "node:test";
import { getRoleCreationMissingFields, type RoleCreationState } from "./roleCreationState";

const readyState = {
  role: {
    name: "Communications Specialist", description: "파트너 행사와 뉴스레터를 운영합니다.",
    request: "## Hard constraints\n- 파트너 커뮤니케이션 경험\n## Preferred criteria",
    locationText: "서울", workMode: "onsite", employmentTypes: ["full_time"],
    criteria: [{ name: "파트너 행사 운영 경험", criteria: "행사 기획·섭외·운영을 맡은 이력을 비교합니다." }],
  },
  channels: [{ channelId: "channel-a", enabled: true }],
  members: [{ userId: "user-a" }], assigneeUserIds: ["user-a"],
  metadata: { confirmedSlackChannelIds: ["channel-a"], confirmedAssigneeUserId: "user-a" },
} as RoleCreationState;

test("otherwise-ready drafts have no programmatic criteria completion gate", () => {
  assert.deepEqual(getRoleCreationMissingFields(readyState), []);
  assert.deepEqual(getRoleCreationMissingFields({
    ...readyState, role: { ...readyState.role, criteria: [] },
  }), []);
  assert.deepEqual(getRoleCreationMissingFields({
    ...readyState, role: { ...readyState.role, criteria: [{ name: "파트너 행사 운영 경험", criteria: "" }] },
  }), []);
});

test("a draft with email on is ready without a confirmed Slack channel", () => {
  const noSlack = { ...readyState, channels: [], metadata: { ...readyState.metadata, confirmedSlackChannelIds: [] } };
  assert.deepEqual(getRoleCreationMissingFields({ ...noSlack, emailEnabled: true }), []);
  assert.deepEqual(getRoleCreationMissingFields({ ...noSlack, emailEnabled: false }), ["connected_slack"]);
  // Email only at a Slack company: its channel was turned off, nothing confirmed.
  assert.deepEqual(getRoleCreationMissingFields({
    ...readyState, emailEnabled: true,
    channels: [{ channelId: "channel-a", channelName: null, enabled: false }],
    metadata: { ...readyState.metadata, confirmedSlackChannelIds: [] },
  }), []);
});
