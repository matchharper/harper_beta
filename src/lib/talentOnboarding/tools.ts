import { TOOL_DESCRIPTIONS } from "@/lib/llm/toolDescriptions";
import { assertCareerTurnActive, careerTurnIsStopped, cancelCareerTurnWork } from "@/lib/career/turnCancellation.server";
import { formatOpportunityDecisionReceipt } from "@/lib/career/opportunityFeedbackEvent";
import { CAREER_GENERAL_TOOLS, CAREER_AGENTIC_TOOLS } from "@/lib/career/generalTools";
import { RECORD_CALL_ANSWERS, recordCallAnswersParameters, executeRecordCallAnswers } from "@/lib/career/recordCallAnswersTool";
import { OPS_CONTACT_REPLY_ACKNOWLEDGEMENT } from "@/lib/companyTalentRequests/opsContactContract";
import { withCompactTalentToolModelResult } from "./toolModelResult";
import { formatToolError } from "@/lib/llm/toolError";
import { resolveCompanyLogoUrl } from "@/lib/imageUrl";
import { buildCareerCoachingResultInstruction } from "@/lib/career/prompts/cases/coachingPrompts";
import { GENERATE_RESUME_PARAMETERS } from "@/lib/resumes/schema";
import { UPSERT_DOCUMENT_PARAMETERS } from "@/lib/documents/authoring";
import {
  executeProfileRows,
  PROFILE_ROWS_PARAMETERS,
  PROFILE_READ_ROWS_PARAMETERS,
} from "./profileRows";
import { readTalentContactHistory } from "@/lib/career/talentContactHistory";
import {
  OPEN_URL_TOOL_DEFINITION,
  WEB_SEARCH_TOOL_DEFINITION,
  executeSharedOpenUrl,
  executeSharedWebSearch,
} from "@/lib/agentTools/web";
import {
  COMPANY_RELAY_CONTENT_CONTRACT,
  COMPANY_RELAY_DELIVERY_RESPONSE_CONTRACT,
  COMPANY_RELAY_NOT_DELIVERED_RESPONSE_CONTRACT,
} from "@/lib/companyTalentRequests/relayContract";
import { formatRoleContextForModel } from "./roleContextFormat";
import {
  fetchTalentOpportunityHistory,
  fetchTalentOpportunityHistoryByIds,
  fetchTalentOpportunityHistoryByRoleIds,
  formatTalentRoleActivitiesForPrompt,
  formatUpcomingHarperMeetingForPrompt,
  InternalRoleAcceptanceError,
  updateTalentOpportunityHistoryItem,
  type TalentOpportunityFeedback,
  type TalentOpportunityHistoryItem,
} from "@/lib/talentOpportunity";
import {
  getPostingRoleIdFromOpportunityId,
  isPostingRoleId,
  normalizePostingRoleId,
  toPostingOpportunityId,
} from "@/lib/career/postingLinks";
import { runExperimentJobRecommendations as runCareerJobPostingRecommendations } from "../externalRecommendationsV2/web";
import {
  fetchTalentUserProfile,
  mutateEducationMemo,
  mutateExperienceMemo,
  mutateExtraMemo,
  type RowMemoOperation,
} from "./profileStore";
import {
  createTalentContextMutationRequestId,
  fetchTalentContextsByRefs,
  fetchTalentSetting,
  mutateTalentContextsFromAgent,
  readTalentContextsForAgent,
  refreshTalentContextEmbeddings,
  refreshTalentPreferredLocale,
  TALENT_CONTEXT_READ_TOOL_PARAMETERS,
  TALENT_CONTEXT_WRITE_TOOL_PARAMETERS,
  upsertTalentSetting,
  type TalentContextAgentChange,
  type TalentMemoryImportance,
} from "./server";
import {
  TALENT_RECOMMENDATION_BATCH_SIZE_MAX,
  TALENT_RECOMMENDATION_BATCH_SIZE_MIN,
  normalizeTalentRecommendationBatchSize,
} from "./recommendationSettings";
import {
  buildPreferenceActivitySummary,
  buildRowMemoActivitySummary,
  compactActivityChanges,
  fetchTalentActivityEvents,
  insertTalentActivityEvent,
  insertTalentOpportunityFeedbackActivityEvent,
  isSameActivityValue,
  type TalentActivityChange,
  type TalentRowMemoActivityItem,
} from "./activityEvents";
import {
  logTalentToolCall,
  logTalentToolError,
  logTalentToolResult,
} from "./toolLogging";
import {
  insertTalentToolFailureLog,
  insertTalentToolUsageLog,
} from "./toolUsageLog";
import { recordInternalFitReevaluationInformation } from "./internalFitHoldQuestion";
import {
  groupInternalFitHoldQuestionCandidates,
  hasExplicitInternalFitReevaluationTopic,
  normalizeInternalFitQuestionText,
} from "./internalFitQuestionTopics";
import {
  buildInternalRolePriorityReviewAssistantInstruction,
  hasPriorityReviewReachedFourteenDays,
} from "./internalRolePriorityReviewGuidance";
import type { TalentAdminClient } from "./admin";
import { getCareerPromptLanguageName } from "@/lib/career/promptLocale";
import { formatCareerPromptCompactDateTime } from "@/lib/career/prompts/promptUtils";
import { searchInternalRolesForCareerTool } from "@/lib/career/internalRoleSearch";
import { isInternalRoleCandidateDecisionAvailable } from "@/lib/career/internalOpportunityDecision";
import { isPriorityReviewInboxArchived } from "@/lib/career/priorityReviewProgress";
import {
  hasPendingInternalRoleReconsideration,
  isInternalRoleCandidateReadable,
  isInternalRoleReconsiderationEligible,
  isInternalRoleCandidateVisible,
  isInternalRolePriorityReviewRecommendable,
} from "@/lib/career/internalRoleEligibility";
import { IncomingWebhook } from "@slack/webhook";
import { notifyInternalOpportunityDecisionSlack } from "@/lib/internalOpportunityDecisionSlack";
import {
  createCompanyTalentRelay,
  recordOpsCandidateDecision,
  fetchRelayableCompanyTalentConnections,
  formatRelayableCompanyTalentConnections,
} from "@/lib/companyTalentRequests/server";
import { getCompanyInternalRoleRequest } from "@/lib/companyInternalRole";
import {
  CAREER_LANGUAGE_SETTING_TOOL_PARAMETERS,
  parseCareerLanguageSetting,
} from "./languageSettingTool";
import {
  buildActiveCareerChatExternalSearchResult,
  buildOnDemandJobSearchStatusUnknownResult,
  enqueueOnDemandJobSearch,
  findActiveCareerChatExternalSearchRun,
  normalizeRecommendJobPostingsKind,
} from "@/lib/opportunityDiscovery/onDemandJobSearch";
import {
  listTalentDocumentsForTool,
  readTalentDocumentForTool,
} from "./documentTool";
import { executeConnectedGmailSearch } from "@/lib/integrations/gmail";
import { fetchCareerPostOnboardingContext } from "@/lib/career/postOnboardingContext";
import { fetchLatestInternalRoleRequestEntryPage } from "./internalRoleRequestEntryPage";
import {
  fetchCurrentCareerCoachingActivity,
  mutateCareerCoachingActivity,
  type CareerCoachingActivityAction,
} from "@/lib/career/careerCoachingActivity";
import { readCareerCoachingListText } from "@/lib/career/careerCoachingList";

import type { CareerTextChatModelId } from "@/lib/career/textChatModelConfig";
import type { TalentMessageResponse } from "./models";

export type TalentToolChannel = "chat" | "voice";

export type PendingProcessClosureNotice = {
  companyName: string;
  currentStage: string;
  recommendationId: string;
  roleId: string;
  roleName: string;
  closureKind: "role_ended" | "company_process_stopped";
};

function opsContactToolResult(idempotent: boolean) {
  return {
    ok: true,
    status: "recorded",
    idempotent,
    skipCommonAssistantInstruction: true,
    assistantInstruction: OPS_CONTACT_REPLY_ACKNOWLEDGEMENT,
    modelOutput: `The user's response is recorded for Harper's recruiting follow-through. ${OPS_CONTACT_REPLY_ACKNOWLEDGEMENT}`,
  };
}

export type TalentToolExecutionContext = {
  backgroundInvocation?: import("@/lib/career/background/types").CareerBackgroundInvocation;
  agentClaimId?: string;
  internalCallRequestId?: string | null;
  textChatModel?: CareerTextChatModelId;
  suppressCommonAssistantInstruction?: boolean;
  simulationStartConfirmed?: boolean;
  simulationStartOfferId?: number;
  applicationChannel?: "email";
  presentForm?: (form: import("@/lib/career/forms/schema").CareerForm) => Promise<void>;
  onArtifactMessage?: (message: TalentMessageResponse) => void;
  onSimulationMessage?: (message: TalentMessageResponse) => void;
  onRecommendationSearchProgress?: (
    status: import("./recommendJobPostingStatus").RecommendJobPostingStatus
  ) => void;
  searchPurpose?: "mock_interview";
  admin?: unknown;
  abortSignal?: AbortSignal;
  deadlineAt?: number;
  channel?: TalentToolChannel;
  conversationId?: string;
  isMobile?: boolean | null;
  responseLocale?: string | null;
  registerProcessClosureNotices?: (
    notices: PendingProcessClosureNotice[]
  ) => void;
  scheduleAfter?: (task: () => Promise<void>) => void;
  toolCallId?: string | null;
  userMessageId?: number | string | null;
  resumeRequestId?: string;
  userId?: string;
};

export type TalentToolDefinition = {
  channels: TalentToolChannel[];
  description: string;
  execute?: (
    input: Record<string, unknown>,
    context?: TalentToolExecutionContext
  ) => Promise<unknown>;
  name: string;
  parameters: Record<string, unknown>;
  stopAfterExecution?: boolean;
  voicePreamble?: string;
};

async function insertToolUsageLogFromContext(args: {
  context?: TalentToolExecutionContext;
  name: string;
}) {
  const admin = args.context?.admin;
  if (!admin) return;

  // The worker treats this persisted usage event as an explicit strong
  // reaction. Programmatic feedback/re-engagement turns have no user message
  // origin and must not create that lifecycle signal a second time.
  if (
    args.name === "recommend_job_postings" &&
    !/^[1-9][0-9]*$/.test(String(args.context?.userMessageId ?? "").trim())
  ) {
    return;
  }

  await insertTalentToolUsageLog({
    admin: admin as TalentAdminClient,
    name: args.name,
    userId: args.context?.userId,
  });
}

async function insertToolFailureLogFromContext(args: {
  context?: TalentToolExecutionContext;
  name: string;
}) {
  const admin = args.context?.admin;
  if (!admin) return;

  await insertTalentToolFailureLog({
    admin: admin as TalentAdminClient,
    name: args.name,
    userId: args.context?.userId,
  });
}

export class TalentToolError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "TalentToolError";
    this.status = status;
  }
}

export const TALENT_TOOL_NAMES = {
  APPLY_TO_INTERNAL_ROLE: "apply_to_internal_role",
  ASSIGN_TO_ROLE: "assign_to_role",
  LIST_PROFILES: "list_profiles",
  READ_PROFILE: "read_profile",
  LIST_MATCHINGS: "list_matchings",
  READ_MATCHING: "read_matching",
  UPSERT_MATCHING: "upsert_matching",
  SEARCH_OPPORTUNITIES: "search_opportunities",
  UPSERT_OPPORTUNITIES: "upsert_opportunities",
  SEARCH_COMPANIES: "search_companies",
  FOLLOW_COMPANY: "follow_company",
  LIST_SCHEDULES: "list_schedules",
  READ_SCHEDULE: "read_schedule",
  UPSERT_SCHEDULE: "upsert_schedule",
  READ_TALENT_SCHEDULES: "read_talent_schedules",
  UPSERT_TALENT_SCHEDULES: "upsert_talent_schedules",
  DELIVER_CAREER_EMAIL: "deliver_career_email",
  USE_BROWSER: "use_browser",
  SUGGEST_FORM: "suggest_form",
  WRITE_EMAIL: "write_email",
  MANAGE_SIMULATION_SESSION: "manage_simulation_session",
  SIMULATE_APPLICATION: "simulate_application",
  RECORD_CALL_ANSWERS,
  END_CALL: "end_call",
  RECOMMEND_JOB_POSTINGS: "recommend_job_postings",
  READ_RECOMMENDED_OPPORTUNITIES: "read_recommended_opportunities",
  GET_INTERNAL_ROLES: "get_internal_roles",
  INTERNAL_ROLE_PRIORITY_REVIEW: "internal_role_priority_review",
  REQUEST_INTERNAL_ROLE_RECONSIDERATION:
    "request_internal_role_reconsideration",
  GET_ROLE_CONTEXT: "get_role_context",
  UPDATE_RECOMMENDED_OPPORTUNITY_FEEDBACK:
    "update_recommended_opportunity_feedback",
  WEB_SEARCH: "web_search",
  OPEN_URL: "open_url",
  SEARCH_CONNECTED_GMAIL: "search_connected_gmail",
  GENERATE_RESUME: "generate_resume",
  UPSERT_DOCUMENT: "upsert_document",
  SAVE_JOB_POSTING: "save_job_posting",
  LIST_DOCUMENTS: "list_documents",
  READ_DOCUMENT: "read_document",
  READ_TALENT_ACTIVITY_EVENTS: "read_talent_activity_events",
  UPDATE_LANGUAGE_SETTING: "update_language_setting",
  UPDATE_SETTING: "update_setting",
  UPDATE_TALENT_PROFILE: "update_talent_profile",
  READ_TALENT_CONTEXT: "read_talent_context",
  WRITE_TALENT_CONTEXT: "write_talent_context",
  READ_CAREER_COACHING_LIST: "read_career_coaching_list",
  MANAGE_CAREER_COACHING_ACTIVITY: "manage_career_coaching_activity",
  RECORD_INTERNAL_FIT_REEVALUATION_INFORMATION:
    "record_internal_fit_reevaluation_information",
  READ_COMPANY_CONNECTIONS: "read_company_connections",
  CONTACT_COMPANY: "contact_company",
} as const;

export type TalentToolName =
  (typeof TALENT_TOOL_NAMES)[keyof typeof TALENT_TOOL_NAMES];

export const DEFAULT_ENABLED_TALENT_TOOL_NAMES = [
  ...Object.keys(CAREER_AGENTIC_TOOLS),
  TALENT_TOOL_NAMES.USE_BROWSER,
  TALENT_TOOL_NAMES.SUGGEST_FORM,
  TALENT_TOOL_NAMES.WRITE_EMAIL,
  TALENT_TOOL_NAMES.RECORD_CALL_ANSWERS,
  TALENT_TOOL_NAMES.END_CALL,
  TALENT_TOOL_NAMES.WEB_SEARCH,
  TALENT_TOOL_NAMES.OPEN_URL,
  TALENT_TOOL_NAMES.SEARCH_CONNECTED_GMAIL,
  TALENT_TOOL_NAMES.READ_RECOMMENDED_OPPORTUNITIES,
  TALENT_TOOL_NAMES.GET_INTERNAL_ROLES,
  TALENT_TOOL_NAMES.GET_ROLE_CONTEXT,
  TALENT_TOOL_NAMES.UPDATE_RECOMMENDED_OPPORTUNITY_FEEDBACK,
  TALENT_TOOL_NAMES.UPSERT_DOCUMENT,
  TALENT_TOOL_NAMES.SAVE_JOB_POSTING,
  TALENT_TOOL_NAMES.LIST_DOCUMENTS,
  TALENT_TOOL_NAMES.READ_DOCUMENT,
  TALENT_TOOL_NAMES.READ_TALENT_ACTIVITY_EVENTS,
  TALENT_TOOL_NAMES.UPDATE_LANGUAGE_SETTING,
  TALENT_TOOL_NAMES.UPDATE_SETTING,
  TALENT_TOOL_NAMES.UPDATE_TALENT_PROFILE,
  TALENT_TOOL_NAMES.READ_TALENT_CONTEXT,
  TALENT_TOOL_NAMES.WRITE_TALENT_CONTEXT,
  TALENT_TOOL_NAMES.READ_CAREER_COACHING_LIST,
  TALENT_TOOL_NAMES.MANAGE_CAREER_COACHING_ACTIVITY,
  TALENT_TOOL_NAMES.READ_COMPANY_CONNECTIONS,
  TALENT_TOOL_NAMES.CONTACT_COMPANY,
] as const;

// Historical comparison runners may opt into this former shared instruction.
// Runtime replies are governed by their system/channel/task contract.
export const TALENT_TOOL_COMMON_ASSISTANT_INSTRUCTION = [
  "When replying to the user, explain the relevant observed outcome and any next step they need, in their language.",
  "Keep the detail proportional to their request and the available evidence.",
].join(" ");

const RECOMMEND_JOB_POSTINGS_ASSISTANT_INSTRUCTION = [
  "After `recommend_job_postings`, use `answerDraft` for the answer. Preserve its details about the active request, whether a new run was created, the maximum count, and next step.",
  "단순히 나열하며 설명하지 말고, 실제 사람이 사람에게 공고를 추천해주는 것처럼 다양한 형태로 설명 및 작성해.",
].join(" ");

const optionalToolString = (value: unknown) => {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
};

function normalizeCareerCoachingMinutes(value: unknown) {
  if (value === undefined || value === null) return null;
  const minutes = Number(value);
  if (![5, 10, 20].includes(minutes)) {
    throw new TalentToolError(
      "Career coaching duration must be 5, 10, or 20 minutes."
    );
  }
  return minutes;
}

const normalizeRowMemoText = (value: unknown) =>
  typeof value === "string" ? value.trim() : null;

const normalizeRowMemoOperation = (value: unknown): RowMemoOperation | null => {
  const operation = optionalToolString(value);
  return operation === "append" || operation === "update" ? operation : null;
};

function buildCommonTalentToolAssistantInstruction(instruction: unknown) {
  return [
    TALENT_TOOL_COMMON_ASSISTANT_INSTRUCTION,
    optionalToolString(instruction),
  ]
    .filter((text): text is string => Boolean(text))
    .join(" ");
}

function isTalentToolResultRecord(
  value: unknown
): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function withTalentToolAssistantInstruction(
  result: unknown,
  includeCommonInstruction = false
): Record<string, unknown> {
  if (isTalentToolResultRecord(result)) {
    if (
      result.skipCommonAssistantInstruction === true ||
      !includeCommonInstruction
    ) {
      const { skipCommonAssistantInstruction: _skip, assistantInstruction, ...rest } = result;
      const instruction = optionalToolString(assistantInstruction);
      return {
        ...rest,
        ...(instruction ? { assistantInstruction: instruction } : {}),
      };
    }
    return {
      ...result,
      assistantInstruction: buildCommonTalentToolAssistantInstruction(
        result.assistantInstruction
      ),
    };
  }

  return {
    ...(includeCommonInstruction
      ? { assistantInstruction: buildCommonTalentToolAssistantInstruction(null) }
      : {}),
    ok: true,
    result,
  };
}

function withRecommendJobPostingsAssistantInstruction(result: unknown) {
  return {
    ...(isTalentToolResultRecord(result) ? result : { ok: true, result }),
    assistantInstruction: RECOMMEND_JOB_POSTINGS_ASSISTANT_INSTRUCTION,
    skipCommonAssistantInstruction: true,
  };
}

const normalizeToolBio = (value: unknown) => {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const text = value
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text ? text.slice(0, 8000) : null;
};

const normalizeToolName = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 240) : undefined;
};

const normalizeToolLocation = (value: unknown) => {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const text = value.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 240) : null;
};

const normalizeToolProfileLink = (value: unknown) => {
  const text = optionalToolString(value);
  if (!text || text.length > 2000) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
};

function getTalentToolResponseLanguage(
  context?: TalentToolExecutionContext | null
) {
  return getCareerPromptLanguageName(context?.responseLocale);
}

function getTalentToolActivitySource(
  context?: TalentToolExecutionContext | null
) {
  return context?.channel === "voice" ? "voice" : "chat";
}

function getTalentToolCareerInteractionLabel(
  context?: TalentToolExecutionContext | null
) {
  return context?.channel === "voice" ? "Career 통화" : "Career 채팅";
}

const normalizeToolLimit = (value: unknown, fallback: number) => {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(20, Math.floor(parsed)));
};

const TALENT_ACTIVITY_EVENT_TYPES = new Set([
  "company_followed",
  "company_unfollowed",
  "insight_updated",
  "onboarding_completed",
  "profile_updated",
  "preferences_changed",
  "row_memo_added",
  "row_memo_updated",
]);

function normalizeActivityEventTypes(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((entry) => String(entry ?? "").trim())
        .filter((entry) => TALENT_ACTIVITY_EVENT_TYPES.has(entry))
    )
  );
}

function normalizeSinceDate(input: Record<string, unknown>) {
  const since = optionalToolString(input.since);
  if (since) {
    const time = Date.parse(since);
    if (!Number.isNaN(time)) return new Date(time).toISOString();
  }

  const daysBack =
    typeof input.sinceDays === "number"
      ? input.sinceDays
      : Number.parseInt(String(input.sinceDays ?? ""), 10);
  if (!Number.isFinite(daysBack)) return null;
  const normalizedDays = Math.max(1, Math.min(365, Math.floor(daysBack)));
  return new Date(
    Date.now() - normalizedDays * 24 * 60 * 60 * 1000
  ).toISOString();
}

type RecommendedOpportunityToolFeedback =
  | "review"
  | "like"
  | "dislike"
  | "keep";

const RECOMMENDED_OPPORTUNITY_TOOL_FEEDBACK = new Set<string>([
  "review",
  "like",
  "dislike",
  "keep",
]);

function normalizeRecommendedOpportunityToolFeedback(
  value: unknown
): RecommendedOpportunityToolFeedback | null {
  const text = optionalToolString(value);
  return text && RECOMMENDED_OPPORTUNITY_TOOL_FEEDBACK.has(text)
    ? (text as RecommendedOpportunityToolFeedback)
    : null;
}

function toTalentOpportunityFeedback(
  feedback: "like" | "dislike"
): TalentOpportunityFeedback {
  return feedback === "like" ? "positive" : "negative";
}

const INTERNAL_ROLE_REVIEW_FIT_REASON_LIMIT = 3;
const INTERNAL_ROLE_REVIEW_FIT_REASON_MAX_CHARS = 500;

function normalizeInternalRoleReviewFitReasons(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) =>
      item
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, INTERNAL_ROLE_REVIEW_FIT_REASON_MAX_CHARS)
    )
    .filter(Boolean)
    .slice(0, INTERNAL_ROLE_REVIEW_FIT_REASON_LIMIT);
}

function compactOpportunityForTool(item: TalentOpportunityHistoryItem) {
  return {
    id: item.id,
    roleId: item.roleId,
    companyName: item.companyName,
    companyRequestIntroProgress: item.companyRequestIntroProgress,
    title: item.title,
    opportunityType: item.opportunityType,
    sourceType: item.sourceType,
    location: item.location,
    workMode: item.workMode,
    feedback: item.feedback,
    internalProgress: item.internalProgress,
    href: item.href,
  };
}

function includesLoose(haystack: string, needle: string) {
  return haystack
    .toLocaleLowerCase("ko-KR")
    .includes(needle.toLocaleLowerCase("ko-KR"));
}

function formatCompactToolDate(value: string | null | undefined) {
  return formatCareerPromptCompactDateTime(value) || null;
}

function formatRecommendedOpportunityRole(item: TalentOpportunityHistoryItem) {
  const title = optionalToolString(item.title) ?? "Untitled role";
  const companyName = optionalToolString(item.companyName) ?? "Unknown company";
  const details = [
    item.location ? `location: ${item.location}` : null,
    optionalToolString(item.workMode),
  ]
    .filter((part): part is string => Boolean(part))
    .join(", ");
  const employmentType = optionalToolString(item.employmentTypes[0]);

  return [
    `${title} at ${companyName}`,
    details ? `, ${details}` : "",
    employmentType ? ` - ${employmentType}` : "",
  ].join("");
}

function formatRecommendedOpportunityName(item: TalentOpportunityHistoryItem) {
  const title = optionalToolString(item.title) ?? "Untitled role";
  const companyName = optionalToolString(item.companyName) ?? "Unknown company";
  return `${title} at ${companyName}`;
}

function formatRecommendedOpportunityProgress(
  item: TalentOpportunityHistoryItem
) {
  if (!item.internalProgress) return null;

  return {
    acceptedAt:
      formatCompactToolDate(item.internalProgress.acceptedAt) ??
      item.internalProgress.acceptedAt,
    code: item.internalProgress.code,
    message: item.internalProgress.message,
    stage: item.internalProgress.stage,
    stageChangedAt:
      formatCompactToolDate(item.internalProgress.stageChangedAt) ??
      item.internalProgress.stageChangedAt,
    stopReason: item.internalProgress.stopReason,
  };
}

function formatCompanyRequestIntroProgress(item: TalentOpportunityHistoryItem) {
  const progress = item.companyRequestIntroProgress;
  if (!progress) return null;
  return {
    canRelayToCompany: progress.canRelayToCompany,
    connectedAt:
      formatCompactToolDate(progress.connectedAt) ?? progress.connectedAt,
    connectionId: progress.connectionId,
    latestCandidateRelayAt:
      formatCompactToolDate(progress.latestCandidateRelayAt) ??
      progress.latestCandidateRelayAt,
    latestCandidateRelayStatus: progress.latestCandidateRelayStatus,
    latestCompanyContactAt:
      formatCompactToolDate(progress.latestCompanyContactAt) ??
      progress.latestCompanyContactAt,
    origin: progress.origin,
    requestedAt:
      formatCompactToolDate(progress.requestedAt) ?? progress.requestedAt,
    status: progress.status,
    talentAcceptedAt:
      formatCompactToolDate(progress.talentAcceptedAt) ??
      progress.talentAcceptedAt,
  };
}

function shouldCloseRecommendedOpportunityFromProgress(
  item: TalentOpportunityHistoryItem
) {
  return (
    item.sourceType === "internal" &&
    item.internalProgress?.code === "closed_by_company" &&
    item.savedStage !== "closed"
  );
}

const ROLE_CONTEXT_COMPANY_DESCRIPTION_MAX_CHARS = 1600;

const ROLE_CONTEXT_ROLE_SELECT = `
  role_id,
  name,
  description,
  external_jd_url,
  location_text,
  work_mode,
  type,
  seniority_level,
  salary_range,
  status,
  is_expired,
  posted_at,
  expires_at,
  source_type,
  information,
  company_internal_roles (
    request
  ),
  company_workspace:company_workspace!inner (
    company_name,
    logo_url,
    company_db:company_db (
      name,
      logo,
      short_description,
      description,
      location,
      founded_year,
      employee_count_range
    )
  )
`;

const ROLE_CONTEXT_RECOMMENDATION_SELECT = `
  id,
  role_id,
  opportunity_type,
  fit_summary,
  fit_reasons,
  tradeoffs,
  preference_fit,
  created_at,
  feedback,
  feedback_reason,
  saved_stage
`;

function asToolRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asToolRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is Record<string, unknown> =>
          asToolRecord(entry) !== null
      )
    : [];
}

function optionalClippedToolString(value: unknown, maxLength: number) {
  const text = optionalToolString(value);
  return text ? text.slice(0, maxLength) : null;
}

function normalizeRoleContextRoleIds(value: unknown) {
  const rawValues = Array.isArray(value) ? value : [value];
  const roleIds: string[] = [];
  const seen = new Set<string>();

  for (const rawValue of rawValues) {
    const rawText = optionalToolString(rawValue);
    if (!rawText) continue;
    const postingRoleId = getPostingRoleIdFromOpportunityId(rawText);
    const roleId = normalizePostingRoleId(postingRoleId || rawText);
    if (!isPostingRoleId(roleId) || seen.has(roleId)) continue;
    seen.add(roleId);
    roleIds.push(roleId);
  }

  return roleIds;
}

function normalizeRoleContextStringArray(value: unknown) {
  return Array.isArray(value)
    ? value
        .map(optionalToolString)
        .filter((text): text is string => Boolean(text))
    : [];
}

function pickLatestRoleContextRecommendation(
  rows: readonly Record<string, unknown>[]
) {
  return [...rows].sort((left, right) => {
    const leftTime = Date.parse(String(left.created_at ?? ""));
    const rightTime = Date.parse(String(right.created_at ?? ""));
    const normalizedLeftTime = Number.isFinite(leftTime) ? leftTime : 0;
    const normalizedRightTime = Number.isFinite(rightTime) ? rightTime : 0;
    return normalizedRightTime - normalizedLeftTime;
  })[0];
}

export async function runGetRoleContext(args: {
  activityOffset: number;
  admin: any;
  /** Stored public job/company facts, without candidate matching or activity reads. */
  externalFactsOnly?: boolean;
  includeJd: boolean;
  roleIds: string[];
  userId: string;
}) {
  const roleQuery = (args.admin.from("company_roles" as any) as any)
    .select(
      args.includeJd
        ? ROLE_CONTEXT_ROLE_SELECT
        : ROLE_CONTEXT_ROLE_SELECT.replace("  description,\n", "")
    )
    .in("role_id", args.roleIds);
  if (args.externalFactsOnly) roleQuery.eq("source_type", "external");
  const [roleResponse, recommendationResponse, fitResponse] = await Promise.all(
    [
      roleQuery,
      args.externalFactsOnly ? Promise.resolve({ data: [], error: null }) : (args.admin.from("talent_opportunity_recommendation" as any) as any)
        .select(ROLE_CONTEXT_RECOMMENDATION_SELECT)
        .eq("talent_id", args.userId)
        .in("role_id", args.roleIds)
        .order("created_at", { ascending: false }),
      args.externalFactsOnly ? Promise.resolve({ data: [], error: null }) : (args.admin.from("talent_role_fit_with_selection_v1" as any) as any)
        .select(
          "opportunity_id, fit_contract_version, candidate_visible, expires_at, label, human_label, recommend, role_fit, candidate_fit, company_fit, reevaluation_criteria, reevaluation_checked_at"
        )
        .eq("talent_id", args.userId)
        .in("opportunity_id", args.roleIds),
    ]
  );

  if (roleResponse.error) {
    throw new TalentToolError(
      roleResponse.error.message ?? "Failed to load role context."
    );
  }
  if (recommendationResponse.error) {
    throw new TalentToolError(
      recommendationResponse.error.message ??
        "Failed to load role recommendation context."
    );
  }
  if (fitResponse.error) {
    throw new TalentToolError(
      fitResponse.error.message ?? "Failed to verify internal role access."
    );
  }

  const roleRows = asToolRecordArray(roleResponse.data);
  const recommendationRows = asToolRecordArray(recommendationResponse.data);
  const fitRows = asToolRecordArray(fitResponse.data);
  const roleById = new Map(
    roleRows
      .map((row) => [optionalToolString(row.role_id), row] as const)
      .filter((entry): entry is readonly [string, Record<string, unknown>] =>
        Boolean(entry[0])
      )
  );
  const recommendationsByRoleId = new Map<string, Record<string, unknown>[]>();
  const readableFitByRoleId = new Map<string, Record<string, unknown>>();

  for (const row of fitRows) {
    const roleId = optionalToolString(row.opportunity_id);
    if (roleId && isInternalRoleCandidateReadable(row)) {
      readableFitByRoleId.set(roleId, row);
    }
  }

  for (const row of recommendationRows) {
    const roleId = optionalToolString(row.role_id);
    if (!roleId) continue;
    const current = recommendationsByRoleId.get(roleId) ?? [];
    current.push(row);
    recommendationsByRoleId.set(roleId, current);
  }

  const latestRecommendationByRoleId = new Map<
    string,
    Record<string, unknown>
  >();
  for (const roleId of args.roleIds) {
    const latestRecommendation = pickLatestRoleContextRecommendation(
      recommendationsByRoleId.get(roleId) ?? []
    );
    if (latestRecommendation) {
      latestRecommendationByRoleId.set(roleId, latestRecommendation);
    }
  }
  const detailedRecommendations = await fetchTalentOpportunityHistoryByIds({
    admin: args.admin,
    ids: Array.from(latestRecommendationByRoleId.values())
      .map((row) => optionalToolString(row.id))
      .filter((id): id is string => Boolean(id)),
    includeActivityTimeline: true,
    userId: args.userId,
  });
  const detailedRecommendationById = new Map(
    detailedRecommendations.map((item) => [item.id, item] as const)
  );

  const roles = args.roleIds.map((roleId) => {
    const row = roleById.get(roleId);
    if (!row) {
      return {
        found: false,
        roleId,
      };
    }

    const workspace = asToolRecord(row.company_workspace);
    const companyDb = asToolRecord(workspace?.company_db);
    const latestRecommendation = latestRecommendationByRoleId.get(roleId);
    const sourceType = optionalToolString(row.source_type)?.toLowerCase();
    const isInternalRole = sourceType === "internal";
    const roleInformation = asToolRecord(row.information);
    const isTestOnly =
      roleInformation?.testOnly === true ||
      optionalToolString(roleInformation?.testOnly)?.toLowerCase() === "true";
    const testTalentIds = Array.isArray(roleInformation?.testTalentIds)
      ? roleInformation.testTalentIds
          .map(optionalToolString)
          .filter((id): id is string => Boolean(id))
      : [];
    const testRoleAllowed = !isTestOnly || testTalentIds.includes(args.userId);
    if (isInternalRole && !testRoleAllowed) {
      return {
        found: false,
        roleId,
      };
    }

    const detailedRecommendation = latestRecommendation
      ? detailedRecommendationById.get(
          optionalToolString(latestRecommendation.id) ?? ""
        )
      : undefined;
    const upcomingMeeting = formatUpcomingHarperMeetingForPrompt(
      detailedRecommendation?.upcomingMeeting?.startAt
    );
    const allActivities = detailedRecommendation?.talentRoleActivities ?? [];
    const recentActivity = formatTalentRoleActivitiesForPrompt(
      [...allActivities]
        .sort(
          (left, right) =>
            Date.parse(right.createdAt) - Date.parse(left.createdAt)
        )
        .slice(args.activityOffset, args.activityOffset + 10),
      10
    );
    const workspaceCompanyName = optionalToolString(workspace?.company_name);

    return {
      found: true,
      roleId,
      role: {
        roleId,
        name: optionalToolString(row.name),
        ...(args.includeJd
          ? { description: optionalToolString(row.description) }
          : {}),
        externalJdUrl: optionalToolString(row.external_jd_url),
        locationText: optionalToolString(row.location_text),
        workMode: optionalToolString(row.work_mode),
        type: normalizeRoleContextStringArray(row.type),
        seniorityLevel: optionalToolString(row.seniority_level),
        salaryRange: optionalToolString(row.salary_range),
        status: optionalToolString(row.status),
        postedAt: optionalToolString(row.posted_at),
        expiresAt: optionalToolString(row.expires_at),
        sourceType: optionalToolString(row.source_type),
        internalRequest: optionalToolString(
          getCompanyInternalRoleRequest(
            row.company_internal_roles as
              | { request?: string | null }
              | Array<{ request?: string | null }>
              | null
          )
        ),
      },
      companyDb: {
        logoUrl: resolveCompanyLogoUrl({
          companyDbLogoUrl: optionalToolString(companyDb?.logo),
          workspaceLogoUrl: optionalToolString(workspace?.logo_url),
        }),
        name: isInternalRole
          ? workspaceCompanyName
          : (optionalToolString(companyDb?.name) ?? workspaceCompanyName),
        shortDescription: optionalToolString(companyDb?.short_description),
        description: optionalClippedToolString(
          companyDb?.description,
          ROLE_CONTEXT_COMPANY_DESCRIPTION_MAX_CHARS
        ),
        hqLocation: optionalToolString(companyDb?.location),
        foundedYear:
          typeof companyDb?.founded_year === "number"
            ? companyDb.founded_year
            : optionalToolString(companyDb?.founded_year),
        employeeCountRange: companyDb?.employee_count_range ?? null,
      },
      recommendation: latestRecommendation
        ? {
            opportunityType: optionalToolString(
              latestRecommendation.opportunity_type
            ),
            fitSummary: optionalToolString(latestRecommendation.fit_summary),
            fitReasons: latestRecommendation.fit_reasons ?? [],
            tradeoffs: latestRecommendation.tradeoffs ?? [],
            preferenceFit: latestRecommendation.preference_fit ?? null,
            recommendedAt: optionalToolString(latestRecommendation.created_at),
            feedback: optionalToolString(latestRecommendation.feedback),
            feedbackReason: optionalToolString(
              latestRecommendation.feedback_reason
            ),
            savedStage: optionalToolString(latestRecommendation.saved_stage),
            ...(upcomingMeeting ? { upcomingMeeting } : {}),
            ...(recentActivity ? { recentActivity } : {}),
            activityPage: {
              offset: args.activityOffset,
              limit: 10,
              hasMore: allActivities.length > args.activityOffset + 10,
            },
          }
        : null,
      reconsiderationScheduled: hasPendingInternalRoleReconsideration(
        readableFitByRoleId.get(roleId)
      ),
    };
  });

  return {
    requestedRoleIds: args.roleIds,
    missingRoleIds: roles
      .filter((role) => !role.found)
      .map((role) => role.roleId),
    roles,
    modelOutput: formatRoleContextForModel(roles),
  };
}

async function resolveRecommendedOpportunityForFeedbackUpdate(args: {
  admin: any;
  companyName: string | null;
  opportunityId: string | null;
  roleId: string | null;
  roleTitle: string | null;
  userId: string;
}) {
  if (args.opportunityId) {
    const postingRoleId = getPostingRoleIdFromOpportunityId(args.opportunityId);
    if (postingRoleId) {
      const [opportunity] = await fetchTalentOpportunityHistoryByRoleIds({
        admin: args.admin,
        roleIds: [postingRoleId],
        userId: args.userId,
      });
      return {
        ok: true as const,
        opportunity: opportunity ?? null,
        updateOpportunityId: opportunity?.id ?? args.opportunityId,
      };
    }

    const [opportunity] = await fetchTalentOpportunityHistoryByIds({
      admin: args.admin,
      ids: [args.opportunityId],
      userId: args.userId,
    });
    if (!opportunity) {
      return {
        ok: false as const,
        reason: "not_found",
        message:
          "No recommended opportunity matched the provided opportunityId.",
        candidates: [],
      };
    }
    return {
      ok: true as const,
      opportunity,
      updateOpportunityId: args.opportunityId,
    };
  }

  if (args.roleId) {
    const roleId = args.roleId;
    const [opportunity] = await fetchTalentOpportunityHistoryByRoleIds({
      admin: args.admin,
      roleIds: [roleId],
      userId: args.userId,
    });
    return {
      ok: true as const,
      opportunity: opportunity ?? null,
      updateOpportunityId: opportunity?.id ?? toPostingOpportunityId(roleId),
    };
  }

  const opportunities = await fetchTalentOpportunityHistory({
    admin: args.admin,
    userId: args.userId,
  });
  const filtered = opportunities.filter((item) => {
    if (
      args.companyName &&
      !includesLoose(item.companyName, args.companyName)
    ) {
      return false;
    }
    if (args.roleTitle && !includesLoose(item.title, args.roleTitle)) {
      return false;
    }
    return true;
  });

  if (filtered.length === 1) {
    return {
      ok: true as const,
      opportunity: filtered[0],
      updateOpportunityId: filtered[0].id,
    };
  }

  return {
    ok: false as const,
    reason: filtered.length === 0 ? "not_found" : "ambiguous",
    message:
      filtered.length === 0
        ? "No recommended opportunity matched the provided filters."
        : "Multiple recommended opportunities matched. Ask the user which one.",
    candidates: filtered.slice(0, 5).map(compactOpportunityForTool),
  };
}

async function verifyUnrecommendedInternalRoleChoice(args: { admin: any; roleId: string; userId: string }) {
  const { data: role, error } = await args.admin.from("company_roles")
    .select("role_id,source_type,status,is_expired,expires_at,information").eq("role_id", args.roleId).maybeSingle();
  if (error) throw error;
  if (!role) return { allowed: false as const, isInternal: false, result: { ok: false, reason: "role_not_found" } };
  if (role.source_type !== "internal") return { allowed: true as const, isInternal: false };
  const info = asToolRecord(role.information);
  const testOnly = info?.testOnly === true || info?.testOnly === "true";
  const allowlisted = Array.isArray(info?.testTalentIds) && info.testTalentIds.includes(args.userId);
  const available = isInternalRoleCandidateDecisionAvailable(role.status) && !role.is_expired &&
    (!role.expires_at || Date.parse(role.expires_at) > Date.now()) && (!testOnly || allowlisted);
  return available ? { allowed: true as const, isInternal: true } : {
    allowed: false as const, isInternal: true, result: { ok: false, reason: "internal_role_not_available" },
  };
}

async function updateRecommendedOpportunityFeedback(args: {
  acceptanceMaterial?: { materialId: string | null; assignmentRevision: number };
  admin: any;
  companyName: string | null;
  feedback: RecommendedOpportunityToolFeedback;
  feedbackReason: string | null;
  fitReasons: string[];
  opportunityId: string | null;
  replacesRoleId: string | null;
  responseLocale?: string | null;
  roleId: string | null;
  roleTitle: string | null;
  userId: string;
  conversationId?: string | null;
  isMobile?: boolean | null;
  userMessageId?: number | string | null;
}) {
  if (args.replacesRoleId && args.feedback !== "review") {
    throw new TalentToolError(
      "replacesRoleId requires feedback=review and the exact target roleId."
    );
  }

  if (args.feedback === "review") {
    if (!args.roleId) {
      throw new TalentToolError(
        "feedback=review requires the exact target roleId."
      );
    }
    return presentInternalRoleRecommendationForReview({
      admin: args.admin,
      conversationId: args.conversationId,
      fitReasons: args.fitReasons,
      responseLocale: args.responseLocale,
      roleId: args.roleId,
      sourceRoleId: args.replacesRoleId ?? null,
      userId: args.userId,
      userMessageId: args.userMessageId,
    });
  }

  const resolved = await resolveRecommendedOpportunityForFeedbackUpdate({
    admin: args.admin,
    companyName: args.companyName,
    opportunityId: args.opportunityId,
    roleId: args.roleId,
    roleTitle: args.roleTitle,
    userId: args.userId,
  });

  if (!resolved.ok) {
    return {
      ok: false,
      reason: resolved.reason,
      message: resolved.message,
      candidates: resolved.candidates,
    };
  }

  const requestedRoleId =
    args.roleId ??
    (args.opportunityId
      ? getPostingRoleIdFromOpportunityId(args.opportunityId)
      : null);
  const hasFormalRecommendation =
    resolved.opportunity !== null &&
    !getPostingRoleIdFromOpportunityId(resolved.opportunity.id);
  if (
    hasFormalRecommendation &&
    resolved.opportunity?.sourceType === "internal" &&
    args.feedback !== "keep"
  ) {
    const privateReply = await recordOpsCandidateDecision({
      admin: args.admin,
      recommendationId: resolved.updateOpportunityId,
      talentId: args.userId,
      sourceMessageId: Number(args.userMessageId),
      resume: args.feedback === "like",
    });
    if (privateReply) return opsContactToolResult(privateReply.idempotent);
  }

  if (args.feedback === "keep") {
    if (
      !hasFormalRecommendation ||
      resolved.opportunity?.sourceType !== "internal"
    ) {
      return {
        ok: false,
        reason: "internal_role_review_required",
        assistantInstruction:
          "Saving requires an internal role already formally shown to this user. If the user asked to save an available matched role, use apply_to_internal_role first. Do not reveal an unpresented company proposal or record acceptance.",
      };
    }
    const result = await updateTalentOpportunityHistoryItem({
      action: "feedback",
      admin: args.admin,
      userId: args.userId,
      opportunityId: resolved.updateOpportunityId,
      feedback: "keep",
      feedbackReason: args.feedbackReason,
    });
    return {
      ok: true,
      feedback: args.feedback,
      updatedAt: result.updatedAt,
      accepted: false,
      companyShared: false,
      assistantInstruction:
        "The internal role is saved for later in the user's interested/saved list, with no acceptance or rejection. Acknowledge briefly; do not ask for a reason or imply interest was sent to the company. The user can decide later.",
    };
  }
  if (args.feedback === "like" && !hasFormalRecommendation && requestedRoleId) {
    const verification = await verifyUnrecommendedInternalRoleChoice({
      admin: args.admin,
      roleId: requestedRoleId,
      userId: args.userId,
    });
    if (!verification.allowed) return verification.result;
    if (verification.isInternal) {
      return {
        ok: false,
        blocked: true,
        reason: "internal_role_review_required",
        assistantInstruction:
          "No introduction acceptance was recorded. First use apply_to_internal_role for the user-requested exact role, then continue from the evaluation and review recommendation. Preserve the user's actual authorization and use the selected material snapshot for acceptance.",
      };
    }
  }

  if (
    args.feedback === "like" &&
    resolved.opportunity?.sourceType === "internal" &&
    resolved.opportunity.isExpired
  ) {
    const opportunity = resolved.opportunity!;
    return {
      ok: false,
      blocked: true,
      reason: "internal_opportunity_role_ended",
      opportunity: compactOpportunityForTool(opportunity),
      assistantInstruction: [
        "Tell the user clearly that this Harper-connected role is no longer active and that their acceptance was not saved as an active connection request.",
        "Apologize briefly. If the user wants another path at the same company, use get_internal_roles with matchedOnly=true and the returned company name. If a useful option exists, say only that Harper has another reviewed option and ask whether they want it added for review; do not explain, link, or show a card before it becomes a formal recommendation.",
        "Use current role availability and do not guess why hiring ended.",
      ].join(" "),
    };
  }

  const feedback = toTalentOpportunityFeedback(args.feedback);
  const savedStage =
    feedback === "positive" && resolved.opportunity?.sourceType === "internal"
      ? "connected"
      : undefined;
  let result: Awaited<ReturnType<typeof updateTalentOpportunityHistoryItem>>;
  try {
    result = await updateTalentOpportunityHistoryItem({
      acceptanceMaterial: args.acceptanceMaterial,
      action: "feedback",
      admin: args.admin,
      clearEmailAcceptanceConfirmation:
        resolved.opportunity?.sourceType === "internal",
      feedback,
      feedbackReason: args.feedbackReason,
      opportunityId: resolved.updateOpportunityId,
      savedStage,
      userId: args.userId,
    });
  } catch (error) {
    if (
      error instanceof InternalRoleAcceptanceError &&
      error.reason === "target_role_unavailable"
    ) {
      return {
        ok: false,
        blocked: true,
        reason: "internal_opportunity_role_unavailable",
        opportunity: resolved.opportunity
          ? compactOpportunityForTool(resolved.opportunity)
          : null,
        assistantInstruction: [
          "Tell the user clearly that this Harper-connected role is no longer active and that their acceptance was not recorded.",
          "Apologize briefly and offer to keep looking for other suitable opportunities.",
          "Do not guess why hiring ended or claim that anything was shared with the company.",
        ].join(" "),
      };
    }
    throw error;
  }
  const [updatedOpportunity] = await fetchTalentOpportunityHistoryByIds({
    admin: args.admin,
    ids: [result.opportunityId],
    userId: args.userId,
  });

  if (updatedOpportunity) {
    await insertTalentOpportunityFeedbackActivityEvent({
      action: feedback,
      admin: args.admin,
      conversationId: args.conversationId ?? null,
      feedbackReason: args.feedbackReason,
      opportunity: updatedOpportunity,
      userId: args.userId,
    });

    await notifyInternalOpportunityDecisionSlack({
      admin: args.admin,
      decision: feedback,
      deviceLabel:
        typeof args.isMobile === "boolean"
          ? args.isMobile
            ? "모바일"
            : "데스크탑"
          : null,
      feedbackReason: args.feedbackReason,
      opportunity: updatedOpportunity,
      sourceLabel: "Harper 채팅",
      userId: args.userId,
    });
  }

  return {
    ok: true,
    feedback: args.feedback,
    updatedAt: result.updatedAt,
    accepted: updatedOpportunity?.isAccepted ?? false,
    ...("companyShared" in result ? { companyShared: result.companyShared } : {}),
    opportunity: updatedOpportunity ? compactOpportunityForTool(updatedOpportunity) : null,
    acceptanceMaterial: updatedOpportunity?.acceptanceMaterial ?? null,
    modelOutput: formatOpportunityDecisionReceipt({ opportunity: updatedOpportunity ?? null, feedback: args.feedback,
      companyShared: "companyShared" in result && result.companyShared === true, updatedAt: result.updatedAt }),
  };
}

const INTERNAL_ROLE_PRIORITY_REVIEW_PROGRESS_KIND =
  "candidate_requested_connection";
const HARPER_INTERNAL_ROLE_COMPANY_NAME = "Harper";
const OPS_CAREER_URL = "https://matchharper.com/ops/career";

type InternalRolePriorityReviewAvailability =
  | "active"
  | "hiring_ended"
  | "hiring_paused"
  | "role_not_active";

function getInternalRolePriorityReviewAvailability(args: {
  expiresAt: string | null;
  isExpired: unknown;
  status: string | null;
}): InternalRolePriorityReviewAvailability {
  const expiresAtMs = args.expiresAt ? Date.parse(args.expiresAt) : Number.NaN;
  const hiringEnded =
    args.status === "ended" ||
    args.isExpired === true ||
    (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now());

  if (hiringEnded) return "hiring_ended";
  if (args.status === "active") return "active";
  if (args.status === "paused") return "hiring_paused";
  return "role_not_active";
}

function getUnavailableInternalRolePriorityReviewStatus(args: {
  availability: Exclude<InternalRolePriorityReviewAvailability, "active">;
  hasExistingRequest: boolean;
}) {
  const prefix = args.hasExistingRequest ? "existing_request_" : "";
  return `${prefix}${args.availability}`;
}

function buildUnavailableInternalRolePriorityReviewInstruction(args: {
  availability: Exclude<InternalRolePriorityReviewAvailability, "active">;
  hasExistingRequest: boolean;
}) {
  const roleAvailability =
    args.availability === "hiring_ended"
      ? "Hiring for this exact role has ended."
      : args.availability === "hiring_paused"
        ? "Hiring for this exact role is currently paused."
        : "This exact role is not currently active.";
  const requestState = args.hasExistingRequest
    ? "The existing priority-review request remains recorded; do not imply that a duplicate request was created."
    : "The priority-review request was not saved.";

  return [
    `Tell the user: ${roleAvailability}`,
    `Explain that this availability change is about the role, not a negative decision about the candidate. ${requestState}`,
    ...(args.hasExistingRequest
      ? [
          "Say Harper will continue checking other suitable connected opportunities.",
        ]
      : []),
    "Do not promise a connection, interview, referral, company introduction, or specific timeline.",
  ].join(" ");
}

function buildPriorityReviewHoldQuestion(args: {
  fitRecord: Record<string, unknown> | null;
  locale?: string | null;
}) {
  const fitId = optionalToolString(args.fitRecord?.id);
  const criteria = args.fitRecord?.reevaluation_criteria;
  const criteriaRecord = asToolRecord(criteria);
  if (
    !fitId ||
    !criteriaRecord ||
    !hasExplicitInternalFitReevaluationTopic(criteria) ||
    optionalToolString(criteriaRecord.new_information)
  ) {
    return null;
  }

  const summary = normalizeInternalFitQuestionText(criteriaRecord.question);
  if (!summary) return null;
  const [question] = groupInternalFitHoldQuestionCandidates(
    [{ criteria, fitId, summary }],
    args.locale
  );
  return question?.summary ?? null;
}

async function fetchEarliestInternalRolePriorityReview(args: {
  admin: any;
  roleId: string;
  userId: string;
}) {
  const { data, error } = await ((
    args.admin.from("talent_progress" as any) as any
  )
    .select("id, created_at")
    .eq("talent_id", args.userId)
    .eq("role_id", args.roleId)
    .eq("kind", INTERNAL_ROLE_PRIORITY_REVIEW_PROGRESS_KIND)
    .is("metadata->>withdrawnAt", null)
    .order("created_at", { ascending: true })
    .limit(1) as any);

  if (error) {
    throw new TalentToolError(
      error.message ?? "Failed to check existing priority request."
    );
  }

  return asToolRecord(Array.isArray(data) ? data[0] : null);
}

async function readInternalRolePriorityReviewArchive(args: {
  admin: any;
  companyName: string;
  hasRecommendation?: boolean;
  matchingReview?: Record<string, unknown> | null;
  requestId: string;
  requestedAt: string;
  roleId: string;
  roleTitle: string | null;
  userId: string;
}) {
  if (
    args.hasRecommendation ||
    !isPriorityReviewInboxArchived(args.requestedAt)
  )
    return null;
  const [reviewResult, recommendationResult] = await Promise.all([
    args.matchingReview !== undefined
      ? Promise.resolve({ data: [args.matchingReview], error: null })
      : (args.admin.from("talent_opportunity_matching_review") as any)
          .select("decision, reviewed_at")
          .eq("talent_id", args.userId)
          .eq("opportunity_id", args.roleId)
          .eq("priority_request_id", args.requestId)
          .is("closed_at", null)
          .order("reviewed_at", { ascending: false })
          .limit(1),
    args.hasRecommendation !== undefined
      ? Promise.resolve({ data: [], error: null })
      : (args.admin.from("talent_opportunity_recommendation") as any)
          .select("id")
          .eq("talent_id", args.userId)
          .eq("role_id", args.roleId)
          .limit(1),
  ]);
  if (reviewResult.error || recommendationResult.error) {
    throw new TalentToolError(
      "Failed to verify the priority-review archive state."
    );
  }
  const review = asToolRecord(
    Array.isArray(reviewResult.data) ? reviewResult.data[0] : null
  );
  if (
    (recommendationResult.data ?? []).length ||
    !isPriorityReviewInboxArchived(args.requestedAt, review?.decision)
  )
    return null;

  const { data, error } = await (
    args.admin.from("company_intro_candidates") as any
  )
    .select("status, close_reason, requested_at")
    .eq("talent_id", args.userId)
    .eq("role_id", args.roleId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error)
    throw new TalentToolError(
      "Failed to read the company's introduction response."
    );
  const proposal = asToolRecord(Array.isArray(data) ? data[0] : null);
  // 4주 경과는 Inbox 정리 기준이다. 이미 회사가 연결을 요청한 진행은 종료하지 않는다.
  if (
    proposal?.requested_at ||
    ["awaiting_talent", "connecting", "connected"].includes(
      String(proposal?.status)
    )
  ) {
    return null;
  }
  return {
    ok: true,
    status: "already_exists",
    roleId: args.roleId,
    roleTitle: args.roleTitle,
    companyName: args.companyName,
    requestedAt: args.requestedAt,
    requestCreated: false,
    hasActiveRequest: true,
    inboxArchived: true,
    companyReviewProposed: Boolean(proposal),
    companyConnectionRequested: false,
    assistantInstruction: [
      "Explain warmly that four weeks have passed since this priority-review request without a company introduction request. Harper has closed the waiting item in the 할 일/Inbox tab so the user does not need to keep waiting or worrying about it. The original interest remains recorded; this call did not create or renew a request or stop a separate matching process.",
      proposal
        ? "The profile was put forward for the company's review and the company was invited to consider an introduction. Explain that this has not led to a company introduction request."
        : "The user's interest was recorded, but a company-side profile proposal is not verified. Explain the lack of a connection without claiming that their profile was delivered or an introduction was requested.",
      proposal?.status === "passed" &&
      proposal?.close_reason === "company_passed"
        ? "The company explicitly chose not to request an introduction for this proposal. Describe that recorded decision without extending it to other roles."
        : "The company may be busy or its hiring priorities may have changed; present these only as possible explanations, not known facts or an inferred rejection.",
      "Harper will continue checking for suitable opportunities and relevant changes through its existing routine. Do not invent a new scheduled follow-up or guarantee a response. Suggest applying directly through the company's own channel as a useful alternative and offer help.",
    ].join(" "),
  };
}

function formatKstDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Seoul",
    year: "numeric",
  }).formatToParts(date);
  const partByType = new Map(parts.map((part) => [part.type, part.value]));
  const year = partByType.get("year");
  const month = partByType.get("month");
  const day = partByType.get("day");
  return year && month && day ? `${year}-${month}-${day} KST` : null;
}

function isHarperInternalRoleCompany(companyName: string | null | undefined) {
  return companyName === HARPER_INTERNAL_ROLE_COMPANY_NAME;
}

function suppressPriorityReviewHiringNotification(
  roleInformation: Record<string, unknown> | null
) {
  return (
    roleInformation?.suppressPriorityReviewHiringNotification === true ||
    optionalToolString(
      roleInformation?.suppressPriorityReviewHiringNotification
    )?.toLowerCase() === "true"
  );
}

function getPriorityReviewGroupName(
  roleInformation: Record<string, unknown> | null
) {
  return optionalClippedToolString(
    roleInformation?.priorityReviewGroupName,
    160
  );
}

async function fetchConversationEntryOfficialJobLabel(args: {
  admin: any;
  conversationId?: string | null;
  roleId: string;
  userId: string;
}) {
  if (!args.conversationId) return null;
  const context = await fetchCareerPostOnboardingContext({
    admin: args.admin,
    conversationId: args.conversationId,
    userId: args.userId,
  });
  const opportunity = context?.entryOpportunity;
  if (opportunity?.verifiedActiveRoleId !== args.roleId) return null;

  return {
    companyName: optionalToolString(opportunity.companyName),
    roleTitle: optionalToolString(opportunity.roleTitle),
  };
}

function getHiringSlackWebhookUrl() {
  return process.env.SLACK_HIRING_TOKEN?.trim() ?? "";
}

function normalizeSlackText(value: unknown) {
  return String(value ?? "").trim();
}

function escapeSlackText(value: unknown) {
  return normalizeSlackText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeSlackLinkUrl(value: unknown) {
  return normalizeSlackText(value)
    .replace(/\s/g, "%20")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E")
    .replace(/\|/g, "%7C");
}

function formatSlackLink(url: unknown, text: unknown) {
  const label = normalizeSlackText(text);
  const safeUrl = escapeSlackLinkUrl(url);
  if (!safeUrl || !label) return escapeSlackText(label);
  return `<${safeUrl}|${escapeSlackText(label)}>`;
}

function buildOpsCareerUserUrl(userId: string) {
  const url = new URL(OPS_CAREER_URL);
  url.searchParams.set("userId", userId);
  return url.toString();
}

async function notifyHarperInternalRolePriorityReviewSlack(args: {
  admin: TalentAdminClient;
  requestedAt: string;
  roleId: string;
  roleTitle?: string | null;
  userId: string;
}) {
  if (process.env.NEXT_PUBLIC_WORKER_TEST_MODE === "true") return false;

  const webhookUrl = getHiringSlackWebhookUrl();
  if (!webhookUrl) {
    console.warn("[internal-role-priority-review] SLACK_HIRING_TOKEN missing");
    return false;
  }

  const profile = await fetchTalentUserProfile({
    admin: args.admin,
    userId: args.userId,
  });
  const emailName = optionalToolString(profile?.email)?.split("@")[0] ?? null;
  const name = optionalToolString(profile?.name) ?? emailName ?? "Unknown";
  const headline = optionalToolString(profile?.headline) ?? "-";
  const roleTitle = optionalToolString(args.roleTitle) ?? args.roleId;
  const latestEntryPage = await fetchLatestInternalRoleRequestEntryPage({
    admin: args.admin,
    before: args.requestedAt,
    email: optionalToolString(profile?.email),
    userId: args.userId,
  });

  const lines = [
    "*Harper internal role request*",
    `*Candidate*: ${formatSlackLink(buildOpsCareerUserUrl(args.userId), name)}`,
    `*Headline*: ${escapeSlackText(headline)}`,
    `*Latest page before request*: ${latestEntryPage ?? "Unknown"}`,
    `*Role*: ${escapeSlackText(roleTitle)}`,
  ];

  const webhook = new IncomingWebhook(webhookUrl);
  await webhook.send({
    text: `Harper internal role request - ${name}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: lines.join("\n"),
        },
      },
    ],
  });

  return true;
}

async function presentInternalRoleRecommendationForReview(args: {
  admin: any;
  conversationId?: string | null;
  fitReasons: string[];
  responseLocale?: string | null;
  roleId: string;
  sourceRoleId?: string | null;
  userId: string;
  userMessageId?: number | string | null;
}) {
  const roleId = normalizePostingRoleId(args.roleId);
  if (!isPostingRoleId(roleId)) {
    throw new TalentToolError(
      "update_recommended_opportunity_feedback requires a valid roleId."
    );
  }

  const sourceRoleId = normalizePostingRoleId(args.sourceRoleId);
  if (args.sourceRoleId && !isPostingRoleId(sourceRoleId)) {
    throw new TalentToolError(
      "update_recommended_opportunity_feedback requires a valid replacesRoleId."
    );
  }

  const fitReasons = normalizeInternalRoleReviewFitReasons(args.fitReasons);
  if (fitReasons.length === 0) {
    throw new TalentToolError(
      "feedback=review requires one to three candidate-safe fitReasons."
    );
  }

  const verification = await verifyUnrecommendedInternalRoleChoice({
    admin: args.admin,
    roleId,
    userId: args.userId,
  });
  if (!verification.allowed) return verification.result;
  if (!verification.isInternal) {
    throw new TalentToolError(
      "feedback=review is available only for a verified internal role."
    );
  }

  const { data, error } = await (args.admin.rpc as any)(
    "present_talent_internal_role_recommendation_for_review_v1",
    {
      p_context: {
        conversationId: args.conversationId ?? null,
        fitReasons,
        responseLocale: args.responseLocale ?? "en",
        userMessageId: args.userMessageId ?? null,
      },
      p_source_role_id: sourceRoleId || null,
      p_talent_id: args.userId,
      p_target_role_id: roleId,
    }
  );
  if (error) {
    throw new TalentToolError(
      error.message ?? "Failed to update the selected internal role."
    );
  }

  const result = asToolRecord(data) ?? {};
  const status = optionalToolString(result.status) ?? "action_unavailable";
  const targetRoleName = optionalToolString(result.targetRoleName);
  const targetRecommendationId = optionalToolString(
    result.targetRecommendationId
  );
  const reason = optionalToolString(result.reason);

  if (status === "recommended") {
    let updatedOpportunity = null;
    if (targetRecommendationId) {
      [updatedOpportunity] = await fetchTalentOpportunityHistoryByIds({
        admin: args.admin,
        ids: [targetRecommendationId],
        userId: args.userId,
      });
    }

    return {
      ok: true,
      status,
      targetRoleId: roleId,
      targetRoleName,
      companyShared: false,
      recommendedAt: optionalToolString(result.recommendedAt),
      postingRoleIds: [roleId],
      opportunity: updatedOpportunity
        ? compactOpportunityForTool(updatedOpportunity)
        : null,
      assistantInstruction: [
        `This role is now formally available for review. Before answering, call get_role_context with roleId=${roleId} and include_jd=true, then give a substantive explanation of the company, the role's actual scope, why ${targetRoleName ?? "the requested role"} may fit, and any meaningful public-safe tradeoff.`,
        "Say the role has been added as a formal recommendation, but nothing has been sent to the company. if user accept, Harper will introduce you to the company.",
        "This is an internal Harper-connected role. Never describe it as an external or public opportunity, and do not attribute information limits to it being external.",
        "Tell the user they can read the full role in the Positions tab in Korean or the Jobs tab in English, and ask them to accept there or tell Harper after reviewing it if they still want to proceed.",
        "Do not say the role was switched, selected, accepted, connected, or sent to the company.",
      ].join(" "),
    };
  }

  if (status === "no_change") {
    return {
      ok: true,
      status: "no_change",
      reason,
      targetRoleId: roleId,
      targetRoleName,
      targetAccepted: result.targetAccepted === true,
      companyShared: result.companyShared === true,
      ...(result.targetAccepted === true ? {} : { postingRoleIds: [roleId] }),
      assistantInstruction:
        result.targetAccepted === true
          ? "Tell the user this role has already been accepted. Accurately state whether the company has received their information using companyShared."
          : `Before answering, call get_role_context with roleId=${roleId} and include_jd=true. Explain this current formal recommendation in useful detail, say it is available in the Positions tab in Korean or the Jobs tab in English, and ask the user to accept there or tell Harper after reviewing it if they still want to proceed. It has not been accepted. Never describe it as an external or public opportunity.`,
    };
  }

  if (status === "required_next_step") {
    return {
      ok: false,
      status: "required_next_step",
      reason,
      targetRoleId: roleId,
      assistantInstruction:
        reason === "onboarding_required"
          ? "Tell the user Harper needs them to finish the current career onboarding step before adding this role for review. Do not say the role was recommended or accepted."
          : "Tell the user their current profile-sharing setting prevents Harper from adding this role for review. Ask whether they want to enable sharing for Harper-connected opportunities. Do not change the setting or say the role was recommended or accepted.",
    };
  }

  if (status === "unavailable") {
    return {
      ok: false,
      status: "unavailable",
      reason,
      targetRoleId: roleId,
      targetRoleName,
      assistantInstruction:
        "Tell the user Harper could not add or accept this exact role because it is no longer a currently available, already-reviewed option. Do not mention fit labels or promise a new evaluation.",
    };
  }

  return {
    ok: false,
    status: "action_unavailable",
    reason,
    targetRoleId: roleId,
    targetRoleName,
    companyShared: result.companyShared === true,
    assistantInstruction: [
      "Tell the user the role was not added or accepted in this conversation.",
      result.companyShared === true
        ? "Explain that the company-side process has already started, so Harper needs to verify the role change without altering the current process."
        : "Explain that the existing role history needs to be checked before Harper can change it.",
      "Do not claim that a review request was recorded unless a separate register action actually succeeded.",
    ].join(" "),
  };
}

async function updateInternalRolePriorityReview(args: {
  action: "register" | "withdraw" | "status";
  admin: any;
  conversationId?: string | null;
  responseLocale?: string | null;
  roleId: string;
  userId: string;
  userMessageId?: number | string | null;
}) {
  const roleId = normalizePostingRoleId(args.roleId);
  if (!isPostingRoleId(roleId)) {
    throw new TalentToolError(
      "internal_role_priority_review requires a valid roleId."
    );
  }

  let profileVisibility: string | null = null;
  if (args.action === "register") {
    const { data: setting, error } = await args.admin
      .from("talent_setting")
      .select("is_onboarding_done, profile_visibility")
      .eq("user_id", args.userId)
      .maybeSingle();
    if (error) {
      throw new TalentToolError("Could not verify onboarding completion.");
    }
    profileVisibility = optionalToolString(setting?.profile_visibility);
    if (setting?.is_onboarding_done !== true) {
      return {
        ok: false,
        status: "onboarding_required",
        requestCreated: false,
        companyShared: false,
        assistantInstruction:
          "Explain warmly that Harper directly helps introduce candidates to companies, so it needs the candidate's career background and preferences from onboarding to assess the opportunity and introduce them accurately. Ask them to complete onboarding first and help them continue it. The priority-review request was not registered and no profile was shared. Do not frame incomplete onboarding as rejection or promise acceptance or a hiring outcome.",
      };
    }
  }

  const { data: role, error: roleError } = await ((
    args.admin.from("company_roles" as any) as any
  )
    .select(
      `
        role_id,
        name,
        source_type,
        status,
        is_expired,
        expires_at,
        information,
        company_workspace:company_workspace (
          company_name,
          published_name
        )
      `
    )
    .eq("role_id", roleId)
    .maybeSingle() as any);

  if (roleError) {
    throw new TalentToolError(
      roleError.message ?? "Failed to verify the internal role."
    );
  }

  const roleRecord = asToolRecord(role);
  if (!roleRecord) {
    return {
      ok: false,
      status: "role_not_found",
      roleId,
      assistantInstruction: `Tell the user Harper could not verify the exact role yet. Ask for the company name, role title, or link so Harper can identify it. ${args.action === "status" ? "Do not claim the priority-review status was verified." : `Do not say the priority-review request was ${args.action === "register" ? "saved" : "withdrawn"}.`}`,
    };
  }

  const sourceType = optionalToolString(roleRecord.source_type)?.toLowerCase();
  if (sourceType !== "internal") {
    return {
      ok: false,
      status: "not_internal_role",
      roleId,
      assistantInstruction: `Tell the user Harper could not ${args.action === "status" ? "read" : args.action === "register" ? "save" : "withdraw"} this priority internal-role review request because it is not verified as a Harper-connected role. Do not promise a connection, interview, referral, company introduction, or specific timeline.`,
    };
  }

  const roleStatus = optionalToolString(roleRecord.status)?.toLowerCase();
  const expiresAt = optionalToolString(roleRecord.expires_at);
  const roleAvailability = getInternalRolePriorityReviewAvailability({
    expiresAt,
    isExpired: roleRecord.is_expired,
    status: roleStatus ?? null,
  });
  const roleInformation = asToolRecord(roleRecord.information);
  if (
    roleInformation?.testOnly === true ||
    optionalToolString(roleInformation?.testOnly)?.toLowerCase() === "true"
  ) {
    return {
      ok: false,
      status: "role_not_found",
      roleId,
      assistantInstruction:
        "Tell the user Harper could not verify the exact role. Do not expose or infer any test-only role details.",
    };
  }
  const priorityReviewGroupName = getPriorityReviewGroupName(roleInformation);
  const roleIsAvailable =
    roleAvailability === "active" || roleAvailability === "hiring_paused";
  const workspace = asToolRecord(roleRecord.company_workspace);
  const rawCompanyName = optionalToolString(workspace?.company_name);
  const officialJobLabel = await fetchConversationEntryOfficialJobLabel({
    admin: args.admin,
    conversationId: args.conversationId,
    roleId,
    userId: args.userId,
  });
  const companyName =
    officialJobLabel?.companyName ??
    priorityReviewGroupName ??
    optionalToolString(workspace?.published_name) ??
    "Undisclosed internal company";
  const roleTitle =
    officialJobLabel?.roleTitle ?? optionalToolString(roleRecord.name);

  if (args.action === "status") {
    const existing = await fetchEarliestInternalRolePriorityReview({
      admin: args.admin,
      roleId,
      userId: args.userId,
    });
    const { data, error } = existing
      ? await (
          args.admin.from("talent_opportunity_matching_review" as any) as any
        )
          .select("reviewed_at, decision")
          .eq("talent_id", args.userId)
          .eq("opportunity_id", roleId)
          .eq("priority_request_id", existing.id)
          .is("closed_at", null)
          .order("reviewed_at", { ascending: false })
          .limit(1)
      : await (args.admin.from("talent_progress" as any) as any)
          .select("created_at, metadata")
          .eq("talent_id", args.userId)
          .eq("role_id", roleId)
          .eq("kind", INTERNAL_ROLE_PRIORITY_REVIEW_PROGRESS_KIND)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(1);
    if (error) {
      throw new TalentToolError(
        error.message ?? "Failed to read priority-review status."
      );
    }
    const latest = asToolRecord(Array.isArray(data) ? data[0] : null);
    const withdrawnAt = optionalToolString(
      asToolRecord(latest?.metadata)?.withdrawnAt
    );
    const requestedAt = optionalToolString(
      existing?.created_at ?? latest?.created_at
    );
    const reviewedAt = existing
      ? optionalToolString(latest?.reviewed_at)
      : null;
    const hasActiveRequest = Boolean(existing || (latest && !withdrawnAt));
    if (existing && requestedAt && roleIsAvailable) {
      const archived = await readInternalRolePriorityReviewArchive({
        admin: args.admin,
        companyName,
        matchingReview: latest,
        requestId: String(existing.id),
        requestedAt,
        roleId,
        roleTitle: roleTitle ?? null,
        userId: args.userId,
      });
      if (archived) return archived;
    }
    return {
      ok: true,
      status: hasActiveRequest
        ? "already_exists"
        : withdrawnAt
          ? "withdrawn"
          : "not_registered",
      roleId,
      roleTitle,
      companyName,
      requestCreated: false,
      hasActiveRequest,
      requestedAt,
      withdrawnAt,
      reviewedAt,
      ...(hasActiveRequest
        ? { reviewState: reviewedAt ? "reviewed" : "review_requested" }
        : {}),
      assistantInstruction: [
        hasActiveRequest
          ? "The existing priority-review request remains recorded. Use reviewedAt only to establish that a review of this exact request was completed; otherwise review completion is not verified. This result does not establish recommendation eligibility, company sharing, or the company's hiring decision."
          : withdrawnAt
            ? "The priority-review request for this exact role was already withdrawn. Explain that it is no longer an active priority-review request, using withdrawnAt when useful."
            : "There is no recorded priority-review request for this exact role.",
        "This was a read-only status check: no request was registered, renewed, or withdrawn. Use register only if the user explicitly asks to register or renew the request, never merely to check progress.",
      ].join(" "),
    };
  }

  if (args.action === "withdraw") {
    const existing = await fetchEarliestInternalRolePriorityReview({
      admin: args.admin,
      roleId,
      userId: args.userId,
    });
    const existingCreatedAt = optionalToolString(existing?.created_at);
    if (!existingCreatedAt) {
      return {
        ok: true,
        status: "not_registered",
        roleId,
        roleTitle,
        companyName,
        assistantInstruction: [
          "Tell the user there was no active priority-review request to withdraw for this role.",
          "Say they can register it later if they become interested again.",
        ].join(" "),
      };
    }

    const { error: withdrawError } = await (args.admin.rpc as any)(
      "withdraw_candidate_priority_review_v1",
      {
        p_talent_id: args.userId,
        p_role_id: roleId,
        p_source: {
          conversationId: args.conversationId ?? null,
          userMessageId: args.userMessageId ?? null,
          source: "career_chat",
        },
      }
    );

    if (withdrawError) {
      throw new TalentToolError(
        withdrawError.message ?? "Failed to withdraw priority review request."
      );
    }

    const withdrawnAt = new Date().toISOString();
    return {
      ok: true,
      status: "withdrawn",
      roleId,
      roleTitle,
      companyName,
      previousCreatedAt: existingCreatedAt,
      withdrawnAt,
      withdrawnDate: formatKstDate(withdrawnAt),
      assistantInstruction: [
        "Tell the user Harper withdrew the priority-review request for this role.",
        "Explain that this role will no longer be treated as an explicitly requested priority review, and say they can register it again later.",
        "Do not imply that this deletes unrelated recommendations, profile information, or account data.",
      ].join(" "),
    };
  }

  const [existing, fitResult, recommendationResult, progressTagResult] =
    await Promise.all([
      fetchEarliestInternalRolePriorityReview({
        admin: args.admin,
        roleId,
        userId: args.userId,
      }),
      (args.admin.from("talent_role_fit_with_selection_v1" as any) as any)
        .select(
          "id, fit_contract_version, candidate_visible, priority_review_recommendable, label, human_label, recommend, reason, role_fit, candidate_fit, company_fit, reevaluation_criteria, reevaluation_checked_at"
        )
        .eq("talent_id", args.userId)
        .eq("opportunity_id", roleId)
        .maybeSingle() as any,
      (args.admin.from("talent_opportunity_recommendation" as any) as any)
        .select("id, created_at, feedback, saved_stage")
        .eq("talent_id", args.userId)
        .eq("role_id", roleId)
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1) as any,
      (args.admin.from("talent_opportunity_tag" as any) as any)
        .select("tag, updated_at, created_at")
        .eq("talent_id", args.userId)
        .eq("opportunity_id", roleId)
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false }) as any,
    ]);
  if (
    fitResult.error ||
    recommendationResult.error ||
    progressTagResult.error
  ) {
    throw new TalentToolError(
      fitResult.error?.message ??
        recommendationResult.error?.message ??
        progressTagResult.error?.message ??
        "Failed to verify the internal role review state."
    );
  }

  const existingCreatedAt = optionalToolString(existing?.created_at);
  const fitRecord = asToolRecord(fitResult.data);
  const effectiveFitLabel = (
    optionalToolString(fitRecord?.human_label) ??
    optionalToolString(fitRecord?.label)
  )?.toLowerCase();
  const candidatePreferenceState = optionalToolString(
    fitRecord?.candidate_fit
  )?.toLowerCase();
  const candidatePreferenceMismatch =
    !optionalToolString(fitRecord?.human_label) &&
    optionalToolString(fitRecord?.role_fit)?.toLowerCase() === "fit" &&
    optionalToolString(fitRecord?.company_fit)?.toLowerCase() === "fit" &&
    (candidatePreferenceState === "middle" ||
      candidatePreferenceState === "unfit");
  const reconsiderationAvailable =
    isInternalRoleReconsiderationEligible(fitRecord);
  const reasoningOnlyCandidatePreferenceContext = candidatePreferenceMismatch
    ? optionalClippedToolString(fitRecord?.reason, 700)
    : null;
  const reconsiderationScheduled =
    hasPendingInternalRoleReconsideration(fitRecord);
  const latestRecommendation = Array.isArray(recommendationResult.data)
    ? asToolRecord(recommendationResult.data[0])
    : null;
  const latestProgressTag = (
    Array.isArray(progressTagResult.data) ? progressTagResult.data : []
  )
    .map((row: unknown) => optionalToolString(asToolRecord(row)?.tag))
    .filter((tag: string | null): tag is string => Boolean(tag))
    .find(
      (tag: string) => tag.startsWith("내부:") || tag.startsWith("내부단계:")
    );
  if (!roleIsAvailable) {
    const unavailableAvailability = roleAvailability as Exclude<
      InternalRolePriorityReviewAvailability,
      "active"
    >;
    if (existingCreatedAt) {
      return {
        ok: true,
        status: getUnavailableInternalRolePriorityReviewStatus({
          availability: unavailableAvailability,
          hasExistingRequest: true,
        }),
        roleId,
        roleTitle,
        companyName,
        requestedAt: existingCreatedAt,
        requestedDate: formatKstDate(existingCreatedAt),
        assistantInstruction:
          buildUnavailableInternalRolePriorityReviewInstruction({
            availability: unavailableAvailability,
            hasExistingRequest: true,
          }),
      };
    }
    return {
      ok: false,
      status: getUnavailableInternalRolePriorityReviewStatus({
        availability: unavailableAvailability,
        hasExistingRequest: false,
      }),
      roleId,
      assistantInstruction:
        buildUnavailableInternalRolePriorityReviewInstruction({
          availability: unavailableAvailability,
          hasExistingRequest: false,
        }),
    };
  }

  if (latestRecommendation) {
    const recommendationFeedback = optionalToolString(
      latestRecommendation.feedback
    )?.toLowerCase();
    const recommendationSavedStage = optionalToolString(
      latestRecommendation.saved_stage
    )?.toLowerCase();
    const recommendationState =
      recommendationSavedStage === "closed" ||
      latestProgressTag === "내부:프로세스중단" ||
      latestProgressTag === "내부:아카이브"
        ? "closed"
        : recommendationFeedback === "dislike" ||
            recommendationFeedback === "negative" ||
            latestProgressTag === "내부:거절"
          ? "declined"
          : recommendationFeedback === "like" ||
              recommendationFeedback === "positive" ||
              recommendationSavedStage === "connected"
            ? "accepted"
            : "current";
    const status =
      recommendationState === "closed"
        ? "previous_process_closed"
        : recommendationState === "declined"
          ? "previously_declined"
          : recommendationState === "accepted"
            ? "already_accepted"
            : "already_formally_recommended";
    return {
      ok: true,
      status,
      roleId,
      roleTitle,
      companyName,
      recommendationId: optionalToolString(latestRecommendation.id),
      recommendationState,
      ...(recommendationState === "current"
        ? { postingRoleIds: [roleId] }
        : {}),
      assistantInstruction: buildInternalRolePriorityReviewAssistantInstruction(
        {
          alreadyRecommended: true,
          candidatePreferenceMismatch: false,
          candidatePreferenceReconsiderationAvailable: false,
          effectiveFitLabel,
          hasClarificationQuestion: false,
          recommendationFeedback,
          recommendationState,
          recommendationSavedStage,
          reconsiderationScheduled: false,
          priorityReviewGroupName,
          requestCreated: false,
          requestReachedFourteenDays: hasPriorityReviewReachedFourteenDays({
            requestedAt: existingCreatedAt,
          }),
        }
      ),
    };
  }

  if (existing && existingCreatedAt) {
    const archived = await readInternalRolePriorityReviewArchive({
      admin: args.admin,
      companyName,
      hasRecommendation: false,
      requestId: String(existing.id),
      requestedAt: existingCreatedAt,
      roleId,
      roleTitle: roleTitle ?? null,
      userId: args.userId,
    });
    if (archived) return archived;
  }

  let requestedAt = existingCreatedAt;
  let requestCreated = false;
  if (!requestedAt) {
    const now = new Date().toISOString();
    const { data: inserted, error: insertError } = await ((
      args.admin.from("talent_progress" as any) as any
    )
      .insert({
        kind: INTERNAL_ROLE_PRIORITY_REVIEW_PROGRESS_KIND,
        metadata: {
          conversationId: args.conversationId ?? null,
          priority: "high",
          source: "career_chat",
          status: "requested",
          userMessageId: args.userMessageId ?? null,
        },
        role_id: roleId,
        talent_id: args.userId,
        text: "User requested priority review for connection to this role.",
        user_id: args.userId,
      })
      .select("id, created_at")
      .single() as any);

    if (insertError) {
      if (optionalToolString(insertError.code) === "23505") {
        const racedRequest = await fetchEarliestInternalRolePriorityReview({
          admin: args.admin,
          roleId,
          userId: args.userId,
        });
        requestedAt = optionalToolString(racedRequest?.created_at);
        if (!requestedAt) {
          throw new TalentToolError(
            insertError.message ??
              "Failed to resolve the existing priority review request."
          );
        }
      } else {
        throw new TalentToolError(
          insertError.message ?? "Failed to save priority review request."
        );
      }
    } else {
      requestedAt = optionalToolString(inserted?.created_at) ?? now;
      requestCreated = true;
    }

    if (
      requestCreated &&
      isHarperInternalRoleCompany(rawCompanyName) &&
      !suppressPriorityReviewHiringNotification(roleInformation)
    ) {
      try {
        await notifyHarperInternalRolePriorityReviewSlack({
          admin: args.admin as TalentAdminClient,
          requestedAt,
          roleId,
          roleTitle,
          userId: args.userId,
        });
      } catch (error) {
        console.error("[internal-role-priority-review] slack notify failed", {
          error: formatToolError(error),
          roleId,
          userId: args.userId,
        });
      }
    }
  }

  // true: 지금 정식 추천 카드를 보여줄 수 있음. false: 평가가 없거나 추천 조건을 충족하지 못함.
  const recommendationAvailable =
    isInternalRolePriorityReviewRecommendable(fitRecord);
  return {
    ok: true,
    // created: 이번에 새로 요청함. already_exists: 이전 요청이 이미 있음.
    status: requestCreated ? "created" : "already_exists",
    roleId,
    roleTitle,
    companyName,
    requestedAt,
    requestedDate: formatKstDate(requestedAt),
    requestCreated,
    // 여기서는 검토 요청만 저장하며, 프로필을 회사에 공유하지 않음.
    companyShared: false,
    recommendationAvailable,
    // true: 평가 기록이 있음(추천 가능하다는 뜻은 아님). false: 아직 평가 기록이 없음.
    hasFitAssessment: Boolean(fitRecord),
    reviewState: recommendationAvailable
      ? "recommendation_available"
      : "review_requested",
    // 사용자에게 그대로 보내는 문구가 아니라, LLM이 답변을 작성할 때 따르는 지침.
    assistantInstruction: recommendationAvailable
      ? // 추천 가능: 정식 추천 카드를 보여주고, 진행 의사를 물어봄.
        "The server verified that this exact role qualifies for recommendation after the priority-review request. Call update_recommended_opportunity_feedback with feedback=review and candidate-safe fit reasons to show its formal card now, then ask whether they want to proceed. Explain the role from known candidate and public role facts; do not make another recommendation eligibility decision. A review request alone is not acceptance or company-sharing consent."
      : // 미평가 또는 추천 조건 미충족: 요청을 받았다는 안내. 이 경우의 말투·설명은 아래에서 수정.
        `
Tell the user Harper has acknowledged their interest in the returned company and role and recorded their request for the company's agent to review their profile for this exact role.
Explain that Harper will help prepare their introduction to the company, deliver it at the appropriate time, and let them know when it happens.
The user does not need to repeat the request or take another action for this request to remain registered.
Focus on their interest and Harper's next steps rather than routinely adding disclaimers about acceptance or profile sharing.
Tell them they can check progress in the 할 일 tab in Korean or the Inbox tab in English.
Do not guarantee selection or a specific timeline, infer rejection, or override recommendationAvailable.
${profileVisibility === "exceptional_only" ? "Add one brief, optional suggestion that switching from Exceptional only to Open to matches in the Profile tab lets Harper introduce them to suitable companies first, including opportunities like this role, which can help them receive better opportunities; do not make the change a requirement for this request or change the setting for them." : ""}

이런 느낌으로 말해줘:
- ~~에 대한 ~~님의 관심을 확인했어요. 이건 Harper에게 인재 소개를 요청하고 대화중인 회사의 역할이기 때문에, 제가 직접 회사측의 에이전테에게 회원님을 소개할거에요. 다만 전달하고 소개하기까지 시간 조금 소요될 수 있습니다.
- 일반적인 지원방식과 달라서 어색할 수 있지만, 훨씬 자연스럽게 연결되는 방식이에요. 기다리면 회사한테 반드시 전달하겠다. 근데 만약 회사의 응답이 없어 외부에서 지원하시는게 낫다고 판단되면 알려주고 그걸 도와줄게요.
- Harper는 직접 요청해주시지 않아도 항상 Harper에게 인재 소개를 요청한 회사들 중 소개드릴만한 기회가 있는지 찾고 연결해드리고 있어요.

- 어떻게 진행되고 있는지는 할 일/Inbox 탭에서 확인할 수 있다.
`,
  };
}

async function requestInternalRoleReconsideration(args: {
  admin: any;
  conversationId?: string | null;
  newInformation: string;
  roleId: string;
  source: string;
  userId: string;
  userMessageId?: number | string | null;
}) {
  const roleId = normalizePostingRoleId(args.roleId);
  const newInformation = optionalClippedToolString(args.newInformation, 700);
  if (!isPostingRoleId(roleId) || !newInformation) {
    throw new TalentToolError(
      "request_internal_role_reconsideration requires roleId and newInformation."
    );
  }

  const { data, error } = await (args.admin.rpc as any)(
    "request_talent_internal_role_reconsideration_v1",
    {
      p_context: {
        conversationId: args.conversationId ?? null,
        source: args.source,
        userMessageId: args.userMessageId ?? null,
      },
      p_new_information: newInformation,
      p_role_id: roleId,
      p_talent_id: args.userId,
    }
  );
  if (error) {
    throw new TalentToolError(
      error.message ?? "Failed to schedule internal role reconsideration."
    );
  }

  const result = asToolRecord(data) ?? {};
  const status = optionalToolString(result.status) ?? "unavailable";
  const storedReason = optionalToolString(result.reason);
  // Preserve the legacy eligibility boundary without implying a staff workflow.
  const reason =
    storedReason === "human_review_required" ? "not_eligible" : storedReason;
  const reconsiderationScheduled = result.reconsiderationScheduled === true;

  if (reconsiderationScheduled) {
    if (status !== "already_scheduled") {
      try {
        await insertTalentActivityEvent({
          admin: args.admin,
          changedDomains: ["internal_opportunity_response"],
          conversationId: args.conversationId ?? null,
          eventType: "opportunity_feedback",
          impactLevel: "high",
          messageId: args.userMessageId ?? null,
          source: args.source,
          summary:
            "User provided new information and requested reconsideration of one internal role.",
          userId: args.userId,
        });
      } catch (activityError) {
        console.error("[internal-role-reconsideration] activity log failed", {
          error:
            activityError instanceof Error
              ? activityError.message
              : String(activityError),
          roleId,
          userId: args.userId,
        });
      }
    }

    return {
      ok: true,
      status,
      reason,
      fitId: optionalToolString(result.fitId),
      roleId,
      roleTitle: optionalToolString(result.roleName),
      companyName: optionalToolString(result.company),
      reconsiderationKind: optionalToolString(result.reconsiderationKind),
      reconsiderationScheduled: true,
      requestedAt: optionalToolString(result.requestedAt),
      assistantInstruction: [
        status === "already_scheduled"
          ? "Say this exact role was already scheduled for reconsideration and the newly confirmed information remains attached to that review."
          : "Say Harper saved the new information and scheduled this exact role for reconsideration.",
        "Explain that Harper will reassess whether it should become a formal recommendation; do not promise the result or a timeline.",
        "Make clear that this action did not formally recommend or accept the role and did not share anything with the company.",
      ].join(" "),
    };
  }

  const assistantInstruction =
    reason === "fit_review_in_progress"
      ? "Say this role is already in Harper's review even though there is no completed fit result yet. Do not claim a separate reconsideration was scheduled, and do not diagnose a backend error."
      : reason === "already_formally_recommended"
        ? "Say this role is already available as a formal recommendation, so a separate reconsideration was not scheduled. Ask the user to review that recommendation and respond to it directly."
        : reason === "candidate_preference_unfit"
          ? "Say Harper did not schedule reconsideration because the user's current explicit preference still conflicts with this role. Do not expose an internal label. If the user is explicitly changing that durable preference, save the new preference first and ask them to confirm the exact new direction before retrying."
          : "Say this role is not currently eligible for the requested reconsideration. Do not mention internal labels, hidden criteria, or claim that anything was scheduled.";

  return {
    ok: false,
    status,
    reason,
    roleId,
    roleTitle: optionalToolString(result.roleName),
    companyName: optionalToolString(result.company),
    reconsiderationScheduled: false,
    assistantInstruction,
  };
}

const TALENT_TOOL_REGISTRY: Record<string, TalentToolDefinition> = {
  ...CAREER_GENERAL_TOOLS,
  [RECORD_CALL_ANSWERS]: {
    name: RECORD_CALL_ANSWERS,
    description:
      TOOL_DESCRIPTIONS.record_call_answers,
    parameters: recordCallAnswersParameters,
    channels: ["voice"],
    async execute(input, context) {
      if (
        !context?.internalCallRequestId ||
        !context.userId ||
        !context.conversationId
      )
        throw new TalentToolError("No internal opportunity call is active.");
      const { callAnswersDatabase, callAnswersQuery } =
        await import("@/lib/career/internalCallAnswersDatabase.server");
      try {
        return await executeRecordCallAnswers({
          input,
          callId: context.internalCallRequestId,
          conversationId: context.conversationId,
          userId: context.userId,
          transaction: async (work) =>
            (await callAnswersDatabase().begin((tx) =>
              work(callAnswersQuery(tx)),
            )) as Awaited<ReturnType<typeof work>>,
        });
      } catch (error) {
        if (
          error instanceof Error &&
          "status" in error &&
          typeof error.status === "number"
        )
          throw new TalentToolError(error.message, error.status);
        throw error;
      }
    },
  },
  [TALENT_TOOL_NAMES.END_CALL]: {
    name: TALENT_TOOL_NAMES.END_CALL,
    description:
      TOOL_DESCRIPTIONS.end_call,
    parameters: {
      type: "object",
      properties: {
        complete_onboarding: {
          type: "boolean",
          description:
            "Complete onboarding before disconnecting. False ends only the call.",
        },
      },
      required: ["complete_onboarding"],
      additionalProperties: false,
    },
    channels: ["voice"],
  },
  [TALENT_TOOL_NAMES.WEB_SEARCH]: {
    name: TALENT_TOOL_NAMES.WEB_SEARCH,
    description: TOOL_DESCRIPTIONS.web_search,
    parameters: WEB_SEARCH_TOOL_DEFINITION.function.parameters,
    channels: ["chat", "voice"],
    voicePreamble: "잠시만요. 한번 찾아볼게요.",
    async execute(input, context) {
      const admin = context?.admin;
      if (!admin) {
        throw new TalentToolError("web_search requires service context.");
      }
      return executeSharedWebSearch(input, {
        admin: admin as TalentAdminClient,
        searchPurpose: context?.searchPurpose,
        inputError: (message) => new TalentToolError(message),
      });
    },
  },
  [TALENT_TOOL_NAMES.OPEN_URL]: {
    name: TALENT_TOOL_NAMES.OPEN_URL,
    description: TOOL_DESCRIPTIONS.open_url,
    parameters: OPEN_URL_TOOL_DEFINITION.function.parameters,
    channels: ["chat"],
    async execute(input, context) {
      const admin = context?.admin;
      if (!admin) {
        throw new TalentToolError("open_url requires service context.");
      }
      return executeSharedOpenUrl({
        admin: admin as TalentAdminClient,
        input,
        inputError: (message) => new TalentToolError(message),
      });
    },
  },
  [TALENT_TOOL_NAMES.SEARCH_CONNECTED_GMAIL]: {
    name: TALENT_TOOL_NAMES.SEARCH_CONNECTED_GMAIL,
    description:
      TOOL_DESCRIPTIONS.search_connected_gmail,
    parameters: {
      type: "object",
      properties: {
        thread_id: { type: "string", description: "Read this exact full Gmail thread, including sent replies, without applying query filters." },
        page_token: { type: "string", description: "Continue the same query with its returned next page token." },
        query: {
          type: "string",
          description:
            "A Gmail search query, such as `from:company.com newer_than:30d` or `subject:(interview OR application)`. Keep it focused on the user's request.",
        },
        max_results: {
          type: "integer",
          minimum: 1,
          maximum: 500,
          default: 5,
          description: "Gmail API page size (1-500). Use snippets for broad discovery and full threads for exact facts.",
        },
        include_content: {
          type: "boolean",
          default: false,
          description:
            "Whether normalized plain-text email content is needed. Leave false when sender, subject, date, and snippet are enough.",
        },
      },

      additionalProperties: false,
    },
    channels: ["chat"],
    async execute(input, context) {
      const admin = context?.admin;
      const userId = context?.userId;
      if (!admin || !userId) {
        throw new TalentToolError(
          "search_connected_gmail requires authenticated service context.",
        );
      }

      const query = optionalToolString(input.query)
        ?.replace(/\s+/g, " ");
      const threadId = optionalToolString(input.thread_id);
      if (!query && !threadId) throw new TalentToolError("query or thread_id is required.");

      const requestedMaxResults = Number(input.max_results ?? 5);
      const maxResults = Number.isFinite(requestedMaxResults)
        ? Math.min(500, Math.max(1, Math.floor(requestedMaxResults)))
        : 5;

      return executeConnectedGmailSearch({
        admin: admin as TalentAdminClient,
        includeContent: input.include_content === true,
        maxResults,
        query: query ?? "",
        threadId: threadId ?? undefined,
        pageToken: optionalToolString(input.page_token) ?? undefined,
        talentId: userId,
      });
    },
  },
  [TALENT_TOOL_NAMES.SAVE_JOB_POSTING]: {
    name: TALENT_TOOL_NAMES.SAVE_JOB_POSTING,
    description:
      TOOL_DESCRIPTIONS.save_job_posting,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["url"],
      properties: {
        url: {
          type: "string",
          description: "Verified public URL for one job opening.",
        },
        title: {
          type: "string",
          description: "Exact title from the user or posting, if known.",
        },
        company_name: {
          type: "string",
          description:
            "Exact hiring company from the user or posting, if known.",
        },
      },
    },
    channels: ["chat"],
    async execute(input, context) {
      if (!context?.admin || !context.userId || !optionalToolString(input.url))
        throw new TalentToolError(
          "Saving a posting requires user context and its URL.",
        );
      const { saveJobPosting } = await import("@/lib/career/saveJobPosting");
      return saveJobPosting({
        admin: context.admin as TalentAdminClient,
        talentId: context.userId,
        url: String(input.url),
        title: optionalToolString(input.title) ?? undefined,
        companyName: optionalToolString(input.company_name) ?? undefined,
      });
    },
  },
  [TALENT_TOOL_NAMES.GENERATE_RESUME]: {
    name: TALENT_TOOL_NAMES.GENERATE_RESUME,
    description:
      TOOL_DESCRIPTIONS.generate_resume,
    parameters: GENERATE_RESUME_PARAMETERS,
    channels: ["chat"],
    async execute(input, context) {
      if (
        !context?.admin ||
        !context.userId ||
        !context.userMessageId ||
        context.channel === "voice"
      )
        throw new TalentToolError(
          "Resume generation requires authenticated web chat context.",
        );
      const { generateResume } = await import("@/lib/resumes/service");
      return generateResume({
        admin: context.admin as TalentAdminClient,
        userId: context.userId,
        userMessageId: context.userMessageId,
        requestId: context.resumeRequestId,
        input,
      });
    },
  },
  [TALENT_TOOL_NAMES.UPSERT_DOCUMENT]: {
    name: TALENT_TOOL_NAMES.UPSERT_DOCUMENT,
    description:
      TOOL_DESCRIPTIONS.upsert_document,
    parameters: UPSERT_DOCUMENT_PARAMETERS,
    channels: ["chat"],
    async execute(input, context) {
      if (
        !context?.admin ||
        !context.userId ||
        (!context.userMessageId &&
          (!context.conversationId || !context.resumeRequestId))
      )
        throw new TalentToolError(
          "Document authoring requires authenticated conversation context.",
        );
      const { upsertDocument } = await import("@/lib/documents/authoring");
      return upsertDocument({
        admin: context.admin as TalentAdminClient,
        userId: context.userId,
        // Both authoring services use this only as an idempotency fallback.
        // A background reply already carries its stable request identity.
        userMessageId: context.userMessageId ?? context.resumeRequestId!,
        requestId: context.resumeRequestId,
        input,
      });
    },
  },
  [TALENT_TOOL_NAMES.LIST_DOCUMENTS]: {
    name: TALENT_TOOL_NAMES.LIST_DOCUMENTS,
    description:
      TOOL_DESCRIPTIONS.list_documents,
    parameters: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["resume", "document"],
          description: "Optional resume/document filter.",
        },
        offset: {
          type: "integer",
          minimum: 0,
          description:
            "Pagination offset. Start at 0 and use nextOffset only when another page is needed.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 20,
          default: 10,
          description:
            "Page size. Prefer 10 and do not fetch every page by default.",
        },
      },
      additionalProperties: false,
    },
    channels: ["chat"],
    async execute(input, context) {
      const admin = context?.admin;
      const userId = context?.userId;
      if (!admin || !userId) {
        throw new TalentToolError("list_documents requires user context.");
      }
      return listTalentDocumentsForTool({
        admin: admin as TalentAdminClient,
        input,
        userId,
      });
    },
  },
  [TALENT_TOOL_NAMES.READ_DOCUMENT]: {
    name: TALENT_TOOL_NAMES.READ_DOCUMENT,
    description:
      TOOL_DESCRIPTIONS.read_document,
    parameters: {
      type: "object",
      properties: {
        format: {
          type: "string",
          enum: ["text", "structured"],
          description:
            "Use structured to read a Harper-generated resume JSON and revision before editing. Default text retains paginated reading.",
        },
        document_id: {
          type: "string",
          description: "Exact saved document id.",
        },
        query: {
          type: "string",
          maxLength: 300,
          description:
            "Optional exact text to locate from offset; returns a bounded passage around its first match. For targeted edits without reading the entire document.",
        },
        offset: {
          type: "integer",
          minimum: 0,
          description:
            "Character offset. For current upload context use its next_offset when provided; otherwise start at 0. Continue later reads from nextOffset only when needed.",
        },
        max_chars: {
          type: "integer",
          minimum: 500,
          maximum: 6000,
          default: 4000,
          description: "Maximum excerpt length for this read.",
        },
      },
      required: ["document_id"],
      additionalProperties: false,
    },
    channels: ["chat"],
    async execute(input, context) {
      const admin = context?.admin;
      const userId = context?.userId;
      if (!admin || !userId) {
        throw new TalentToolError("read_document requires user context.");
      }
      return readTalentDocumentForTool({
        admin: admin as TalentAdminClient,
        input,
        userId,
      });
    },
  },
  [TALENT_TOOL_NAMES.READ_TALENT_ACTIVITY_EVENTS]: {
    name: TALENT_TOOL_NAMES.READ_TALENT_ACTIVITY_EVENTS,
    description:
      TOOL_DESCRIPTIONS.read_talent_activity_events,
    parameters: {
      type: "object",
      properties: {
        scope: { type: "string", enum: ["activity", "contacts"] },
        cursor: {
          type: "string",
          description: "Exact nextCursor from an earlier contact-history page.",
        },
        query: {
          type: "string",
          description: "Text to find in actual contact questions.",
        },
        refs: {
          type: "array",
          maxItems: 3,
          items: { type: "string" },
          description: "Exact contact refs to read in full.",
        },
        limit: {
          type: "integer",
          description: "Maximum number of activity events to return.",
          minimum: 1,
          maximum: 20,
          default: 5,
        },
        since: {
          type: "string",
          description:
            "Optional ISO timestamp. If provided, return activity events on or after this time.",
        },
        sinceDays: {
          type: "integer",
          description:
            "Optional lookback window in days. Used only when since is omitted.",
          minimum: 1,
          maximum: 365,
        },
        eventTypes: {
          type: "array",
          description: "Optional event type filter.",
          items: {
            type: "string",
            enum: [
              "company_followed",
              "company_unfollowed",
              "preferences_changed",
              "row_memo_added",
              "row_memo_updated",
              "insight_updated",
              "onboarding_completed",
            ],
          },
        },
      },
      additionalProperties: false,
    },
    channels: ["chat", "voice"],
    async execute(input, context) {
      const admin = context?.admin;
      const userId = context?.userId;
      if (!admin || !userId) {
        throw new TalentToolError(
          "read_talent_activity_events requires user context.",
        );
      }

      const limit = normalizeToolLimit(input.limit, 5);
      if (input.scope === "contacts") {
        return readTalentContactHistory({
          admin: admin as TalentAdminClient,
          userId,
          limit,
          cursor: optionalToolString(input.cursor),
          query: optionalToolString(input.query),
          refs: Array.isArray(input.refs)
            ? input.refs
                .filter((value): value is string => typeof value === "string")
                .slice(0, 3)
            : undefined,
        });
      }
      const since = normalizeSinceDate(input);
      const eventTypes = normalizeActivityEventTypes(input.eventTypes);
      const events = await fetchTalentActivityEvents({
        admin: admin as any,
        eventTypes,
        limit,
        since,
        userId,
      });

      return {
        count: events.length,
        eventTypes: eventTypes.length > 0 ? eventTypes : null,
        limit,
        since,
        summaries: events.map((event) => event.summary),
        events: events.map((event) => ({
          changedDomains: event.changed_domains,
          createdAt: event.created_at,
          eventType: event.event_type,
          impactLevel: event.impact_level,
          source: event.source,
          summary: event.summary,
        })),
      };
    },
  },
  [TALENT_TOOL_NAMES.READ_RECOMMENDED_OPPORTUNITIES]: {
    name: TALENT_TOOL_NAMES.READ_RECOMMENDED_OPPORTUNITIES,
    description:
      TOOL_DESCRIPTIONS.read_recommended_opportunities,
    parameters: {
      type: "object",
      properties: {
        postingUrl: {
          type: "string",
          description:
            "Optional exact JD/application URL from the user or an earlier result. Matches the stored posting URL; omit companyName when using this identifier.",
        },
        companyName: {
          type: "array",
          description:
            "Optional company name filters. When provided, returns opportunities whose company name includes at least one of these names.",
          items: {
            type: "string",
          },
        },
        limit: {
          type: "integer",
          description:
            "Base maximum number of opportunities to return. Matching roles with an upcoming Harper-connected meeting are added outside this limit.",
          minimum: 1,
          maximum: 20,
          default: 8,
        },
        only_internal: {
          type: "boolean",
          description:
            "When true, return only previously recommended internal opportunities.",
          default: false,
        },
      },
      additionalProperties: false,
    },
    channels: ["chat", "voice"],
    voicePreamble: "추천해드린 기회를 잠깐 확인해볼게요.",
    async execute(input, context) {
      const admin = context?.admin;
      const userId = context?.userId;
      if (!admin || !userId) {
        throw new TalentToolError(
          "read_recommended_opportunities requires user context.",
        );
      }

      const companyNames = (
        Array.isArray(input.companyName)
          ? input.companyName
          : [input.companyName]
      )
        .map(optionalToolString)
        .filter((name): name is string => Boolean(name));
      const limit = normalizeToolLimit(input.limit, 8);
      const onlyInternal = input.only_internal === true;
      const postingUrl = optionalToolString(input.postingUrl);
      const companyFilters = companyNames.map((name) =>
        name.toLocaleLowerCase("ko-KR"),
      );
      const opportunities = await fetchTalentOpportunityHistory({
        admin: admin as any,
        sourceType: onlyInternal ? "internal" : undefined,
        userId,
      });
      const filtered = opportunities.filter((item) => {
        if (postingUrl && item.externalJdUrl !== postingUrl) return false;
        if (onlyInternal && item.sourceType !== "internal") {
          return false;
        }
        if (companyFilters.length > 0) {
          const itemCompanyName = item.companyName.toLocaleLowerCase("ko-KR");
          return companyFilters.some((companyFilter) =>
            itemCompanyName.includes(companyFilter),
          );
        }
        return true;
      });
      const baseItems = filtered.slice(0, limit);
      const baseItemIds = new Set(baseItems.map((item) => item.id));
      const displayedItems = [
        ...baseItems,
        ...filtered.filter(
          (item) => item.upcomingMeeting && !baseItemIds.has(item.id),
        ),
      ];
      const itemsToClose = context?.registerProcessClosureNotices
        ? displayedItems.filter(shouldCloseRecommendedOpportunityFromProgress)
        : [];
      if (itemsToClose.length > 0) {
        context?.registerProcessClosureNotices?.(
          itemsToClose.map((item) => ({
            closureKind: ["ended", "deleted"].includes(
              item.status.trim().toLowerCase(),
            )
              ? "role_ended"
              : "company_process_stopped",
            companyName: item.companyName,
            currentStage: item.internalProgress?.stage ?? "accepted",
            recommendationId: item.id,
            roleId: item.roleId,
            roleName: item.title,
          })),
        );
      }
      const closedOpportunityIds = new Set(itemsToClose.map((item) => item.id));
      const assistantInstruction =
        itemsToClose.length > 0
          ? itemsToClose
              .map(
                (item) =>
                  `${formatRecommendedOpportunityName(item)} 기회에 대해 progress.message에 기반한 안내를 해라. 최대한 기분이 상하지 않도록 잘 전달해라. 해당 기회는 진행 종료 상태로 변경되었음을 자연스럽게 알려라.`,
              )
              .join(" ")
          : undefined;
      const detailedItems = await fetchTalentOpportunityHistoryByIds({
        admin: admin as any,
        ids: displayedItems.map((item) => item.id),
        includeActivityTimeline: true,
        userId,
      });
      const detailedItemById = new Map(
        detailedItems.map((item) => [item.id, item] as const),
      );

      return {
        ...(assistantInstruction ? { assistantInstruction } : {}),
        filters: {
          postingUrl: postingUrl ?? null,
          companyName: companyNames.length > 0 ? companyNames : null,
          limit,
          only_internal: onlyInternal,
        },
        returnedCount: displayedItems.length,
        totalMatchingCount: filtered.length,
        opportunities: displayedItems.map((item) => {
          const detailedItem = detailedItemById.get(item.id) ?? item;
          const feedbackReason = optionalToolString(item.feedbackReason);
          const progress = formatRecommendedOpportunityProgress(item);
          const companyRequestIntroProgress =
            formatCompanyRequestIntroProgress(item);
          const userMemo = optionalToolString(item.talentMemo);
          const upcomingMeeting = formatUpcomingHarperMeetingForPrompt(
            detailedItem.upcomingMeeting?.startAt,
          );
          const recentActivity = formatTalentRoleActivitiesForPrompt(
            detailedItem.talentRoleActivities,
            10,
          );
          const savedStage = closedOpportunityIds.has(item.id)
            ? "closed"
            : item.savedStage;

          return {
            roleId: item.roleId,
            role: formatRecommendedOpportunityRole(item),
            opportunityType: item.opportunityType,
            jdURL: item.externalJdUrl,
            recommendedAt:
              formatCompactToolDate(item.recommendedAt) ?? item.recommendedAt,
            recommendationReasons: item.recommendationReasons.slice(0, 5),
            feedback: item.feedback,
            ...(!recentActivity && userMemo ? { userMemo } : {}),
            ...(feedbackReason ? { feedbackReason } : {}),
            ...(progress ? { progress } : {}),
            ...(companyRequestIntroProgress
              ? { companyRequestIntroProgress }
              : {}),
            ...(upcomingMeeting ? { upcomingMeeting } : {}),
            ...(recentActivity ? { recentActivity } : {}),
            savedStage,
            status: item.status,
            summary: item.recommendationSummary,
          };
        }),
      };
    },
  },
  [TALENT_TOOL_NAMES.GET_INTERNAL_ROLES]: {
    name: TALENT_TOOL_NAMES.GET_INTERNAL_ROLES,
    description:
      TOOL_DESCRIPTIONS.get_internal_roles,
    parameters: {
      type: "object",
      properties: {
        role_id: {
          type: "string",
          description:
            "Optional exact internal role ID from a user-selected opportunity reference or prior tool result. Works without keywords; when combined with other filters, the role must also match those filters. Existing visibility and availability rules still apply.",
        },
        keywords: {
          type: "array",
          description:
            "One or two natural search expressions for the role title or company. Default lookup includes partial word matches and normalizes English word forms; roles matching more query terms and terms in the title rank first. Use distinctive role/company terms rather than broad location words. Related results are search candidates, not confirmed matches to the requested posting. With matchedOnly=true, words within each expression remain ANDed and expressions are ORed against stored fit-supported roles. If results do not identify the requested role, refine the terms; a limited keyword search is not proof that Harper has no connection to the posting.",
          items: {
            type: "string",
          },
          minItems: 1,
          maxItems: 2,
        },
        matchedOnly: {
          type: "boolean",
          description:
            "Set true only when the user asks about other roles supported by Harper's stored fit signals, wants to compare adjacent roles, or needs another viable role at the same company. This includes role-and-company fit when candidate preference fit is middle, but always excludes candidate preference unfit. Omit or use false for ordinary public lookup.",
        },
        company: {
          type: "string",
          description:
            "Optional company name or public alias used to narrow matchedOnly results to that company. Do not provide this merely for ordinary keyword lookup.",
        },
      },
      additionalProperties: false,
    },
    channels: ["chat"],
    async execute(input, context) {
      const userId = context?.userId;
      if (!userId) {
        throw new TalentToolError("get_internal_roles requires user context.");
      }

      return searchInternalRolesForCareerTool({
        company: input.company,
        keywords: input.keywords,
        matchedOnly: input.matchedOnly,
        roleId: input.role_id,
        userId,
      });
    },
  },
  [TALENT_TOOL_NAMES.GET_ROLE_CONTEXT]: {
    name: TALENT_TOOL_NAMES.GET_ROLE_CONTEXT,
    description:
      TOOL_DESCRIPTIONS.get_role_context,
    parameters: {
      type: "object",
      properties: {
        activityOffset: {
          type: "integer",
          description:
            "Activity page offset for older role events; starts at 0 and advances by 10 when activityPage.hasMore is true.",
          minimum: 0,
          maximum: 100000,
        },
        include_jd: {
          type: "boolean",
          description:
            "Whether to include the job description text as role.description. Set true when the user needs JD/details/responsibilities/requirements; set false when role metadata and recommendation context are enough.",
        },
        roleIds: {
          type: "array",
          description:
            "Role ids from standalone [posting](roleId) lines or prior tool results. Provide the exact role IDs needed for this task.",
          items: {
            type: "string",
          },
        },
      },
      required: ["roleIds", "include_jd"],
      additionalProperties: false,
    },
    channels: ["chat", "voice"],
    voicePreamble: "포지션 상세 내용을 잠깐 확인해볼게요.",
    async execute(input, context) {
      const admin = context?.admin;
      const userId = context?.userId;
      if (!admin || !userId) {
        throw new TalentToolError("get_role_context requires user context.");
      }

      const roleIds = normalizeRoleContextRoleIds(input.roleIds);
      if (roleIds.length === 0) {
        throw new TalentToolError(
          "get_role_context requires valid roleIds.",
        );
      }

      return runGetRoleContext({
        activityOffset: Math.min(
          100000,
          Math.max(0, Math.floor(Number(input.activityOffset) || 0)),
        ),
        admin: admin as any,
        includeJd: input.include_jd === true,
        roleIds,
        userId,
      });
    },
  },
  [TALENT_TOOL_NAMES.READ_COMPANY_CONNECTIONS]: {
    name: TALENT_TOOL_NAMES.READ_COMPANY_CONNECTIONS,
    description:
      TOOL_DESCRIPTIONS.read_company_connections,
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 30,
          description: "Maximum connections to return. Defaults to 20.",
        },
        query: {
          type: "string",
          maxLength: 200,
          description: "Optional company or Role text used to narrow the list.",
        },
      },
      additionalProperties: false,
    },
    channels: ["chat"],
    async execute(input, context) {
      const admin = context?.admin;
      const userId = context?.userId;
      if (!admin || !userId) {
        throw new TalentToolError(
          "read_company_connections requires user context.",
        );
      }
      const connections = await fetchRelayableCompanyTalentConnections({
        admin: admin as any,
        limit:
          typeof input.limit === "number" && Number.isFinite(input.limit)
            ? input.limit
            : undefined,
        query: optionalToolString(input.query) || null,
        talentId: userId,
      });
      const readableConnections =
        formatRelayableCompanyTalentConnections(connections);
      const assistantInstruction =
        "Use these relationship facts and contact history to identify the intended company and Role. An old contact is not an obligation to answer it. If a filtered search is empty, retry without the filter before concluding there is no connection. Do not claim the company read or answered a contact. Do not expose IDs.";
      return {
        assistantInstruction,
        connections: readableConnections,
        modelOutput: [
          "status=ok",
          readableConnections,
          `instruction=${assistantInstruction}`,
        ].join("\n"),
        ok: true,
        skipCommonAssistantInstruction: true,
      };
    },
  },
  [TALENT_TOOL_NAMES.CONTACT_COMPANY]: {
    name: TALENT_TOOL_NAMES.CONTACT_COMPANY,
    description:
      TOOL_DESCRIPTIONS.contact_company,
    parameters: {
      type: "object",
      properties: {
        resumeConfirmed: {
          type: "boolean",
          description:
            "Only for an ops-contact connection: execute the previously requested resumption when the user's current meaning clearly confirms renewed interest in this exact Role. Omit for ordinary company contacts and for questions, conditional interest, uncertainty or refusal. This is an action command, not a sentiment label.",
        },
        relayContent: {
          type: "string",
          minLength: 1,
          maxLength: 5000,
          description: COMPANY_RELAY_CONTENT_CONTRACT,
        },
        documentId: {
          type: "string",
          description:
            "Optional exact owned resume document ID explicitly approved for sharing.",
        },
        connectionId: {
          type: "string",
          description:
            "Exact mutual-connection ID from private context or read_company_connections.",
        },
      },
      required: ["connectionId", "relayContent"],
      additionalProperties: false,
    },
    channels: ["chat"],
    async execute(input, context) {
      const admin = context?.admin;
      const userId = context?.userId;
      const sourceMessageId = Number(context?.userMessageId);
      const connectionId = optionalToolString(input.connectionId);
      const relayContent = optionalToolString(input.relayContent);
      if (
        !admin ||
        !userId ||
        !connectionId ||
        !relayContent ||
        !Number.isSafeInteger(sourceMessageId)
      ) {
        throw new TalentToolError(
          "contact_company requires an exact mutual connection and user message.",
        );
      }
      const relay = await createCompanyTalentRelay({
        admin: admin as any,
        connectionId,
        documentId: optionalToolString(input.documentId) ?? undefined,
        relayContent,
        resumeConfirmed: input.resumeConfirmed === true,
        sourceMessageId,
        talentId: userId,
      });
      if ("opsOnly" in relay && relay.opsOnly)
        return opsContactToolResult(relay.idempotent);
      const contentMismatch = Boolean(relay.contentMismatch);
      const assistantInstruction = contentMismatch
        ? "The same source message was already accepted earlier using its original content. State only the returned transport status; do not claim that a differently rewritten version replaced it."
        : relay.status !== "sent"
          ? COMPANY_RELAY_NOT_DELIVERED_RESPONSE_CONTRACT
          : COMPANY_RELAY_DELIVERY_RESPONSE_CONTRACT;
      return {
        assistantInstruction,
        idempotent: relay.idempotent,
        modelOutput: [
          `status=${relay.status}`,
          `idempotent=${Boolean(relay.idempotent)}`,
          `requested_rewrite_replaced_existing=${relay.idempotent ? !contentMismatch : "not_applicable"}`,
          `instruction=${assistantInstruction}`,
        ].join("\n"),
        ok: true,
        skipCommonAssistantInstruction: true,
        status: relay.status,
      };
    },
  },
  [TALENT_TOOL_NAMES.UPDATE_RECOMMENDED_OPPORTUNITY_FEEDBACK]: {
    name: TALENT_TOOL_NAMES.UPDATE_RECOMMENDED_OPPORTUNITY_FEEDBACK,
    description: TOOL_DESCRIPTIONS.update_recommended_opportunity_feedback,
    parameters: {
      type: "object",
      properties: {
        feedback: {
          type: "string",
          enum: ["like", "dislike", "keep"],
          description:
            "Like records explicit acceptance (internal introduction) or interest (external); dislike records rejection; keep saves an internal role for later without deciding. Use apply_to_internal_role to evaluate and add an internal role for review. Saving does not authorize company sharing.",
        },
        opportunityId: {
          type: "string",
          description:
            "Exact recommendation id when known. Prefer roleId from [posting](roleId) when available.",
        },
        roleId: {
          type: "string",
          description: "Role id from a [posting](roleId) card line.",
        },
        companyName: {
          type: "string",
          description:
            "Company name only when id/roleId is unavailable. Used to disambiguate.",
        },
        roleTitle: {
          type: "string",
          description:
            "Role title only when id/roleId is unavailable. Used to disambiguate.",
        },
        feedbackReason: {
          type: "string",
          description:
            "Optional short reason from the user's message, if they gave one.",
        },
        materialId: { type: ["string", "null"], description: "Exact prepared material ID from assign_to_role read. Omit both materialId and assignmentRevision to let the server pin the current assignment or default. Supply null only with the observed empty assignment revision (0)." },
        assignmentRevision: { type: "integer", description: "Exact assignment revision returned by assign_to_role read. Always supply this together with materialId, including materialId=null. Omit both for the current server-selected materials." },
      },
      required: ["feedback"],
      additionalProperties: false,
    },
    channels: ["chat"],
    async execute(input, context) {
      const admin = context?.admin;
      const userId = context?.userId;
      if (!admin || !userId) {
        throw new TalentToolError(
          "update_recommended_opportunity_feedback requires user context.",
        );
      }

      const feedback = normalizeRecommendedOpportunityToolFeedback(
        input.feedback,
      );
      if (!feedback || feedback === "review") {
        throw new TalentToolError(
          "update_recommended_opportunity_feedback requires a valid feedback.",
        );
      }

      const opportunityId = optionalToolString(input.opportunityId);
      const roleId = normalizePostingRoleId(input.roleId);
      if (roleId && !isPostingRoleId(roleId)) {
        throw new TalentToolError(
          "update_recommended_opportunity_feedback received an invalid roleId.",
        );
      }
      const fitReasons = normalizeInternalRoleReviewFitReasons(
        input.fitReasons,
      );

      if (input.materialId !== undefined && (typeof input.assignmentRevision !== "number" || !Number.isInteger(input.assignmentRevision)))
        throw new TalentToolError("The selected materials require their assignment revision.");
      return updateRecommendedOpportunityFeedback({
        ...(input.materialId !== undefined ? { acceptanceMaterial: { materialId: input.materialId === null ? null : String(input.materialId), assignmentRevision: Number(input.assignmentRevision) } } : {}),
        admin: admin as any,
        companyName: optionalToolString(input.companyName),
        conversationId: context?.conversationId ?? null,
        feedback,
        feedbackReason: optionalToolString(input.feedbackReason),
        fitReasons,
        opportunityId,
        replacesRoleId: null,
        responseLocale: context?.responseLocale ?? null,
        roleId,
        roleTitle: optionalToolString(input.roleTitle),
        userId,
        isMobile: context?.isMobile,
        userMessageId: context?.userMessageId ?? null,
      });
    },
  },
  [TALENT_TOOL_NAMES.UPDATE_SETTING]: {
    name: TALENT_TOOL_NAMES.UPDATE_SETTING,
    description:
      TOOL_DESCRIPTIONS.update_setting,
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["stop_external", "stop_all", "resume"],
          description:
            "stop_external disables good-fit external/public postings. stop_all sets profile visibility to dont_share. resume sets profile visibility to exceptional_only and enables external/public postings.",
        },
        reasonText: {
          type: "string",
          description:
            "Brief explanation in the selected reply language of why this subscription update was made.",
        },
      },
      required: ["action"],
      additionalProperties: false,
    },
    channels: ["chat", "voice"],
    async execute(input, context) {
      const admin = context?.admin as any;
      const userId = context?.userId;
      if (!admin || !userId) {
        throw new TalentToolError("update_setting requires user context.");
      }

      const existingSetting = await fetchTalentSetting({ admin, userId });
      const interactionLabel = getTalentToolCareerInteractionLabel(context);
      const updatePayload: Parameters<typeof upsertTalentSetting>[0] = {
        admin,
        userId,
      };
      const updatedSettingFields: string[] = [];
      const settingActivityChanges: TalentActivityChange[] = [];
      const action = optionalToolString(input.action);
      let summary: string | null = null;

      if (action === "stop_external") {
        const nextGetExternalRecommendation = false;
        updatePayload.getExternalRecommendation = false;
        updatedSettingFields.push("getExternalRecommendation");
        if (
          !isSameActivityValue(
            existingSetting?.get_external_recommendation ?? true,
            nextGetExternalRecommendation,
          )
        ) {
          settingActivityChanges.push({
            field: "getExternalRecommendation",
            from: existingSetting?.get_external_recommendation ?? true,
            to: nextGetExternalRecommendation,
          });
        }
        summary = `사용자가 ${interactionLabel}에서 외부 공개 포지션 추천 중단을 요청했습니다.`;
      } else if (action === "stop_all") {
        const nextProfileVisibility = "dont_share";
        updatePayload.profileVisibility = nextProfileVisibility;
        updatedSettingFields.push("profileVisibility");
        if (
          !isSameActivityValue(
            existingSetting?.profile_visibility ?? "exceptional_only",
            nextProfileVisibility,
          )
        ) {
          settingActivityChanges.push({
            field: "profileVisibility",
            from: existingSetting?.profile_visibility ?? "exceptional_only",
            to: nextProfileVisibility,
          });
        }
        summary = `사용자가 ${interactionLabel}에서 모든 Harper 매칭 연락 중단을 요청했습니다.`;
      } else if (action === "resume") {
        const nextGetExternalRecommendation = true;
        const nextProfileVisibility = "exceptional_only";
        updatePayload.getExternalRecommendation = nextGetExternalRecommendation;
        updatePayload.profileVisibility = nextProfileVisibility;
        updatedSettingFields.push(
          "getExternalRecommendation",
          "profileVisibility",
        );
        if (
          !isSameActivityValue(
            existingSetting?.get_external_recommendation ?? true,
            nextGetExternalRecommendation,
          )
        ) {
          settingActivityChanges.push({
            field: "getExternalRecommendation",
            from: existingSetting?.get_external_recommendation ?? true,
            to: nextGetExternalRecommendation,
          });
        }
        if (
          !isSameActivityValue(
            existingSetting?.profile_visibility ?? "exceptional_only",
            nextProfileVisibility,
          )
        ) {
          settingActivityChanges.push({
            field: "profileVisibility",
            from: existingSetting?.profile_visibility ?? "exceptional_only",
            to: nextProfileVisibility,
          });
        }
        summary = `사용자가 ${interactionLabel}에서 Harper 추천 연락 재개를 요청했습니다.`;
      } else {
        throw new TalentToolError("update_setting requires a valid action.");
      }

      await upsertTalentSetting(updatePayload);

      const settingChanges = compactActivityChanges(settingActivityChanges);
      const settingSummary =
        summary ?? buildPreferenceActivitySummary(settingChanges);
      if (settingSummary && settingChanges.length > 0) {
        await insertTalentActivityEvent({
          admin,
          changedDomains: [
            "preferences",
            "email_subscription",
            ...settingChanges.map((change) => change.field),
          ],
          conversationId: context?.conversationId ?? null,
          eventType: "preferences_changed",
          impactLevel: "high",
          messageId: context?.userMessageId ?? null,
          source: getTalentToolActivitySource(context),
          summary: settingSummary,
          userId,
        });
      }

      let remainingInternalRoles:
        | ReturnType<typeof compactOpportunityForTool>[]
        | null = null;
      try {
        remainingInternalRoles = (
          await fetchTalentOpportunityHistory({
            admin,
            userId,
            sourceType: "internal",
            limit: 100,
          })
        ).map(compactOpportunityForTool);
      } catch (historyError) {
        // A supplementary read failure must not turn the committed setting into a failed write.
        console.error("[update-setting/internal-history]", historyError);
      }
      const responseLanguage = getTalentToolResponseLanguage(context);
      return {
        assistantInstruction: [
          `Continue the conversation naturally in ${responseLanguage} now.`,
          "Settings do not withdraw existing company introductions or decide remaining internal Roles. Use the returned existing opportunities and the user's intent to ask how they want to handle unresolved proposals when relevant. Previously shared company profiles remain available; new matching/contact follows the updated preferences. Do not infer a decline from a settings change.",
        ].join(" "),
        remainingInternalRoles,
        internalRoleHistoryAvailable: remainingInternalRoles !== null,
        internalRoleHistoryLimit: 100,
        action,
        impactLevel: "high",
        ok: true,
        updatedSettingFields,
        settings: {
          getExternalRecommendation:
            updatePayload.getExternalRecommendation ??
            existingSetting?.get_external_recommendation ??
            true,
          profileVisibility:
            updatePayload.profileVisibility ??
            existingSetting?.profile_visibility ??
            "exceptional_only",
        },
      };
    },
  },
  [TALENT_TOOL_NAMES.UPDATE_LANGUAGE_SETTING]: {
    name: TALENT_TOOL_NAMES.UPDATE_LANGUAGE_SETTING,
    description: TOOL_DESCRIPTIONS.update_language_setting,
    parameters: CAREER_LANGUAGE_SETTING_TOOL_PARAMETERS,
    channels: ["chat"],
    async execute(input, context) {
      const admin = context?.admin as TalentAdminClient | undefined;
      const userId = context?.userId;
      if (!admin || !userId) {
        throw new TalentToolError(
          "update_language_setting requires user context.",
        );
      }

      const language = parseCareerLanguageSetting(input.language);
      if (!language) {
        throw new TalentToolError(
          "update_language_setting requires a valid language.",
        );
      }

      await upsertTalentSetting({
        admin,
        settingLocale: language,
        userId,
      });

      return {
        language,
        ok: true,
        skipCommonAssistantInstruction: true,
      };
    },
  },
  [TALENT_TOOL_NAMES.READ_TALENT_CONTEXT]: {
    name: TALENT_TOOL_NAMES.READ_TALENT_CONTEXT,
    description:
      TOOL_DESCRIPTIONS.read_talent_context,
    parameters: TALENT_CONTEXT_READ_TOOL_PARAMETERS,
    channels: ["chat", "voice"],
    async execute(input, context) {
      const admin = context?.admin as TalentAdminClient | undefined;
      const userId = context?.userId;
      if (!admin || !userId) {
        throw new TalentToolError("read_talent_context requires user context.");
      }
      const collection =
        input.collection === "brief" || input.collection === "memory"
          ? input.collection
          : "memory";
      const refs = Array.isArray(input.refs)
        ? input.refs
            .map(Number)
            .filter((ref) => Number.isSafeInteger(ref) && ref > 0)
        : [];
      const result = await readTalentContextsForAgent({
        admin,
        beforeId: Number.isSafeInteger(Number(input.cursor))
          ? Number(input.cursor)
          : null,
        collection,
        limit: Number.isSafeInteger(Number(input.limit))
          ? Number(input.limit)
          : undefined,
        query: optionalToolString(input.query),
        refs,
        userId,
      });
      return {
        ...result,
        assistantInstruction:
          "Use the returned saved context only when it is relevant to the user's current request. If truncated is true and nextCursor is absent, refine the natural-language query or request fewer exact refs only when more context is actually needed. Continue the original task naturally and do not describe database, retrieval, scores, or internal tool behavior.",
        skipCommonAssistantInstruction: true,
      };
    },
  },
  [TALENT_TOOL_NAMES.WRITE_TALENT_CONTEXT]: {
    name: TALENT_TOOL_NAMES.WRITE_TALENT_CONTEXT,
    description:
      TOOL_DESCRIPTIONS.write_talent_context,
    parameters: TALENT_CONTEXT_WRITE_TOOL_PARAMETERS,
    channels: ["chat", "voice"],
    async execute(input, context) {
      const admin = context?.admin as TalentAdminClient | undefined;
      const userId = context?.userId;
      if (!admin || !userId) {
        throw new TalentToolError(
          "write_talent_context requires user context.",
        );
      }
      const setting = await fetchTalentSetting({ admin, userId });
      if (!setting?.is_onboarding_done) {
        throw new TalentToolError(
          "Onboarding context is saved by the onboarding extraction flow.",
        );
      }
      const rawChanges = Array.isArray(input.changes) ? input.changes : [];
      const changes = rawChanges.flatMap(
        (value): TalentContextAgentChange[] => {
          if (!value || typeof value !== "object" || Array.isArray(value))
            return [];
          const change = value as Record<string, unknown>;
          const op = optionalToolString(change.op);
          if (op === "add") {
            if (change.collection !== "brief" && change.collection !== "memory")
              return [];
            const requestedImportance = Number(change.importance);
            const importance =
              Number.isInteger(requestedImportance) &&
              requestedImportance >= 1 &&
              requestedImportance <= 3
                ? requestedImportance
                : 1;
            return [
              {
                collection: change.collection,
                content: optionalToolString(change.content) ?? "",
                ...(change.collection === "brief"
                  ? { label: optionalToolString(change.label) }
                  : { importance: importance as TalentMemoryImportance }),
                op,
              } as TalentContextAgentChange,
            ];
          }
          if (op === "update") {
            const label = optionalToolString(change.label);
            const requestedImportance = Number(change.importance);
            const hasImportance =
              Object.prototype.hasOwnProperty.call(change, "importance") &&
              Number.isInteger(requestedImportance) &&
              requestedImportance >= 1 &&
              requestedImportance <= 3;
            return [
              {
                ...(Object.prototype.hasOwnProperty.call(change, "content")
                  ? { content: optionalToolString(change.content) ?? "" }
                  : {}),
                ...(hasImportance
                  ? {
                      importance: requestedImportance as TalentMemoryImportance,
                    }
                  : {}),
                ...(label ? { label } : {}),
                op,
                ref: Number(change.ref),
              },
            ];
          }
          if (op === "delete") return [{ op, ref: Number(change.ref) }];
          return [];
        },
      );
      if (changes.length !== rawChanges.length || changes.length === 0) {
        throw new TalentToolError("Invalid talent context changes.");
      }
      const refs = changes.flatMap((change) =>
        change.op === "add" ? [] : [Number(change.ref)],
      );
      const referencedRows = await fetchTalentContextsByRefs({
        admin,
        refs,
        userId,
      });
      if (new Set(refs).size !== referencedRows.length) {
        throw new TalentToolError(
          "One or more talent context refs are unavailable.",
          409,
        );
      }
      const requestId = createTalentContextMutationRequestId([
        userId,
        context?.conversationId ?? null,
        context?.toolCallId ?? context?.userMessageId ?? null,
        changes,
      ]);
      const result = await mutateTalentContextsFromAgent({
        admin,
        changes,
        referencedRows,
        requestId,
        sourceRefs: [
          {
            type: "conversation_message",
            conversationId: context?.conversationId ?? null,
            messageId: context?.userMessageId ?? null,
          },
        ],
        userId,
      });
      const embedChangedMemories = () =>
        refreshTalentContextEmbeddings({
          admin,
          ids: result.changedIds,
          userId,
        }).catch((error) => {
          console.error("[talent-contexts] background embedding failed", error);
        });
      if (context?.scheduleAfter) context.scheduleAfter(embedChangedMemories);
      else void embedChangedMemories();
      return {
        applied: result.applied,
        ok: true,
        assistantInstruction:
          "Continue the user's original request. Explain only the practical criteria or context that actually changed when that is useful; do not mention storage, collections, refs, schemas, or tool names, and do not turn the reply into a receipt.",
        skipCommonAssistantInstruction: true,
      };
    },
  },
  [TALENT_TOOL_NAMES.MANAGE_CAREER_COACHING_ACTIVITY]: {
    name: TALENT_TOOL_NAMES.MANAGE_CAREER_COACHING_ACTIVITY,
    description:
      TOOL_DESCRIPTIONS.manage_career_coaching_activity,
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["suggest", "start", "update", "end"],
        },
        activityMessageId: { type: "integer", minimum: 1 },
        expectedRevision: { type: "integer", minimum: 1 },
        topic: { type: "string", minLength: 1, maxLength: 160 },
        suggestedMinutes: {
          type: "integer",
          enum: [5, 10, 20],
        },
        plannedMinutes: {
          type: "integer",
          enum: [5, 10, 20],
        },
        agenda: {
          type: "array",
          minItems: 1,
          maxItems: 8,
          items: { type: "string", minLength: 1, maxLength: 240 },
        },
        channel: { type: "string", enum: ["chat", "call"] },
      },
      required: ["action"],
      additionalProperties: false,
    },
    channels: ["chat", "voice"],
    async execute(input, context) {
      const admin = context?.admin as TalentAdminClient | undefined;
      const userId = context?.userId;
      const conversationId = context?.conversationId;
      if (!admin || !userId || !conversationId) {
        throw new TalentToolError(
          "manage_career_coaching_activity requires conversation context.",
        );
      }

      const action = optionalToolString(
        input.action,
      ) as CareerCoachingActivityAction | null;
      if (!action || !["suggest", "start", "update", "end"].includes(action)) {
        throw new TalentToolError("Invalid career coaching action.");
      }

      const activityMessageId = Number(input.activityMessageId);
      const expectedRevision = Number(input.expectedRevision);
      const needsCurrentActivityReference =
        action !== "suggest" &&
        (!Number.isSafeInteger(activityMessageId) ||
          !Number.isSafeInteger(expectedRevision));
      const currentActivity = needsCurrentActivityReference
        ? await fetchCurrentCareerCoachingActivity({
            admin,
            conversationId,
            userId,
          })
        : null;
      const resolvedActivityMessageId = Number.isSafeInteger(activityMessageId)
        ? activityMessageId
        : (currentActivity?.messageId ?? null);
      const resolvedExpectedRevision = Number.isSafeInteger(expectedRevision)
        ? expectedRevision
        : (currentActivity?.revision ?? null);
      const channel =
        input.channel === "chat" || input.channel === "call"
          ? input.channel
          : null;
      const plannedMinutes = normalizeCareerCoachingMinutes(
        input.plannedMinutes,
      );
      const suggestedMinutes = normalizeCareerCoachingMinutes(
        input.suggestedMinutes,
      );
      let activityMessage;
      try {
        activityMessage = await mutateCareerCoachingActivity({
          action,
          activityMessageId: resolvedActivityMessageId,
          admin,
          agenda: Array.isArray(input.agenda)
            ? input.agenda.filter(
                (item): item is string => typeof item === "string",
              )
            : null,
          channel,
          conversationId,
          expectedRevision: resolvedExpectedRevision,
          idempotencyKey: `${conversationId}:${
            context.userMessageId ?? context.toolCallId ?? "unknown"
          }:${action}:${resolvedActivityMessageId ?? "new"}`,
          plannedMinutes,
          suggestedMinutes,
          topic: optionalToolString(input.topic),
          userId,
        });
      } catch (error) {
        const message = formatToolError(error);
        if (!/revision conflict|open career coaching activity/i.test(message)) {
          console.error("[career-coaching] activity mutation failed", {
            action,
            conversationId,
            error: message,
            userId,
          });
          return {
            assistantInstruction:
              "The focused activity change was not applied. Do not claim that a coaching card is visible, that coaching started or ended, or expose technical details. Continue the user's underlying career conversation normally. If the missing activity state matters to the request, say briefly that the focused conversation could not be opened right now and invite the user to retry later.",
            error: "activity_unavailable",
            errorDetails: formatToolError(error),
            ok: false,
            status: "unavailable",
            skipCommonAssistantInstruction: true,
          };
        }
        const currentActivity = await fetchCurrentCareerCoachingActivity({
          admin,
          conversationId,
          userId,
        });
        return {
          assistantInstruction:
            "The requested coaching-card change was stale and was not applied. Use the returned current activity state, briefly explain that the visible state changed when needed, and do not repeat the failed mutation in this turn.",
          currentActivity,
          ok: false,
          status: "conflict",
          skipCommonAssistantInstruction: true,
        };
      }

      const status = activityMessage.coachingActivity.status;
      return {
        activityMessage,
        ok: true,
        status,
        ...(action === "start" && channel === "call"
          ? {
              uiAction: {
                type: "open_career_coaching_call",
                activity: activityMessage.coachingActivity,
              },
            }
          : {}),
        assistantInstruction: buildCareerCoachingResultInstruction(
          status,
          channel,
        ),
        skipCommonAssistantInstruction: true,
      };
    },
  },
  [TALENT_TOOL_NAMES.READ_CAREER_COACHING_LIST]: {
    name: TALENT_TOOL_NAMES.READ_CAREER_COACHING_LIST,
    description:
      TOOL_DESCRIPTIONS.read_career_coaching_list,
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    channels: ["chat"],
    async execute(_input, context) {
      return {
        modelOutput: readCareerCoachingListText(context?.responseLocale),
        skipCommonAssistantInstruction: true,
      };
    },
  },

};

// Shared general writers supersede the legacy profile/priority workflows.
Object.assign(TALENT_TOOL_REGISTRY, CAREER_AGENTIC_TOOLS);

export function getEnabledTalentTools(channel: TalentToolChannel) {
  const configured = new Set<string>([...DEFAULT_ENABLED_TALENT_TOOL_NAMES]);

  return Object.values(TALENT_TOOL_REGISTRY).filter(
    (tool) => configured.has(tool.name) && tool.channels.includes(channel)
  );
}

const UI_STATUS_MESSAGE_PARAMETER = {
  type: "string",
};

export function withUiStatusMessageParameter(
  parameters: Record<string, unknown>
) {
  const properties =
    parameters.properties &&
    typeof parameters.properties === "object" &&
    !Array.isArray(parameters.properties)
      ? (parameters.properties as Record<string, unknown>)
      : {};

  return {
    ...parameters,
    properties: {
      ...properties,
      _uiStatusMessage: UI_STATUS_MESSAGE_PARAMETER,
    },
  };
}

function getToolParameters(tool: TalentToolDefinition) {
  return tool.name === TALENT_TOOL_NAMES.RECORD_CALL_ANSWERS ||
    tool.name === TALENT_TOOL_NAMES.END_CALL ||
    tool.name === TALENT_TOOL_NAMES.UPDATE_LANGUAGE_SETTING ||
    tool.name === TALENT_TOOL_NAMES.READ_CAREER_COACHING_LIST
    ? tool.parameters
    : withUiStatusMessageParameter(tool.parameters);
}

function localizeTalentToolPromptValue(
  value: unknown,
  responseLocale?: string | null
): unknown {
  const outputLanguage = getCareerPromptLanguageName(responseLocale);

  if (typeof value === "string") {
    return value.replace(/\bKorean\b/g, outputLanguage);
  }
  if (Array.isArray(value)) {
    return value.map((item) =>
      localizeTalentToolPromptValue(item, responseLocale)
    );
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        localizeTalentToolPromptValue(item, responseLocale),
      ])
    );
  }

  return value;
}

export function getOpenAIChatTools(
  channel: TalentToolChannel,
  options?: { responseLocale?: string | null }
) {
  return getEnabledTalentTools(channel).map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: localizeTalentToolPromptValue(
        tool.description,
        options?.responseLocale
      ) as string,
      parameters: localizeTalentToolPromptValue(
        getToolParameters(tool),
        options?.responseLocale
      ) as Record<string, unknown>,
    },
  }));
}

export function getStopAfterTalentToolNames(channel: TalentToolChannel) {
  return getEnabledTalentTools(channel)
    .filter((tool) => tool.stopAfterExecution)
    .map((tool) => tool.name);
}

export function getRealtimeTools(
  channel: TalentToolChannel,
  options?: { responseLocale?: string | null }
) {
  return getEnabledTalentTools(channel).map((tool) => ({
    type: "function" as const,
    name: tool.name,
    description: localizeTalentToolPromptValue(
      tool.description,
      options?.responseLocale
    ) as string,
    parameters: localizeTalentToolPromptValue(
      getToolParameters(tool),
      options?.responseLocale
    ) as Record<string, unknown>,
  }));
}

export async function executeTalentTool(args: {
  channel?: TalentToolChannel;
  context?: TalentToolExecutionContext;
  input: Record<string, unknown>;
  logging?: boolean;
  name: string;
}) {
  args.context?.abortSignal?.throwIfAborted();
  const scope = args.context?.admin && args.context.userId && args.context.conversationId && typeof args.context.userMessageId === "number"
    ? { admin: args.context.admin as import("./admin").TalentAdminClient, userId: args.context.userId,
        conversationId: args.context.conversationId, sourceMessageId: args.context.userMessageId,
        replyId: args.context.resumeRequestId } : undefined;
  if (scope) await assertCareerTurnActive({ ...scope, signal: args.context?.abortSignal });
  const tool = TALENT_TOOL_REGISTRY[args.name];

  if (!tool) {
    throw new TalentToolError(`Unknown talent tool: ${args.name}`);
  }

  if (args.channel && !tool.channels.includes(args.channel)) {
    throw new TalentToolError(
      `Tool is disabled for ${args.channel}: ${args.name}`
    );
  }

  const enabledNames = new Set(
    getEnabledTalentTools("chat")
      .concat(getEnabledTalentTools("voice"))
      .map((entry) => entry.name)
  );

  // Keep the retired executor for persisted/in-flight calls; never expose its schema.
  if (!enabledNames.has(tool.name) && tool.name !== TALENT_TOOL_NAMES.GENERATE_RESUME) {
    throw new TalentToolError(`Disabled talent tool: ${args.name}`);
  }

  if (!tool.execute) {
    throw new TalentToolError(
      `Tool requires a route-local executor: ${args.name}`
    );
  }

  const shouldLog = args.logging !== false;
  const executionContext = args.channel
    ? { ...args.context, channel: args.channel }
    : args.context;

  await insertToolUsageLogFromContext({
    context: executionContext,
    name: tool.name,
  });

  if (shouldLog) {
    logTalentToolCall({
      input: {
        ...args.input,
        _context: {
          conversationId: executionContext?.conversationId,
          userMessageId: executionContext?.userMessageId,
          userId: executionContext?.userId,
        },
      },
      name: tool.name,
      source: "talent-tool-registry",
    });
  }
  const startedAt = Date.now();
  try {
    const rawResult = await tool.execute(args.input, executionContext);
    // A child may have been accepted while Stop was being saved. Preserve its
    // receipt and apply the same cancellation to that newly accepted work.
    if (scope && await careerTurnIsStopped(scope)) await cancelCareerTurnWork(scope);
    const result = withCompactTalentToolModelResult(
      tool.name,
      withTalentToolAssistantInstruction(
        tool.name === TALENT_TOOL_NAMES.RECOMMEND_JOB_POSTINGS
          ? withRecommendJobPostingsAssistantInstruction(rawResult)
          : rawResult,
        false
      )
    );
    if (shouldLog) {
      logTalentToolResult({
        durationMs: Date.now() - startedAt,
        name: tool.name,
        result,
        source: "talent-tool-registry",
      });
    }
    return result;
  } catch (error) {
    await insertToolFailureLogFromContext({
      context: args.context,
      name: tool.name,
    });
    if (shouldLog) {
      logTalentToolError({
        durationMs: Date.now() - startedAt,
        error,
        name: tool.name,
        source: "talent-tool-registry",
      });
    }
    throw error;
  }
}

export function getTalentToolVoicePreambles(channel: TalentToolChannel) {
  return Object.fromEntries(
    getEnabledTalentTools(channel)
      .filter((tool) => typeof tool.voicePreamble === "string")
      .map((tool) => [tool.name, tool.voicePreamble as string])
  );
}
