import type { Database } from "@/types/database.types";
import type { TalentNetworkEngagementOptionId } from "@/lib/talentNetworkOptions";

export type TalentConversationRow = {
  id: string;
  user_id: string;
  stage: "profile" | "chat" | "completed";
  relief_nudge_sent: boolean | null;
  created_at: string;
  updated_at: string;
};

export type TalentUserProfileRow = {
  user_id: string;
  email: string | null;
  name: string | null;
  profile_picture: string | null;
  headline: string | null;
  bio: string | null;
  current_location: string | null;
  location: string | null;
  last_logined_at: string | null;
  resume_file_name: string | null;
  resume_storage_path: string | null;
  resume_text: string | null;
  resume_links: string[] | null;
  created_at: string;
  updated_at: string;
};

export type TalentExperienceRow =
  Database["public"]["Tables"]["talent_experiences"]["Row"];
export type TalentEducationRow =
  Database["public"]["Tables"]["talent_educations"]["Row"];
export type TalentExtraRow =
  Database["public"]["Tables"]["talent_extras"]["Row"];

export type TalentExtraItem = {
  id?: string | null;
  title: string | null;
  description: string | null;
  date: string | null;
  memo: string | null;
};

export type TalentStructuredProfile = {
  talentUser:
    | (Pick<
        TalentUserProfileRow,
        "user_id" | "name" | "profile_picture" | "headline" | "bio" | "location"
      > & { current_location?: string | null })
    | null;
  talentExperiences: TalentExperienceRow[];
  talentEducations: TalentEducationRow[];
  talentExtras: TalentExtraItem[];
};

export type TalentMessageRow = {
  id: number;
  conversation_id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  message_type: string | null;
  thinking_logs?: Database["public"]["Tables"]["talent_messages"]["Row"]["thinking_logs"];
  is_mobile?: boolean | null;
  created_at: string;
};

export type TalentMessageResponse = {
  id: number;
  role: "user" | "assistant";
  content: string;
  messageType: string;
  createdAt: string;
  thinkingLogs: string[];
};

export function normalizeTalentMessageThinkingLogs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 12);
}

export function toTalentMessageResponse(
  item: TalentMessageRow
): TalentMessageResponse {
  return {
    id: item.id,
    role: item.role,
    content: item.content,
    messageType: item.message_type ?? "chat",
    createdAt: item.created_at,
    thinkingLogs: normalizeTalentMessageThinkingLogs(item.thinking_logs),
  };
}

export type TalentProfileVisibility =
  | "open_to_matches"
  | "exceptional_only"
  | "dont_share";

export const DEFAULT_TALENT_PROFILE_VISIBILITY: TalentProfileVisibility =
  "exceptional_only";

export type TalentSettingRow = {
  user_id: string;
  profile_visibility: TalentProfileVisibility;
  blocked_companies: string[];
  engagement_types: TalentNetworkEngagementOptionId[];
  get_external_recommendation: boolean;
  get_internal_recommendation: boolean;
  is_onboarding_done: boolean;
  periodic_interval_days: number;
  preferred_locale: string | null;
  setting_locale: string | null;
  recommendation_batch_size: number;
  status: "active" | "passive" | "stopped";
  created_at: string;
  updated_at: string;
};

export type TalentInsightContent = Record<string, string>;

export type TalentInsightRow = {
  id: number;
  talent_id: string | null;
  content: TalentInsightContent | Record<string, unknown> | null;
  created_at: string;
  last_updated_at: string | null;
};

export const TALENT_RESUME_BUCKET = "talent-resumes";
export const TALENT_PENDING_QUESTION_PREFIX = "__PENDING_Q__::";
export const TALENT_SETTING_SELECT_QUERY =
  "user_id, profile_visibility, blocked_companies, engagement_types, get_external_recommendation, get_internal_recommendation, is_onboarding_done, periodic_interval_days, preferred_locale, setting_locale, recommendation_batch_size, status, created_at, updated_at";
