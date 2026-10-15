import { readRoleNotificationContext } from "./agent/roleNotificationContext";
import "server-only";
import type { User } from "@supabase/supabase-js";
import type { OrgLocale } from "@/i18n/org/locale";
import { createGoogleCalendarStore } from "@/lib/integrations/googleCalendarStore";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { enqueueCompanyUpdate, type InlineSlackCompanyUpdate } from "./agent/companyUpdate.server";
import type { OrgMember, OrgRole } from "./server";
import { getOrgOnboardingRoles } from "./onboarding";
import { getOrgRoleStatusPresentation } from "./roleStatus";
import { getHarperSlackMemberChannel, isHarperSlackAudienceAllowed } from "./slackHarper";
import { buildOrgMeetingAvailabilityUrl, buildOrgRoleUrl, getOrgPublicSiteUrl } from "./slackMessages";
import { buildOrgHref } from "./routes";

const services = {
  findChannel: getHarperSlackMemberChannel,
  readRoleSettings: readRoleNotificationContext,
  readCalendar: (userId: string) => createGoogleCalendarStore(getSupabaseAdmin()).find(userId),
  canShareRole: isHarperSlackAudienceAllowed,
  deliver: (notice: InlineSlackCompanyUpdate) => enqueueCompanyUpdate(notice),
};

/** Completion owns this small, synchronous notice; the existing company-side writer and Slack records own the conversation. */
export async function sendOrgOnboardingSlackWelcome(args: {
  user: User;
  workspaceId: string;
  completedAt: string;
  member: Pick<OrgMember, "name" | "role">;
  roles: OrgRole[];
  responseLocale?: OrgLocale;
}, dependencies = services): Promise<string | null> {
  try {
    const channel = await dependencies.findChannel(args);
    if (!channel) return null;
    const roles = getOrgOnboardingRoles(args.roles).slice(0, 8);
    const [calendar, sharedRoles] = await Promise.all([
      dependencies.readCalendar(args.user.id),
      Promise.all(roles.map(async role =>
        await dependencies.canShareRole({
          workspaceId: args.workspaceId, channelId: channel.channelId, roleId: role.roleId,
        }) ? role : null
      )),
    ]);
    const hiringRoles = await Promise.all(sharedRoles.filter((role): role is OrgRole => Boolean(role)).map(async role => ({
      roleId: role.roleId, name: role.name, status: getOrgRoleStatusPresentation(role.status).label,
      url: buildOrgRoleUrl(args.workspaceId, role.roleId),
      ...(role.status === "draft" ? { notification: await dependencies.readRoleSettings({
        roleId: role.roleId, workspaceId: args.workspaceId, user: args.user, currentChannelId: channel.channelId,
      }) } : {}),
    })));
    const result = await dependencies.deliver({
      user: args.user,
      workspaceId: args.workspaceId,
      eventKey: `org-onboarding:${args.workspaceId}:${args.user.id}:${args.completedAt}`,
      purpose: "Welcome this teammate to the company's Harper workspace after onboarding. They are already a company teammate; joining this workspace does not establish a new job or employment change. Write a light, personal Slack introduction. Briefly introduce these three capabilities once as short bullet points, following the workspace onboarding guide: find suitable people from the work and essential requirements the company describes, even without a JD; help arrange interviews using connected Calendar and saved availability when requested, and relay questions to candidates; answer questions about candidates using only known, company-shareable information. Keep the wording natural and concise rather than giving a full feature tour. If no active Google Calendar connection is saved, briefly explain the interview-scheduling benefit and invite them to connect it and save available times through the supplied settings link. If a connection is already saved, simply acknowledge that saved setup without asking them to connect again. The supplied data does not verify live Calendar access or saved availability, so do not promise that scheduling is ready or that available times can already be used. Use verified hiring context to choose a useful immediate next step. For drafts, distinguish explicit selected channels and assignee from workspace default delivery settings. When setup is missing and the current channel and this teammate are eligible, you may propose those targets and starting hiring for the relevant named Roles together. The teammate can approve or correct the proposal in this same Slack conversation. Keep it a proposal, not a completed change, and do not assume other draft requirements are complete. Choose what to explain from the actual context; do not force a setup question when it is not useful. This introduction does not authorize searches, candidate contact or hiring-state changes. A separate channel message will mention this teammate; write the welcome for its replies. Use their name naturally so they can reply here.",
      facts: {
        teammate: { name: args.member.name, jobTitle: args.member.role },
        onboarding: "An existing company teammate has just completed onboarding in the company's Harper workspace.",
        calendar: {
          connection: calendar?.status === "active"
            ? "An active Google Calendar connection is saved for this teammate."
            : "No active Google Calendar connection is saved for this teammate.",
          settingsUrl: buildOrgMeetingAvailabilityUrl(args.workspaceId),
          availability: "Saved availability and live provider access have not been checked for this welcome.",
        },
        currentSlackChannel: { channelId: channel.channelId, channelName: channel.channelName },
        hiringRoles,
        hiringContextScope: "A partial index of roles visible both to this teammate and this channel, not a complete organization-wide hiring inventory. Any role-status observation applies only to these listed roles. Draft notification settings are verified for listed Roles; they do not establish whether existing candidates or ongoing conversations need attention. An empty index does not establish that the organization has no roles.",
        workspaceUrl: `${getOrgPublicSiteUrl()}${buildOrgHref({ orgId: args.workspaceId, page: "home" })}`,
      },
      slackDelivery: {
        channelId: channel.channelId, slackTeamId: channel.teamId,
        mentionSlackUserId: channel.slackUserId, responseLocale: args.responseLocale,
      },
    });
    return result.slackUrl;
  } catch (error) {
    // Slack availability must not undo successful onboarding. Never open a channel on partial delivery.
    console.error("[org/onboarding:slack-welcome]", error);
    return null;
  }
}
