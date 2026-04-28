import type { Database } from "@/types/database.types";
import type {
  TalentNetworkApplication,
  TalentNetworkCareerMoveIntentOptionId,
  TalentNetworkEngagementOptionId,
  TalentNetworkLocationOptionId,
} from "@/lib/talentNetworkApplication";
import type { TalentRecommendationSettingsUpdateSource } from "@/lib/talentOnboarding/recommendationSettings";

export type TalentConversationRow = {
  id: string;
  user_id: string;
  stage: "profile" | "chat" | "completed";
  title: string | null;
  resume_file_name: string | null;
  resume_text: string | null;
  resume_links: string[] | null;
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
  location: string | null;
  career_profile: TalentNetworkApplication | Record<string, unknown> | null;
  last_logined_at: string | null;
  network_waitlist_id: number | null;
  network_claimed_at: string | null;
  network_source_talent_id: string | null;
  network_application:
    | TalentNetworkApplication
    | Record<string, unknown>
    | null;
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
  title: string | null;
  description: string | null;
  date: string | null;
  memo: string | null;
};

export type TalentStructuredProfile = {
  talentUser: Pick<
    TalentUserProfileRow,
    "user_id" | "name" | "profile_picture" | "headline" | "bio" | "location"
  > | null;
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
  created_at: string;
};

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
  preferred_locations: TalentNetworkLocationOptionId[];
  career_move_intent: TalentNetworkCareerMoveIntentOptionId | null;
  is_onboarding_done: boolean;
  periodic_enabled: boolean;
  periodic_interval_days: number;
  recommendation_batch_size: number;
  last_periodic_run_at: string | null;
  recommendation_source_conversation_id: string | null;
  recommendation_settings_updated_by: TalentRecommendationSettingsUpdateSource;
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
  "user_id, profile_visibility, blocked_companies, engagement_types, preferred_locations, career_move_intent, is_onboarding_done, periodic_enabled, periodic_interval_days, recommendation_batch_size, last_periodic_run_at, recommendation_source_conversation_id, recommendation_settings_updated_by, created_at, updated_at";
