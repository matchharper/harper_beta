import assert from "node:assert/strict";
import test from "node:test";
import { sendOrgOnboardingSlackWelcome } from "./onboardingSlack.server";
import type { InlineSlackCompanyUpdate } from "./agent/companyUpdate.server";
import type { OrgRole } from "./server";
import type { User } from "@supabase/supabase-js";
import type { CalendarIntegrationRow } from "@/lib/integrations/googleCalendarStore";

const args = {
  user: { id: "teammate", email: "alex@example.invalid" } as User,
  workspaceId: "workspace", completedAt: "2026-10-15T00:00:00Z",
  member: { name: "Alex", role: "Engineer" },
  roles: [
    { roleId: "allowed", name: "Engineer", status: "active" },
    { roleId: "private", name: "Private role", status: "draft" },
    { roleId: "deleted", name: "Deleted role", status: "deleted" },
  ] as OrgRole[],
  responseLocale: "en" as const,
};
const target = { channelId: "C1", channelName: "hiring", slackUserId: "U1", teamId: "T1" };
const dependencies = {
  findChannel: async () => target,
  readRoleSettings: async () => ({ assigneeUserIds: [], availableAssignees: [], channels: [], confirmedAssigneeUserId: null, confirmedChannelIds: [], emailEnabled: false }),
  readCalendar: async () => null as CalendarIntegrationRow | null,
  canShareRole: async (input: { roleId?: string | null }) => input.roleId === "allowed",
  deliver: async (_notice: InlineSlackCompanyUpdate) => ({ slackUrl: "https://example.invalid/slack", threadId: "thread" }),
};

test("no joined channel skips Calendar reads, generation and delivery", async () => {
  const unexpected = async () => { throw Error("must be skipped"); };
  assert.equal(await sendOrgOnboardingSlackWelcome(args, {
    ...dependencies, findChannel: async () => null,
    readCalendar: unexpected, deliver: unexpected,
  }), null);
});

test("the company-side writer receives the actual teammate, Calendar link and channel-safe role index", async () => {
  let notice: InlineSlackCompanyUpdate | undefined;
  const link = await sendOrgOnboardingSlackWelcome(args, {
    ...dependencies, deliver: async value => { notice = value; return { slackUrl: "https://example.invalid/slack", threadId: "thread" }; },
  });
  assert.equal(link, "https://example.invalid/slack");
  assert.deepEqual(notice?.slackDelivery, { channelId: "C1", slackTeamId: "T1", mentionSlackUserId: "U1", responseLocale: "en" });
  assert.deepEqual(notice?.facts.teammate, { name: "Alex", jobTitle: "Engineer" });
  const calendar = notice?.facts.calendar as { connection: string; settingsUrl: string };
  assert.equal(calendar.connection, "No active Google Calendar connection is saved for this teammate.");
  const url = new URL(calendar.settingsUrl);
  assert.equal(url.searchParams.get("orgId"), "workspace");
  assert.equal(url.searchParams.get("tab"), "calendar");
  assert.deepEqual((notice?.facts.hiringRoles as Array<{ name: string }>).map(role => role.name), ["Engineer"]);
});

test("a saved Calendar connection is supplied as a fact rather than another connection request", async () => {
  let notice: InlineSlackCompanyUpdate | undefined;
  await sendOrgOnboardingSlackWelcome(args, {
    ...dependencies, readCalendar: async () => ({ status: "active" }) as CalendarIntegrationRow,
    deliver: async value => { notice = value; return { slackUrl: "https://example.invalid/slack", threadId: "thread" }; },
  });
  assert.equal((notice?.facts.calendar as { connection: string }).connection, "An active Google Calendar connection is saved for this teammate.");
});

test("a failed delivery keeps onboarding usable and returns no Slack destination", async context => {
  context.mock.method(console, "error", () => {});
  assert.equal(await sendOrgOnboardingSlackWelcome(args, {
    ...dependencies, deliver: async () => { throw Error("thread was not delivered"); },
  }), null);
});


test("welcome reads setup only for visible drafts and supplies current targets without writing", async () => {
  const reads: string[] = [];
  let notice: InlineSlackCompanyUpdate | undefined;
  await sendOrgOnboardingSlackWelcome({ ...args, roles: [
    { roleId: "draft-a", name: "Backend", status: "draft" },
    { roleId: "draft-b", name: "Designer", status: "draft" },
    { roleId: "private", name: "Hidden", status: "draft" },
  ] as OrgRole[] }, {
    ...dependencies,
    canShareRole: async input => input.roleId !== "private",
    readRoleSettings: async input => {
      reads.push(input.roleId);
      assert.equal(input.currentChannelId, "C1");
      assert.equal(input.user.id, "teammate");
      return { assigneeUserIds: [], confirmedAssigneeUserId: null, confirmedChannelIds: [], emailEnabled: false,
        availableAssignees: [{ userId: "teammate", name: "Alex", current: true }],
        channels: [{ channelId: "C1", channelName: "hiring", current: true, enabled: true }] };
    },
    deliver: async value => { notice = value; return { slackUrl: "https://example.invalid/slack", threadId: "thread" }; },
  });
  assert.deepEqual(reads.sort(), ["draft-a", "draft-b"]);
  const roles = notice!.facts.hiringRoles as Array<{ roleId: string; notification: { confirmedChannelIds: string[]; assigneeUserIds: string[] } }>;
  assert.equal(roles.length, 2);
  for (const role of roles) {
    assert.deepEqual(role.notification.confirmedChannelIds, []);
    assert.deepEqual(role.notification.assigneeUserIds, []);
  }
});
