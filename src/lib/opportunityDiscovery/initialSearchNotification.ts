import {
  appendHarperEmailFooterText,
  renderEmailBodyHtmlWithHarperFooter,
} from "@/lib/email/harperFooter";
import { createEmailReplyAlias } from "@/lib/email/inbound";
import { normalizeEmailAddress } from "@/lib/email/parse";
import { getDefaultResendFromEmail, sendResendEmail } from "@/lib/email/send";
import { fetchActiveTalentGmailIntegration } from "@/lib/integrations/gmail";
import { normalizeCareerPromptLocale } from "@/lib/career/promptLocale";
import {
  fetchTalentSetting,
  fetchTalentUserProfile,
  type TalentAdminClient,
} from "@/lib/talentOnboarding/server";
import { buildInitialSearchStartedEmail } from "./initialSearchNotificationCopy";

export const INITIAL_SEARCH_STARTED_MAIL_TYPE = "initial_search_started";

async function hasInitialSearchStartedEmail(args: {
  admin: TalentAdminClient;
  opportunityRunId: string;
  userId: string;
}) {
  const { data, error } = await args.admin
    .from("career_email_messages")
    .select("id")
    .eq("talent_id", args.userId)
    .eq("direction", "outbound")
    .eq("mail_type", INITIAL_SEARCH_STARTED_MAIL_TYPE)
    .eq("metadata->>discoveryRunId", args.opportunityRunId)
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(
      error.message ?? "Failed to check initial search started email"
    );
  }
  return Boolean(data?.id);
}

export async function sendInitialSearchStartedEmail(args: {
  admin: TalentAdminClient;
  conversationId: string;
  opportunityRunId: string;
  userId: string;
}) {
  if (await hasInitialSearchStartedEmail(args)) {
    return { skipped: "already_sent" as const };
  }

  const [profile, setting, gmailIntegration] = await Promise.all([
    fetchTalentUserProfile({ admin: args.admin, userId: args.userId }),
    fetchTalentSetting({ admin: args.admin, userId: args.userId }),
    fetchActiveTalentGmailIntegration({
      admin: args.admin,
      talentId: args.userId,
    }).catch(() => null),
  ]);
  const to = normalizeEmailAddress(profile?.email);
  if (!to) return { skipped: "missing_email" as const };

  const locale = normalizeCareerPromptLocale(setting?.preferred_locale);
  const email = buildInitialSearchStartedEmail({
    gmailConnected: Boolean(gmailIntegration),
    hasUploadedResume: Boolean(
      profile?.resume_file_name?.trim() || profile?.resume_storage_path?.trim()
    ),
    locale,
    name: profile?.name,
  });
  const replyAlias = await createEmailReplyAlias({
    admin: args.admin,
    conversationId: args.conversationId,
    userId: args.userId,
  });
  const text = appendHarperEmailFooterText(email.body);
  const result = await sendResendEmail({
    headers: {
      "X-Harper-Mail-Type": "initialOpportunitySearchStarted",
      "X-Harper-Talent-Id": args.userId,
    },
    html: renderEmailBodyHtmlWithHarperFooter(email.body),
    idempotencyKey: `initial-opportunity-search-started:${args.opportunityRunId}`,
    replyTo: replyAlias.address,
    subject: email.subject,
    text,
    to,
  });

  const now = new Date().toISOString();
  const { error } = await args.admin.from("career_email_messages").insert({
    body_text: text,
    direction: "outbound",
    from_email: getDefaultResendFromEmail(),
    mail_type: INITIAL_SEARCH_STARTED_MAIL_TYPE,
    metadata: {
      discoveryRunId: args.opportunityRunId,
      emailKind: "initialOpportunitySearchStarted",
      locale,
      replyTo: replyAlias.address,
      resendEmailId: result.id ?? null,
      source: "onboarding_completion",
    },
    occurred_at: now,
    status: "sent",
    subject: email.subject,
    talent_id: args.userId,
    to_email: to,
  });
  if (error) {
    throw new Error(error.message ?? "Failed to record initial search email");
  }

  return {
    resendEmailId: result.id ?? null,
    skipped: null,
    to,
  };
}
