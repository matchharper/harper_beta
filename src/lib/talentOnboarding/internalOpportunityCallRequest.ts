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
import { CAREER_CALL_END_MARKER } from "../career/prompts";
import { careerT } from "@/lib/career/translatedCareerMessage";
import { stripPostgresUnsafeChars } from "@/lib/textSanitization";
import { notifyUnsupportedUnicodeEscapeError } from "@/lib/errorAlert";

export const TALENT_CALL_KIND_INTERNAL_OPPORTUNITY_REQUEST =
  "internal_opportunity_request";

export const TALENT_CALL_STATUS_PENDING = "pending";
export const TALENT_CALL_STATUS_ACTIVE = "active";
export const TALENT_CALL_STATUS_COMPLETED = "completed";

export const isOpenInternalOpportunityCallRequestStatus = (
  status: string | null | undefined
) =>
  status === TALENT_CALL_STATUS_PENDING || status === TALENT_CALL_STATUS_ACTIVE;

const INTERNAL_CALL_REQUEST_MARKER_PREFIX =
  "[[INTERNAL_OPPORTUNITY_CALL_REQUEST:";
const INTERNAL_CALL_REQUEST_MARKER_SUFFIX = "]]";
const INTERNAL_CALL_REQUEST_QUESTION_MIN = 3;
const INTERNAL_CALL_REQUEST_QUESTION_MAX = 5;
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
  reason: string | null;
  resumePromptNeeded: boolean;
  roleId: string;
  roleTitle: string;
  status: string;
  updatedAt: string;
};

export type InternalOpportunityCallRequestMarkerPayload = {
  callId: string;
  companyName: string;
  resumePromptNeeded?: boolean;
  roleTitle: string;
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
  return {
    companyLogoUrl: optionalString(value.companyLogoUrl),
    companyName: optionalString(value.companyName) ?? undefined,
    opportunityId: optionalString(value.opportunityId) ?? undefined,
    questions: normalizeQuestionList(value.questions),
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
    reason: state.reason ?? null,
    resumePromptNeeded: Boolean(state.resumePromptNeeded),
    roleId,
    roleTitle: state.roleTitle ?? "Role",
    status: row.status,
    updatedAt: row.updated_at,
  };
}

export function buildInternalOpportunityCallRequestMarker(
  payload: InternalOpportunityCallRequestMarkerPayload
) {
  return `${INTERNAL_CALL_REQUEST_MARKER_PREFIX}${encodeURIComponent(
    JSON.stringify(payload)
  )}${INTERNAL_CALL_REQUEST_MARKER_SUFFIX}`;
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
        request,
        source_type,
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
    request: optionalString(data.request),
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
  userId: string;
}) {
  const { data, error } = await args.admin
    .from("talent_calls")
    .select("*")
    .eq("user_id", args.userId)
    .eq("kind", TALENT_CALL_KIND_INTERNAL_OPPORTUNITY_REQUEST)
    .in("status", [TALENT_CALL_STATUS_PENDING, TALENT_CALL_STATUS_ACTIVE])
    .order("last_active_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(INTERNAL_CALL_REQUEST_LOOKBACK_LIMIT);

  if (error) {
    throw new Error(error.message ?? "Failed to read talent call requests");
  }

  return (data ?? []) as TalentCallRow[];
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
  userId: string;
}) {
  const rows = await fetchOpenInternalOpportunityCallRequestRows({
    admin: args.admin,
    userId: args.userId,
  });

  return rows
    .map((row) => serializeInternalOpportunityCallRequest(row))
    .filter(
      (request): request is InternalOpportunityCallRequest => request !== null
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
    usageLabel: "career/internal-opportunity-call-request",
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

export function buildInternalOpportunityCallProactiveInstruction(
  callRequest: InternalOpportunityCallRequest | null
) {
  if (!callRequest) return "";

  const questionCount = Math.max(
    INTERNAL_CALL_REQUEST_QUESTION_MIN,
    Math.min(INTERNAL_CALL_REQUEST_QUESTION_MAX, callRequest.questions.length)
  );

  return [
    "A pending optional call request has been created for this accepted internal opportunity.",
    `- companyName: ${callRequest.companyName}`,
    `- roleTitle: ${callRequest.roleTitle}`,
    `- questionCount: ${questionCount}`,
    callRequest.reason ? `- userFacingReason: ${callRequest.reason}` : "",
    callRequest.resumePromptNeeded
      ? "- Resume file/text is missing. Invite the user to upload a resume as a helpful optional action. LinkedIn/profile links do not count as a resume."
      : "",
    "",
    "In the assistant reply:",
    "- First, Thank the user and guide internal opportunity connection process based on '## Internal opportunity accepted or liked'",
    "- and say the company-side introduction/process will continue and is not blocked by the call.",
    "- Then, at the next paragraph, refer about the call request. Offer the call as optional, short, and not evaluative.",
    "- Mention the user can also ask questions about the company/process in the call.",
    "- Do not include the call button text manually; the UI card will be attached automatically.",
    "예시 (실제로는 markdown을 더 다양하게 활용하고, 자세히 안내해라. 줄바꿈도 많이 쓸 것)",
    "[이름]님 연결 제안 수락해주셔서 감사해요.",
    "이제 이 건은 Harper가 [이름]님을 회사 쪽에 잘 전달드리는 방향으로 진행할게요. 이건 일반적인 공고 지원이 아니라, Harper가 핏을 보고 회사와 후보자 사이를 조율하는 연결에 가까워요. 회사 쪽 일정이나 검토 상황에 따라 답변까지는 조금 시간이 걸릴 수 있어요.",
    "",
    "",
    "위에서 말씀드린 프로세스는 계속 진행될텐데 혹시 그와 동시에 저랑 통화하면서 제가 [이름]님에 대해서 몇가지 정보를 더 들을 수 있을까요?",
    "",
    "평가를 하기위한 통화는 아니고 [회사명] 측이 보통 궁금해하는 것들이 있는데, 그 정보를 알면 [이름]님이 다음 단계 진행 되도록 하는데도 더 도움이 될 것 같아서요. 그리고 [이름]님도 궁금하신게 있으시면 물어보셔도 되요. 길진 않을 것 같아요. 4~5개의 가벼운 질문이에요. 편하신 시간에 언제든지 해주세요!",
    "",
    "(만약 이력서가 없다면) 지금 이력서는 올려주시지 않은 걸로 확인되는데, 이력서를 주시는게 가장 직접적인 도움이긴해요. 여기서 올려주세요 [프로필 - 이력서 이동 버튼/link]",
  ]
    .filter((line) => line.trim().length > 0)
    .join("\n");
}

/**
 * Internal 수락시 추가적인 정보 질문을 위해 voice call을 진행할 때 사용되는 프롬프트
 */
export function buildInternalOpportunityRealtimeInstruction(
  callRequest: InternalOpportunityCallRequest & {
    preferredLocale?: string | null;
  }
) {
  const outputLanguage = getCareerPromptLanguageName(
    callRequest.preferredLocale
  );

  return [
    "This live voice call is specifically for an accepted internal opportunity connection.",
    `- companyName: ${callRequest.companyName}`,
    `- roleTitle: ${callRequest.roleTitle}`,
    `- roleId: ${callRequest.roleId}`,
    `- Speak in ${outputLanguage}.`,
    "",
    "Call purpose:",
    "- This is not an interview or evaluation.",
    "- The company-side connection is already proceeding by Harper.",
    "- Ask short questions to collect better context for Harper to present the candidate to the company.",
    "- The user may also ask questions about the company or process.",
    "- Do not directly say 'I will pass this to the company exactly like this.' Say something more natural, such as that the details are helpful, and if needed say Harper will reflect them.",
    "- For language questions, do not simply ask 'Is your English good?' Ask about a concrete situation where fluent communication may matter, or ask about specific language use or international experience.",
    "- For each question, at most once, if the user's answer is shorter than two sentences, you may ask one short follow-up question.",
    "",
    "Required opening:",
    "- Start by referencing the company and role.",
    "- Say the connection is already progressing.",
    "- Say the call is optional/non-evaluative and only helps Harper present them better.",
    "- Then ask the first question immediately.",
    "",
    "Question plan. Ask one at a time, adapting naturally to answers:",
    ...callRequest.questions.map(
      (question, index) => `${index + 1}. ${question}`
    ),
    "",
    "Before ending:",
    `- You must ask at least once, in ${outputLanguage}, whether the user has questions about ${callRequest.companyName} or the next process.`,
    "- End when you think the call is over or the user accepts or require to stop.",
    `- End with a natural short closing in ${outputLanguage}, then append ${CAREER_CALL_END_MARKER}. Do not hesitate to end the call with ${CAREER_CALL_END_MARKER}.`,
  ].join("\n");
}

export function buildInternalOpportunityCallWrapupInstruction(args: {
  callRequest: InternalOpportunityCallRequest;
  durationLabel: string | null;
  isBrief: boolean;
  preferredLocale?: string | null;
  transcript: Array<{ role: "user" | "assistant"; text: string }>;
}) {
  const outputLanguage = getCareerPromptLanguageName(args.preferredLocale);
  const transcriptText = args.transcript
    .map((entry) => {
      const role = entry.role === "user" ? "User" : "Harper";
      return `${role}: ${entry.text.replace(/\s+/g, " ").trim()}`;
    })
    .filter((line) => line.trim().length > 0)
    .join("\n");

  return [
    "## Internal opportunity call wrap-up",
    "The user just ended a voice call for an accepted internal opportunity.",
    `- companyName: ${args.callRequest.companyName}`,
    `- roleTitle: ${args.callRequest.roleTitle}`,
    `- callDuration: ${args.durationLabel ?? "(unknown)"}`,
    `- callLengthAssessment: ${args.isBrief ? "brief_or_incomplete" : "substantial"}`,
    "",
    "Tool instruction:",
    "- If the user disclosed clear profile facts, role-specific achievements, constraints, preferences, or resume/CV positioning context, call update_talent_profile before writing the wrap-up.",
    "- Do not call search, recommendation, company research, or activity-reading tools.",
    "",
    "Response instruction:",
    `- Write one short natural ${outputLanguage} follow-up message for the chat after the call ends.`,
    "- Say the connection is continuing.",
    "- If the call was substantial, say Harper will reflect the shared details when presenting them to the company.",
    "- If the call was brief/incomplete, do not ask them to continue in chat; tell them they can continue from the Home call card when convenient.",
    "- No heading, no bullets, 1-3 sentences.",
    "",
    "[Call transcript]",
    transcriptText || "(no transcript text)",
  ].join("\n");
}
