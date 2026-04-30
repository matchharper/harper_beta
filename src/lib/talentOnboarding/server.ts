import type { User } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { getCareerFirstVisitText } from "@/lib/career/prompts";
import {
  getTalentSupabaseAdmin,
  toTalentDisplayName,
  type TalentAdminClient,
} from "@/lib/talentOnboarding/admin";
import {
  buildTalentProfileContext,
  fetchTalentStructuredProfile,
  fetchTalentUserProfile,
  markTalentUserLoggedIn,
} from "@/lib/talentOnboarding/profileStore";
import {
  addCustomChecklistItem,
  deleteCustomChecklistItem,
  fetchCustomChecklistItems,
  fetchTalentInsights,
  fetchTalentSetting,
  getEmptyInsightKeys,
  getMergedChecklist,
  getTalentProfileVisibilityLabel,
  getTalentResumeSignedUrl,
  mergeTalentInsightContent,
  mergeTalentSettingSeed,
  normalizeTalentBlockedCompanies,
  normalizeTalentEngagementTypes,
  normalizeTalentInsightContent,
  normalizeTalentInsightKey,
  normalizeTalentPreferredLocations,
  sanitizeTalentCareerMoveIntent,
  sanitizeTalentProfileVisibility,
  setTalentOnboardingDone,
  upsertTalentInsights,
  upsertTalentSetting,
  type MergedChecklistItem,
} from "@/lib/talentOnboarding/stateStore";
import {
  countUserChatTurns,
  fetchMessages,
  fetchRecentMessages,
  fetchVisibleMessagesPage,
} from "@/lib/talentOnboarding/messageStore";
import {
  TALENT_PENDING_QUESTION_PREFIX,
  TALENT_RESUME_BUCKET,
  TALENT_SETTING_SELECT_QUERY,
  type TalentConversationRow,
  type TalentEducationRow,
  type TalentExperienceRow,
  type TalentExtraItem,
  type TalentExtraRow,
  type TalentInsightContent,
  type TalentInsightRow,
  type TalentMessageRow,
  type TalentProfileVisibility,
  type TalentSettingRow,
  type TalentStructuredProfile,
  type TalentUserProfileRow,
  DEFAULT_TALENT_PROFILE_VISIBILITY,
} from "@/lib/talentOnboarding/models";
import { validatePromptFile } from "./prompts";

validatePromptFile("misc.md");

export {
  DEFAULT_TALENT_PROFILE_VISIBILITY,
  TALENT_PENDING_QUESTION_PREFIX,
  TALENT_RESUME_BUCKET,
  TALENT_SETTING_SELECT_QUERY,
  addCustomChecklistItem,
  buildTalentProfileContext,
  countUserChatTurns,
  deleteCustomChecklistItem,
  fetchCustomChecklistItems,
  fetchMessages,
  fetchRecentMessages,
  fetchTalentInsights,
  fetchTalentSetting,
  fetchTalentStructuredProfile,
  fetchTalentUserProfile,
  fetchVisibleMessagesPage,
  getEmptyInsightKeys,
  getMergedChecklist,
  getTalentProfileVisibilityLabel,
  getTalentResumeSignedUrl,
  getTalentSupabaseAdmin,
  markTalentUserLoggedIn,
  mergeTalentInsightContent,
  mergeTalentSettingSeed,
  normalizeTalentBlockedCompanies,
  normalizeTalentEngagementTypes,
  normalizeTalentInsightContent,
  normalizeTalentInsightKey,
  normalizeTalentPreferredLocations,
  sanitizeTalentCareerMoveIntent,
  sanitizeTalentProfileVisibility,
  setTalentOnboardingDone,
  toTalentDisplayName,
  upsertTalentInsights,
  upsertTalentSetting,
};

export type {
  MergedChecklistItem,
  TalentAdminClient,
  TalentConversationRow,
  TalentEducationRow,
  TalentExperienceRow,
  TalentExtraItem,
  TalentExtraRow,
  TalentInsightContent,
  TalentInsightRow,
  TalentMessageRow,
  TalentProfileVisibility,
  TalentSettingRow,
  TalentStructuredProfile,
  TalentUserProfileRow,
};

/** Get first-visit text from misc.md. Lazy-evaluated for DB cache support. */
export function getTalentFirstVisitText(): string {
  return getCareerFirstVisitText();
}

/** @deprecated Use getTalentFirstVisitText() */
export const TALENT_FIRST_VISIT_TEXT = getTalentFirstVisitText();

export function isPendingQuestionContent(content: string | null | undefined) {
  if (!content) return false;
  return content.startsWith(TALENT_PENDING_QUESTION_PREFIX);
}

export function stripPendingQuestionPrefix(content: string) {
  if (!isPendingQuestionContent(content)) return content;
  return content.slice(TALENT_PENDING_QUESTION_PREFIX.length).trim();
}

function normalizeComparableString(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeComparableEmail(value: string | null | undefined) {
  const normalized = normalizeComparableString(value);
  return normalized ? normalized.toLowerCase() : null;
}

async function claimTalentUserFromMailAlias(args: {
  admin: TalentAdminClient;
  user: User;
  mail: string | null | undefined;
}) {
  const mail = normalizeComparableEmail(args.mail);
  if (!mail) {
    return false;
  }

  const { data: matches, error: matchesError } = await args.admin
    .from("talent_users")
    .select("user_id")
    .ilike("email", mail)
    .limit(2);

  if (matchesError) {
    throw new Error(matchesError.message ?? "Failed to read talent_users");
  }

  if (!matches || matches.length === 0) {
    return false;
  }

  if (matches.length > 1) {
    throw new Error(
      "Multiple talent_users rows matched the provided mail value"
    );
  }

  const { data, error } = await args.admin.rpc(
    "claim_talent_user_email_alias",
    {
      source_email: mail,
      target_email: normalizeComparableString(args.user.email) ?? undefined,
      target_name:
        normalizeComparableString(toTalentDisplayName(args.user)) ?? undefined,
      target_profile_picture:
        normalizeComparableString(args.user.user_metadata?.avatar_url) ??
        undefined,
      target_user_id: args.user.id,
    }
  );

  if (error) {
    throw new Error(
      error.message ?? "Failed to claim existing talent_users profile"
    );
  }

  return Boolean(data);
}

export async function ensureTalentUserRecord(args: {
  admin: TalentAdminClient;
  user: User;
  mail?: string | null;
}) {
  const { admin, user, mail } = args;
  const email = normalizeComparableString(user.email);
  const name = normalizeComparableString(toTalentDisplayName(user));
  const profilePicture = normalizeComparableString(
    user.user_metadata?.avatar_url
  );
  const { data: existing, error: existingError } = await admin
    .from("talent_users")
    .select("user_id, email, name, profile_picture")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message ?? "Failed to read talent_users");
  }

  if (!existing) {
    const claimed = await claimTalentUserFromMailAlias({
      admin,
      user,
      mail,
    });
    if (claimed) {
      return;
    }

    const { error: insertError } = await admin.from("talent_users").insert({
      user_id: user.id,
      email,
      name,
      profile_picture: profilePicture,
      updated_at: new Date().toISOString(),
    });

    if (insertError) {
      throw new Error(insertError.message ?? "Failed to insert talent_users");
    }
    return;
  }

  const nextPayload: Database["public"]["Tables"]["talent_users"]["Update"] =
    {};

  if (normalizeComparableString(existing.email) !== email) {
    nextPayload.email = email;
  }
  if (normalizeComparableString(existing.name) !== name) {
    nextPayload.name = name;
  }
  if (
    !normalizeComparableString(existing.profile_picture) &&
    normalizeComparableString(profilePicture)
  ) {
    nextPayload.profile_picture = profilePicture;
  }

  if (Object.keys(nextPayload).length === 0) {
    return;
  }

  nextPayload.updated_at = new Date().toISOString();

  const { error: updateError } = await admin
    .from("talent_users")
    .update(nextPayload)
    .eq("user_id", user.id);

  if (updateError) {
    throw new Error(updateError.message ?? "Failed to update talent_users");
  }
}
