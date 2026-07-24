import type { User } from "@supabase/supabase-js";
import {
  notifySlackActivity,
  type SlackActivityDetail,
} from "@/lib/slackActivity";
import type {
  TalentOpportunityFeedback,
  TalentOpportunityHistoryItem,
} from "@/lib/talentOpportunity";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";

const INTERNAL_OPPORTUNITY_DECISION_SLACK_CHANNEL_BY_WORKSPACE_ID: Readonly<
  Record<string, string>
> = Object.freeze({
  "720254d7-aeb7-4709-a56f-7b822f89eac5": "C09CRN4TFC4",
});
const OPS_CAREER_URL = "https://matchharper.com/ops/career";

export function getInternalOpportunityDecisionSlackChannelId(
  companyWorkspaceId: string | null | undefined
) {
  const workspaceId = String(companyWorkspaceId ?? "").trim();
  return (
    INTERNAL_OPPORTUNITY_DECISION_SLACK_CHANNEL_BY_WORKSPACE_ID[workspaceId] ??
    null
  );
}

export function parseInternalOpportunityFeedbackReasonForSlack(
  value: string | null | undefined
) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as {
      customReason?: unknown;
      selectedOptions?: unknown;
    };
    const selectedOptions = Array.isArray(parsed.selectedOptions)
      ? parsed.selectedOptions
          .map((item) => String(item ?? "").trim())
          .filter(Boolean)
      : [];
    const customReason =
      typeof parsed.customReason === "string" ? parsed.customReason.trim() : "";
    return (
      [...selectedOptions, customReason].filter(Boolean).join(" / ") || null
    );
  } catch {
    return raw;
  }
}

export function buildOpsCareerUserUrl(userId: string) {
  const url = new URL(OPS_CAREER_URL);
  url.searchParams.set("userId", userId);
  return url.toString();
}

export async function notifyInternalOpportunityDecisionSlack(args: {
  admin: TalentAdminClient;
  decision: TalentOpportunityFeedback;
  deviceLabel?: string | null;
  feedbackReason?: string | null;
  opportunity?: TalentOpportunityHistoryItem | null;
  sourceLabel: string;
  user?: User | null;
  userId: string;
}) {
  if (!args.opportunity || args.opportunity.sourceType !== "internal") {
    return false;
  }

  const accepted = args.decision === "positive";

  try {
    const [roleResult, profileResult] = await Promise.all([
      args.admin
        .from("company_roles")
        .select("company_workspace_id")
        .eq("role_id", args.opportunity.roleId)
        .maybeSingle(),
      args.user
        ? Promise.resolve({ data: null, error: null })
        : args.admin
            .from("talent_users")
            .select("name, email")
            .eq("user_id", args.userId)
            .maybeSingle(),
    ]);

    if (roleResult.error) {
      throw new Error(
        roleResult.error.message ?? "Failed to resolve opportunity workspace"
      );
    }
    if (profileResult.error) {
      throw new Error(
        profileResult.error.message ?? "Failed to resolve talent profile"
      );
    }

    const details: SlackActivityDetail[] = [
      { label: "Decision", value: accepted ? "수락" : "거절" },
      {
        label: "Source",
        value: [args.sourceLabel, args.deviceLabel]
          .map((value) => String(value ?? "").trim())
          .filter(Boolean)
          .join(", "),
      },
      { label: "Company", value: args.opportunity.companyName },
      { label: "Role", value: args.opportunity.title },
      { label: "Location", value: args.opportunity.location },
      {
        label: "Feedback Reason",
        value: parseInternalOpportunityFeedbackReasonForSlack(
          args.feedbackReason
        ),
      },
    ];

    return await notifySlackActivity({
      action: `Internal position ${accepted ? "accepted ☘️" : "rejected ❌"}`,
      channelId: getInternalOpportunityDecisionSlackChannelId(
        roleResult.data?.company_workspace_id
      ),
      email: profileResult.data?.email,
      name: profileResult.data?.name,
      nameUrl: buildOpsCareerUserUrl(args.userId),
      user: args.user,
      userId: args.userId,
      details,
    });
  } catch (error) {
    console.error("[internal-opportunity-decision-slack]", {
      decision: args.decision,
      error: error instanceof Error ? error.message : String(error),
      opportunityId: args.opportunity.id,
      source: args.sourceLabel,
      userId: args.userId,
    });
    return false;
  }
}
