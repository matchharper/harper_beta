import { parseApplicationDraft, type ApplicationDraft } from "@/lib/career/simulation/preparation";
import {parseApplicationStartOffer,type ApplicationStartOffer} from "@/lib/career/simulation/startOffer";
import { parseSimulationSession, parseSimulationCard, type SimulationSession, type SimulationCardRef } from "@/lib/career/simulation/session";
import { parseApplicationSimulation, SIMULATION_MESSAGE_TYPE, type ApplicationSimulation } from "@/lib/career/simulation/types";
import type { MockInterviewOffer } from "@/lib/career/mockInterviewOffers";
import type { Database } from "@/types/database.types";
import type { TalentNetworkEngagementOptionId } from "@/lib/talentNetworkOptions";
import { stripCareerOpportunityMentionMetadata } from "@/lib/career/opportunityMentionText";
import {
  extractCareerMessageAttachments,
  stripCareerMessageAttachmentMetadata,
  type CareerMessageAttachment,
} from "@/lib/career/messageAttachments";
import {
  parseCareerCoachingActivity,
  type CareerCoachingActivity,
} from "@/lib/career/careerCoachingActivitySchema";

export type TalentConversationRow = {
  career_coaching_activity_message_id?: number | null;
  id: string;
  user_id: string;
  stage: "profile" | "chat" | "completed";
  profile_ingestion_error?: string | null;
  profile_ingestion_status?: string | null;
  profile_ingestion_updated_at?: string | null;
  relief_nudge_sent: boolean | null;
  created_at: string;
  updated_at: string;
};

export type TalentUserProfileRow = {
  user_id: string;
  email: string | null;
  phone_number: string | null;
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
export type TalentDocumentRow =
  Database["public"]["Tables"]["talent_documents"]["Row"];
export type TalentExtraRow =
  Database["public"]["Tables"]["talent_extras"]["Row"];

export type TalentDocumentResponse = {
  id: string;
  kind: string;
  fileName: string;
  storagePath: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  isPublic: boolean;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
  originType: string | null;
  originId: string | null;
  downloadUrl: string | null;
};

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
        | "user_id"
        | "email"
        | "phone_number"
        | "name"
        | "profile_picture"
        | "headline"
        | "bio"
        | "location"
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
  payload?: Database["public"]["Tables"]["talent_messages"]["Row"]["payload"];
  thinking_logs?: Database["public"]["Tables"]["talent_messages"]["Row"]["thinking_logs"];
  is_mobile?: boolean | null;
  created_at: string;
};

export type TalentMessageResponse = {
  suppressRolePreviews?:boolean;
  applicationStartOffer?:ApplicationStartOffer;
  applicationActivity?: {activityId:string; revision:number; runId?:string; view:string};
  applicationDraft?: ApplicationDraft;
  simulationSession?: SimulationSession;
  simulationAction?: SimulationCardRef;
  simulation?: ApplicationSimulation;
  mockInterviewOffers?: MockInterviewOffer[];
  attachments?: CareerMessageAttachment[];
  id: number;
  role: "user" | "assistant";
  content: string;
  messageType: string;
  coachingActivity?: CareerCoachingActivity;
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
  const coachingActivity =
    item.message_type === "career_coaching_activity"
      ? // Avoid importing the activity module here: that module already uses this serializer.
        parseCareerCoachingActivity(item)
      : null;
  const activityRef = item.message_type === "application_activity" && item.payload && typeof item.payload === "object" && !Array.isArray(item.payload) && typeof item.payload.activityId === "string" && typeof item.payload.view === "string"
    ? {activityId:item.payload.activityId,view:item.payload.view,revision:typeof item.payload.revision === "number" ? item.payload.revision : 0}
    : undefined;
  // Reference rows are hydrated from the activity store, not independent prose.
  const visibleContent = activityRef?.view === "questions" ? "" : item.content;
  const attachments = extractCareerMessageAttachments(visibleContent);
  return {
    ...(activityRef ? {applicationActivity:activityRef} : {}),
    ...(item.message_type === "application_start_offer" ? {applicationStartOffer:parseApplicationStartOffer(item.payload)} : {}),
    ...(item.message_type === "application_draft" ? {applicationDraft:parseApplicationDraft(item.payload)} : {}),
    ...(item.message_type === "simulation_session" ? {simulationSession:parseSimulationSession(item.payload)} : {}),
    ...(item.message_type === "simulation_action" ? {simulationAction:parseSimulationCard(item.payload)} : {}),
    ...(attachments.length > 0 ? { attachments } : {}),
    ...(coachingActivity ? { coachingActivity } : {}),
    ...(item.message_type === SIMULATION_MESSAGE_TYPE ? { simulation: parseApplicationSimulation(item.payload) } : {}),
    suppressRolePreviews: !!item.payload && typeof item.payload === "object" && !Array.isArray(item.payload) && item.payload.suppressRolePreviews === true,
    id: item.id,
    role: item.role,
    content: stripCareerMessageAttachmentMetadata(
      stripCareerOpportunityMentionMetadata(visibleContent)
    ),
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
