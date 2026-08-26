import type { Json } from "@/types/database.types";
import { CAREER_LLM_CONFIG } from "@/lib/career/llm";
import { formatTalentMessageContentForLlmPrompt } from "@/lib/career/opportunityFeedbackNote";
import { getCareerPromptLanguageName } from "@/lib/career/promptLocale";
import { runTalentAssistantCompletion } from "@/lib/talentOnboarding/llm";
import { fetchRecentMessagesWithSummary } from "@/lib/talentOnboarding/conversationSummary";
import {
  buildTalentProfileContext,
  fetchTalentInsights,
  fetchTalentSetting,
  fetchTalentStructuredProfile,
  fetchTalentUserProfile,
  normalizeTalentInsightContent,
  type TalentAdminClient,
} from "@/lib/talentOnboarding/server";
import type { TalentOpportunityHistoryItem } from "@/lib/talentOpportunity";
import { careerT } from "@/lib/career/translatedCareerMessage";
import { stripPostgresUnsafeChars } from "@/lib/textSanitization";
import { notifyUnsupportedUnicodeEscapeError } from "@/lib/errorAlert";
import { getCompanyInternalRoleRequest } from "@/lib/companyInternalRole";
import {
  INTERNAL_OPPORTUNITY_CALL_REQUEST_MAX_AGE_MS,
  isFreshInternalOpportunityCallRequest,
  isTerminalInternalOpportunityCompanyDecision,
} from "./internalOpportunityCallRequestPolicy";
import { buildInternalOpportunityCallRequestMarker } from "./internalOpportunityCallMarker";
import {
  advanceInternalOpportunityCallQuestionProgress,
  normalizeInternalOpportunityCallQuestionProgress,
  type InternalOpportunityCallQuestionProgress,
} from "./internalOpportunityCallProgress";

export const TALENT_CALL_KIND_INTERNAL_OPPORTUNITY_REQUEST =
  "internal_opportunity_request";

export const TALENT_CALL_STATUS_PENDING = "pending";
export const TALENT_CALL_STATUS_ACTIVE = "active";
export const TALENT_CALL_STATUS_COMPLETED = "completed";

export const isOpenInternalOpportunityCallRequestStatus = (
  status: string | null | undefined
) =>
  status === TALENT_CALL_STATUS_PENDING || status === TALENT_CALL_STATUS_ACTIVE;

export const INTERNAL_CALL_REQUEST_QUESTION_MIN = 3;
export const INTERNAL_CALL_REQUEST_QUESTION_MAX = 5;
const INTERNAL_CALL_REQUEST_LOOKBACK_LIMIT = 20;
const ROLE_DESCRIPTION_MAX_CHARS = 3600;
const ROLE_REQUEST_MAX_CHARS = 1600;
const PROFILE_CONTEXT_MAX_CHARS = 7000;
const INSIGHT_CONTEXT_MAX_CHARS = 2200;
const RECENT_CONVERSATION_CONTEXT_MAX_CHARS = 2200;
const USER_FACING_REASON_MAX_CHARS = 220;
const REASONING_MAX_CHARS = 1200;

type InternalOpportunityCallRoleContext = {
  companyName: string | null;
  description: string | null;
  request: string | null;
  roleId: string;
  sourceType: string | null;
  title: string | null;
};

type InternalOpportunityCallDecision = {
  doRequest: boolean;
  questions: string[];
  reasoning: string | null;
  resumePromptNeeded: boolean;
  userFacingReason: string | null;
};

type TalentCallRow = {
  completed_at: string | null;
  conversation_id: string | null;
  created_at: string;
  id: string;
  kind: string;
  last_active_at: string;
  started_at: string;
  state: Json;
  status: string;
  updated_at: string;
  user_id: string;
};

type InternalOpportunityCallRequestState = {
  companyLogoUrl?: string | null;
  companyName?: string;
  createdFrom?: string;
  opportunityId?: string;
  questions?: string[];
  questionProgress?: InternalOpportunityCallQuestionProgress;
  reason?: string | null;
  reasoning?: string | null;
  resumePromptNeeded?: boolean;
  roleId?: string;
  roleTitle?: string;
};

export type InternalOpportunityCallRequest = {
  companyLogoUrl: string | null;
  companyName: string;
  createdAt: string;
  id: string;
  opportunityId: string;
  questions: string[];
  questionProgress: InternalOpportunityCallQuestionProgress;
  reason: string | null;
  resumePromptNeeded: boolean;
  roleId: string;
  roleTitle: string;
  status: string;
  updatedAt: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const optionalString = (value: unknown) => {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
};

const clip = (value: string | null | undefined, maxLength: number) => {
  const text = String(value ?? "").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
};

const normalizeQuestionList = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const questions: string[] = [];

  for (const item of value) {
    const question = optionalString(item)?.replace(/\s+/g, " ").slice(0, 220);
    if (!question || seen.has(question)) continue;
    seen.add(question);
    questions.push(question);
    if (questions.length >= INTERNAL_CALL_REQUEST_QUESTION_MAX) break;
  }

  return questions;
};

const hasResumeSignal = (
  profile: {
    resume_file_name?: unknown;
    resume_storage_path?: unknown;
    resume_text?: unknown;
  } | null
) =>
  Boolean(
    optionalString(profile?.resume_file_name) ||
    optionalString(profile?.resume_storage_path) ||
    optionalString(profile?.resume_text)
  );

function parseDecision(raw: string): InternalOpportunityCallDecision {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      return {
        doRequest: false,
        questions: [],
        reasoning: "LLM returned non-object JSON.",
        resumePromptNeeded: false,
        userFacingReason: null,
      };
    }

    const questions = normalizeQuestionList(parsed.questions);
    const doRequest = parsed.do_request === true || parsed.doRequest === true;

    return {
      doRequest:
        doRequest && questions.length >= INTERNAL_CALL_REQUEST_QUESTION_MIN,
      questions,
      reasoning:
        optionalString(parsed.reasoning)?.slice(0, REASONING_MAX_CHARS) ?? null,
      resumePromptNeeded:
        parsed.resume_prompt_needed === true ||
        parsed.resumePromptNeeded === true,
      userFacingReason:
        optionalString(
          parsed.user_facing_reason ?? parsed.userFacingReason
        )?.slice(0, USER_FACING_REASON_MAX_CHARS) ?? null,
    };
  } catch {
    return {
      doRequest: false,
      questions: [],
      reasoning: "LLM response was not parseable JSON.",
      resumePromptNeeded: false,
      userFacingReason: null,
    };
  }
}

function normalizeCallState(
  value: unknown
): InternalOpportunityCallRequestState {
  if (!isRecord(value)) return {};
  const questions = normalizeQuestionList(value.questions);
  return {
    companyLogoUrl: optionalString(value.companyLogoUrl),
    companyName: optionalString(value.companyName) ?? undefined,
    opportunityId: optionalString(value.opportunityId) ?? undefined,
    questions,
    questionProgress: normalizeInternalOpportunityCallQuestionProgress(
      value.questionProgress,
      questions.length
    ),
    reason: optionalString(value.reason),
    reasoning: optionalString(value.reasoning),
    resumePromptNeeded: value.resumePromptNeeded === true,
    roleId: optionalString(value.roleId) ?? undefined,
    roleTitle: optionalString(value.roleTitle) ?? undefined,
  };
}

export function serializeInternalOpportunityCallRequest(
  row: TalentCallRow | null
): InternalOpportunityCallRequest | null {
  if (!row) return null;
  const state = normalizeCallState(row.state);
  const opportunityId = state.opportunityId;
  const roleId = state.roleId;
  if (!opportunityId || !roleId) return null;

  return {
    companyLogoUrl: state.companyLogoUrl ?? null,
    companyName:
      state.companyName ??
      careerT(
        "ko",
        "career.call.internal_opportunity_call_actions.0fpx491",
        "회사"
      ),
    createdAt: row.created_at,
    id: row.id,
    opportunityId,
    questions: state.questions ?? [],
    questionProgress: normalizeInternalOpportunityCallQuestionProgress(
      state.questionProgress,
      state.questions?.length ?? 0
    ),
    reason: state.reason ?? null,
    resumePromptNeeded: Boolean(state.resumePromptNeeded),
    roleId,
    roleTitle: state.roleTitle ?? "Role",
    status: row.status,
    updatedAt: row.updated_at,
  };
}

export function appendInternalOpportunityCallRequestMarker(args: {
  callRequest: InternalOpportunityCallRequest;
  content: string;
}) {
  const marker = buildInternalOpportunityCallRequestMarker({
    callId: args.callRequest.id,
    companyName: args.callRequest.companyName,
    resumePromptNeeded: args.callRequest.resumePromptNeeded,
    roleTitle: args.callRequest.roleTitle,
  });

  if (args.content.includes(marker)) return args.content;
  return `${args.content.trim()}\n\n${marker}`.trim();
}

export async function attachInternalOpportunityCallRequestToMessage(args: {
  admin: TalentAdminClient;
  callRequest: InternalOpportunityCallRequest;
  content: string;
  conversationId: string;
  messageId: string | number;
  userId: string;
}) {
  const content = appendInternalOpportunityCallRequestMarker({
    callRequest: args.callRequest,
    content: stripPostgresUnsafeChars(args.content),
  });
  const messageId = Number(args.messageId);
  if (!Number.isFinite(messageId)) {
    return content;
  }

  const { error } = await args.admin
    .from("talent_messages")
    .update({ content })
    .eq("id", messageId)
    .eq("conversation_id", args.conversationId)
    .eq("user_id", args.userId);

  if (error) {
    await notifyUnsupportedUnicodeEscapeError({
      conversationId: args.conversationId,
      error,
      metadata: {
        callId: args.callRequest.id,
        contentLength: content.length,
        messageId,
      },
      route: "internalOpportunityCallRequest",
      stage: "talent_messages.update:attach_call_request_marker",
      userId: args.userId,
    });
    throw new Error(
      error.message ?? "Failed to attach internal call request marker"
    );
  }

  return content;
}

async function fetchRoleContext(args: {
  admin: TalentAdminClient;
  roleId: string;
}): Promise<InternalOpportunityCallRoleContext | null> {
  const { data, error } = await args.admin
    .from("company_roles")
    .select(
      `
        role_id,
        name,
        description,
        source_type,
        company_internal_roles (
          request
        ),
        company_workspace:company_workspace (
          company_name
        )
      `
    )
    .eq("role_id", args.roleId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to read internal role context");
  }
  if (!data || !isRecord(data)) return null;

  const workspace = Array.isArray(data.company_workspace)
    ? data.company_workspace[0]
    : data.company_workspace;
  const workspaceRecord = isRecord(workspace) ? workspace : {};

  return {
    companyName: optionalString(workspaceRecord.company_name),
    description: optionalString(data.description),
    request: optionalString(
      getCompanyInternalRoleRequest(
        data.company_internal_roles as
          | { request?: string | null }
          | Array<{ request?: string | null }>
          | null
      )
    ),
    roleId: optionalString(data.role_id) ?? args.roleId,
    sourceType: optionalString(data.source_type),
    title: optionalString(data.name),
  };
}

async function fetchExistingOpenInternalCallRequest(args: {
  admin: TalentAdminClient;
  opportunityId?: string | null;
  userId: string;
}) {
  const rows = await fetchOpenInternalOpportunityCallRequestRows({
    admin: args.admin,
    userId: args.userId,
  });
  if (!args.opportunityId) return rows[0] ?? null;

  return (
    rows.find(
      (row) =>
        normalizeCallState(row.state).opportunityId === args.opportunityId
    ) ?? null
  );
}

async function fetchOpenInternalOpportunityCallRequestRows(args: {
  admin: TalentAdminClient;
  createdAfter?: string;
  userId: string;
}) {
  let query = args.admin
    .from("talent_calls")
    .select("*")
    .eq("user_id", args.userId)
    .eq("kind", TALENT_CALL_KIND_INTERNAL_OPPORTUNITY_REQUEST)
    .in("status", [TALENT_CALL_STATUS_PENDING, TALENT_CALL_STATUS_ACTIVE]);

  if (args.createdAfter) {
    query = query.gt("created_at", args.createdAfter);
  }

  const { data, error } = await query
    .order("last_active_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(INTERNAL_CALL_REQUEST_LOOKBACK_LIMIT);

  if (error) {
    throw new Error(error.message ?? "Failed to read talent call requests");
  }

  return (data ?? []) as TalentCallRow[];
}

async function fetchTerminalInternalOpportunityCompanyDecisionRoleIds(args: {
  admin: TalentAdminClient;
  roleIds: string[];
  userId: string;
}) {
  const roleIds = Array.from(new Set(args.roleIds.filter(Boolean)));
  if (roleIds.length === 0) return new Set<string>();

  const { data, error } = await args.admin
    .from("talent_progress")
    .select("role_id, metadata")
    .eq("talent_id", args.userId)
    .eq("kind", "org_stage_change")
    .in("role_id", roleIds)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(
      error.message ?? "Failed to read internal opportunity company decisions"
    );
  }

  return new Set(
    (data ?? []).flatMap((row) => {
      return isTerminalInternalOpportunityCompanyDecision(row.metadata)
        ? [row.role_id]
        : [];
    })
  );
}

async function fetchCompletedInternalCallRequestForOpportunity(args: {
  admin: TalentAdminClient;
  opportunityId: string;
  userId: string;
}) {
  const { data, error } = await args.admin
    .from("talent_calls")
    .select("*")
    .eq("user_id", args.userId)
    .eq("kind", TALENT_CALL_KIND_INTERNAL_OPPORTUNITY_REQUEST)
    .eq("status", TALENT_CALL_STATUS_COMPLETED)
    .order("completed_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(INTERNAL_CALL_REQUEST_LOOKBACK_LIMIT);

  if (error) {
    throw new Error(error.message ?? "Failed to read completed call requests");
  }

  return (
    ((data ?? []) as TalentCallRow[]).find(
      (row) =>
        normalizeCallState(row.state).opportunityId === args.opportunityId
    ) ?? null
  );
}

export async function fetchPendingInternalOpportunityCallRequest(args: {
  admin: TalentAdminClient;
  userId: string;
}) {
  const [first] = await fetchPendingInternalOpportunityCallRequests({
    admin: args.admin,
    userId: args.userId,
  });
  return first ?? null;
}

export async function fetchPendingInternalOpportunityCallRequests(args: {
  admin: TalentAdminClient;
  now?: Date;
  userId: string;
}) {
  const nowMs = args.now?.getTime() ?? Date.now();
  const createdAfter = new Date(
    nowMs - INTERNAL_OPPORTUNITY_CALL_REQUEST_MAX_AGE_MS
  ).toISOString();
  const rows = await fetchOpenInternalOpportunityCallRequestRows({
    admin: args.admin,
    createdAfter,
    userId: args.userId,
  });

  const freshRequests = rows
    .map((row) => serializeInternalOpportunityCallRequest(row))
    .filter(
      (request): request is InternalOpportunityCallRequest => request !== null
    )
    .filter((request) =>
      isFreshInternalOpportunityCallRequest(request.createdAt, nowMs)
    );
  const terminalRoleIds =
    await fetchTerminalInternalOpportunityCompanyDecisionRoleIds({
      admin: args.admin,
      roleIds: freshRequests.map((request) => request.roleId),
      userId: args.userId,
    });

  return freshRequests.filter(
    (request) => !terminalRoleIds.has(request.roleId)
  );
}

export async function fetchInternalOpportunityCallRequestById(args: {
  admin: TalentAdminClient;
  callId: string;
  userId: string;
}) {
  const { data, error } = await args.admin
    .from("talent_calls")
    .select("*")
    .eq("id", args.callId)
    .eq("user_id", args.userId)
    .eq("kind", TALENT_CALL_KIND_INTERNAL_OPPORTUNITY_REQUEST)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to read talent call request");
  }

  return serializeInternalOpportunityCallRequest(
    (data ?? null) as TalentCallRow
  );
}

export async function touchInternalOpportunityCallRequest(args: {
  admin: TalentAdminClient;
  callId: string;
  userId: string;
}) {
  const now = new Date().toISOString();
  const { error } = await args.admin
    .from("talent_calls")
    .update({
      last_active_at: now,
      started_at: now,
      status: TALENT_CALL_STATUS_ACTIVE,
      updated_at: now,
    })
    .eq("id", args.callId)
    .eq("user_id", args.userId)
    .eq("kind", TALENT_CALL_KIND_INTERNAL_OPPORTUNITY_REQUEST)
    .in("status", [TALENT_CALL_STATUS_PENDING, TALENT_CALL_STATUS_ACTIVE]);

  if (error) {
    throw new Error(error.message ?? "Failed to touch talent call request");
  }
}

export async function advanceInternalOpportunityCallRequestQuestion(args: {
  admin: TalentAdminClient;
  callId: string;
  userId: string;
}) {
  const { data, error } = await args.admin
    .from("talent_calls")
    .select("state")
    .eq("id", args.callId)
    .eq("user_id", args.userId)
    .eq("kind", TALENT_CALL_KIND_INTERNAL_OPPORTUNITY_REQUEST)
    .in("status", [TALENT_CALL_STATUS_PENDING, TALENT_CALL_STATUS_ACTIVE])
    .maybeSingle();

  if (error) {
    throw new Error(
      error.message ?? "Failed to read internal call question progress"
    );
  }
  if (!data) return null;

  const rawState = isRecord(data.state) ? data.state : {};
  const state = normalizeCallState(data.state);
  const questions = state.questions ?? [];
  const questionProgress = advanceInternalOpportunityCallQuestionProgress(
    normalizeInternalOpportunityCallQuestionProgress(
      state.questionProgress,
      questions.length
    ),
    questions.length
  );
  const now = new Date().toISOString();
  const { error: updateError } = await args.admin
    .from("talent_calls")
    .update({
      last_active_at: now,
      state: {
        ...rawState,
        questionProgress,
      } as Json,
      updated_at: now,
    })
    .eq("id", args.callId)
    .eq("user_id", args.userId)
    .eq("kind", TALENT_CALL_KIND_INTERNAL_OPPORTUNITY_REQUEST)
    .in("status", [TALENT_CALL_STATUS_PENDING, TALENT_CALL_STATUS_ACTIVE]);

  if (updateError) {
    throw new Error(
      updateError.message ?? "Failed to update internal call question progress"
    );
  }

  return questionProgress;
}

export async function completeInternalOpportunityCallRequest(args: {
  admin: TalentAdminClient;
  callId: string;
  userId: string;
}) {
  const now = new Date().toISOString();
  const { error } = await args.admin
    .from("talent_calls")
    .update({
      completed_at: now,
      last_active_at: now,
      status: TALENT_CALL_STATUS_COMPLETED,
      updated_at: now,
    })
    .eq("id", args.callId)
    .eq("user_id", args.userId)
    .eq("kind", TALENT_CALL_KIND_INTERNAL_OPPORTUNITY_REQUEST);

  if (error) {
    throw new Error(error.message ?? "Failed to complete talent call request");
  }
}

function buildDecisionPrompt(args: {
  candidateName: string | null;
  companyName: string;
  hasResume: boolean;
  insights: Record<string, string>;
  opportunity: TalentOpportunityHistoryItem;
  preferredLocale?: string | null;
  profileContext: string;
  recentConversationContext: string;
  roleContext: InternalOpportunityCallRoleContext;
}) {
  const outputLanguage = getCareerPromptLanguageName(args.preferredLocale);

  return [
    "You decide whether Harper should offer an optional short voice call after a candidate accepted an internal opportunity.",
    "",
    "Product intent:",
    "- The call is optional and not evaluative.",
    "- The company-side intro process must continue even if the user does not call.",
    "- Request a call only when at least 3 concrete, role-specific questions would materially improve how Harper presents the candidate to the company.",
    "- If there are fewer than 3 useful questions, set do_request=false.",
    "- Never expose private company request text to the user. Use it only to reason.",
    "- Avoid sensitive/protected-attribute questions.",
    "- For resume_prompt_needed, only an uploaded/stored resume file or resume text counts as a resume. LinkedIn/profile links do not count.",
    "",
    "Return JSON only:",
    "{",
    '  "do_request": boolean,',
    `  "questions": ["3-5 short ${outputLanguage} questions"],`,
    `  "user_facing_reason": "one short ${outputLanguage} reason Harper can say to the user",`,
    '  "resume_prompt_needed": boolean,',
    '  "reasoning": "internal Korean or English rationale"',
    "}",
    "",
    "Accepted internal opportunity:",
    `- candidateName: ${args.candidateName ?? "(unknown)"}`,
    `- companyName: ${args.companyName}`,
    `- roleTitle: ${args.opportunity.title}`,
    `- location: ${args.opportunity.location ?? "(unknown)"}`,
    `- workMode: ${args.opportunity.workMode ?? "(unknown)"}`,
    `- recommendationSummary: ${args.opportunity.recommendationSummary ?? "(none)"}`,
    `- recommendationReasons: ${args.opportunity.recommendationReasons.join(" / ") || "(none)"}`,
    `- recommendationConcerns: ${args.opportunity.recommendationConcerns?.join(" / ") || "(none)"}`,
    "",
    "Role description:",
    clip(args.roleContext.description, ROLE_DESCRIPTION_MAX_CHARS) || "(none)",
    "",
    "Private company/request context. Reasoning-only; do not quote to the user:",
    clip(args.roleContext.request, ROLE_REQUEST_MAX_CHARS) || "(none)",
    "",
    `Resume file/text present: ${args.hasResume ? "yes" : "no"}`,
    "",
    "Candidate profile context:",
    clip(args.profileContext, PROFILE_CONTEXT_MAX_CHARS) || "(none)",
    "",
    "Recent related conversation/context:",
    clip(
      args.recentConversationContext,
      RECENT_CONVERSATION_CONTEXT_MAX_CHARS
    ) || "(none)",
    "",
    "Known future-matching insights/preferences:",
    clip(JSON.stringify(args.insights, null, 2), INSIGHT_CONTEXT_MAX_CHARS) ||
      "(none)",
  ].join("\n");
}

async function fetchRecentConversationContext(args: {
  admin: TalentAdminClient;
  conversationId: string | null;
  userId: string;
}) {
  const conversationId = args.conversationId?.trim();
  if (!conversationId) return "";

  const messages = await fetchRecentMessagesWithSummary({
    admin: args.admin,
    conversationId,
    recentLimit: 12,
    userId: args.userId,
  });

  return messages
    .map((message) => {
      const role = message.role === "user" ? "User" : "Harper";
      const content = formatTalentMessageContentForLlmPrompt(message)
        .replace(/\s+/g, " ")
        .trim();
      return content ? `${role}: ${content}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

async function decideInternalOpportunityCallRequest(args: {
  admin: TalentAdminClient;
  conversationId: string | null;
  opportunity: TalentOpportunityHistoryItem;
  roleContext: InternalOpportunityCallRoleContext;
  userId: string;
}) {
  const [profile, setting, insights, recentConversationContext] =
    await Promise.all([
      fetchTalentUserProfile({ admin: args.admin, userId: args.userId }),
      fetchTalentSetting({ admin: args.admin, userId: args.userId }),
      fetchTalentInsights({ admin: args.admin, userId: args.userId }),
      fetchRecentConversationContext({
        admin: args.admin,
        conversationId: args.conversationId,
        userId: args.userId,
      }),
    ]);
  const structuredProfile = await fetchTalentStructuredProfile({
    admin: args.admin,
    talentUser: profile,
    userId: args.userId,
  });
  const profileContext = buildTalentProfileContext({
    maxResumeChars: 3000,
    profile,
    setting,
    structuredProfile,
  });
  const companyName =
    args.roleContext.companyName ?? args.opportunity.companyName;
  const raw = await runTalentAssistantCompletion({
    anthropicOverloadFallbackModel:
      CAREER_LLM_CONFIG.assistant.anthropicOverloadFallbackModel,
    fallbackModel: CAREER_LLM_CONFIG.assistant.fallbackModel,
    jsonMode: true,
    messages: [
      {
        role: "system",
        content:
          "You are Harper's product policy assistant for internal opportunity follow-up calls. Always return strict JSON.",
      },
      {
        role: "user",
        content: buildDecisionPrompt({
          candidateName: optionalString(profile?.name),
          companyName,
          hasResume: hasResumeSignal(profile),
          insights:
            normalizeTalentInsightContent(insights?.content ?? null) ?? {},
          opportunity: args.opportunity,
          preferredLocale: setting?.preferred_locale ?? null,
          profileContext,
          recentConversationContext,
          roleContext: args.roleContext,
        }),
      },
    ],
    primaryModel: CAREER_LLM_CONFIG.assistant.primaryModel,
    temperature: CAREER_LLM_CONFIG.internalOpportunityCallRequest.temperature,
    usageLabel: "career/internal-opportunity-call-request:decision",
  });

  const decision = parseDecision(raw);
  return {
    ...decision,
    resumePromptNeeded:
      decision.resumePromptNeeded || !hasResumeSignal(profile),
  };
}

export async function maybeCreateInternalOpportunityCallRequest(args: {
  admin: TalentAdminClient;
  conversationId: string | null;
  opportunity: TalentOpportunityHistoryItem | null;
  userId: string;
}) {
  const opportunity = args.opportunity;
  if (!opportunity) return null;
  if (opportunity.sourceType !== "internal") return null;
  if (opportunity.feedback !== "positive") return null;

  const existingOpen = await fetchExistingOpenInternalCallRequest({
    admin: args.admin,
    opportunityId: opportunity.id,
    userId: args.userId,
  });
  if (existingOpen)
    return serializeInternalOpportunityCallRequest(existingOpen);

  const completedForOpportunity =
    await fetchCompletedInternalCallRequestForOpportunity({
      admin: args.admin,
      opportunityId: opportunity.id,
      userId: args.userId,
    });
  if (completedForOpportunity) return null;

  const roleContext = await fetchRoleContext({
    admin: args.admin,
    roleId: opportunity.roleId,
  });
  if (!roleContext) return null;

  const decision = await decideInternalOpportunityCallRequest({
    admin: args.admin,
    conversationId: args.conversationId,
    opportunity,
    roleContext,
    userId: args.userId,
  });
  if (!decision.doRequest) return null;

  const now = new Date().toISOString();
  const companyName = roleContext.companyName ?? opportunity.companyName;
  const roleTitle = roleContext.title ?? opportunity.title;
  const { data, error } = await args.admin
    .from("talent_calls")
    .insert({
      conversation_id: args.conversationId ?? null,
      kind: TALENT_CALL_KIND_INTERNAL_OPPORTUNITY_REQUEST,
      last_active_at: now,
      state: {
        companyName,
        companyLogoUrl: opportunity.companyLogoUrl,
        createdFrom: "internal_opportunity_feedback",
        opportunityId: opportunity.id,
        questions: decision.questions,
        questionProgress: {
          candidateQuestionsAsked: false,
          nextQuestionIndex: 0,
        },
        reason: decision.userFacingReason,
        reasoning: decision.reasoning,
        resumePromptNeeded: decision.resumePromptNeeded,
        roleId: opportunity.roleId,
        roleTitle,
      } satisfies InternalOpportunityCallRequestState,
      status: TALENT_CALL_STATUS_PENDING,
      user_id: args.userId,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      const raced = await fetchExistingOpenInternalCallRequest({
        admin: args.admin,
        opportunityId: opportunity.id,
        userId: args.userId,
      });
      return serializeInternalOpportunityCallRequest(raced);
    }
    throw new Error(error.message ?? "Failed to create talent call request");
  }

  return serializeInternalOpportunityCallRequest(data as TalentCallRow);
}
