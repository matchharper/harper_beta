import { createHash, randomUUID } from "node:crypto";
import { stripPostgresUnsafeChars } from "@/lib/textSanitization";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { fetchTalentSetting } from "@/lib/talentOnboarding/server";
import type { OpportunityRunRow, OpportunityRunStatus } from "./types";
import type { OpportunityRunMarkerRelation } from "./messageMarker";

export const CAREER_CHAT_EXTERNAL_SEARCH_RUN_CONTRACT =
  "career_chat_external_search_v1";
export const DEFAULT_ON_DEMAND_JOB_SEARCH_MAX_RESULTS = 15;
export const MAX_ON_DEMAND_JOB_SEARCH_RESULTS = 20;
export const MIN_ON_DEMAND_JOB_SEARCH_RESULTS = 1;

export type RecommendJobPostingsKind = "instant" | "bulk";

export function normalizeRecommendJobPostingsKind(
  value: unknown
): RecommendJobPostingsKind {
  return value === "bulk" ? "bulk" : "instant";
}

const REQUEST_MAX_LENGTH = 1400;
const SAFE_PURPOSE_MAX_LENGTH = 240;

export type OnDemandJobSearchOutcome =
  | "queued"
  | "deduplicated"
  | "active_same_request"
  | "active_different_request"
  | "stale_replaced";

export type OnDemandJobSearchToolResult = {
  accepted: boolean;
  answerDraft: string;
  assistantInstruction: string;
  blockingRun?: {
    ageMinutes: number;
    createdAt: string;
    id: string;
    maxResults: number | null;
    purposeText: string;
    startedAt: string | null;
    status: "queued" | "running";
  };
  currentRequestAlreadyRepresented: boolean;
  currentRequestApplied: boolean;
  currentRequestMergedIntoActiveRun: false;
  deliveryExpectation: {
    chat: "expected";
    email: "expected" | "unavailable" | "unknown";
    userFacingText: string;
  };
  lifecycleEffect: {
    directRequestCountsAsStrongReaction: boolean;
    invocationKind: "direct_user_request" | "session_reengagement";
    preferenceChanged: false;
    reactivationExpected: boolean;
  };
  newRunCreated: boolean;
  ok: true;
  outcome: OnDemandJobSearchOutcome;
  replacedRun?: {
    id: string;
    previousStatus: "queued" | "running";
    purposeText: string;
    terminationReason: "stale_timeout";
  };
  requestedRequest: {
    kind: RecommendJobPostingsKind;
    maxResults: number;
    maxResultsAdjusted: boolean;
    originalMaxResults: number | null;
    purposeText: string;
    requestText: string;
    scope: "one_off";
  };
  skipCommonAssistantInstruction: true;
  statusRelation: OpportunityRunMarkerRelation;
  statusRun: ReturnType<typeof toSafeStatusRun>;
  statusRunId: string;
};

export type OnDemandJobSearchNoRunResult = {
  accepted: false;
  answerDraft: string;
  assistantInstruction: string;
  currentRequestAlreadyRepresented: false;
  currentRequestApplied: false;
  currentRequestMergedIntoActiveRun: false;
  deliveryExpectation: {
    chat: "not_scheduled" | "unknown";
    email: "not_scheduled" | "unknown";
    userFacingText: string;
  };
  lifecycleEffect: {
    directRequestCountsAsStrongReaction: true;
    invocationKind: "direct_user_request";
    preferenceChanged: false;
    reactivationExpected: false;
  };
  newRunCreated: false;
  ok: boolean;
  outcome:
    | "external_recommendations_disabled"
    | "enqueue_failed"
    | "enqueue_status_unknown";
  requestedRequest: {
    kind: "bulk";
    maxResults: number;
    purposeText: string;
    requestText: string;
  };
  retryAfterSeconds?: number | null;
  retryable?: boolean;
  skipCommonAssistantInstruction: true;
  statusRelation: null;
  statusRun: null;
  statusRunId: null;
};

export type RecommendJobPostingsAsyncToolResult =
  | OnDemandJobSearchToolResult
  | OnDemandJobSearchNoRunResult;

export type RecommendJobPostingsReceipt = {
  answerDraft: string;
  newRunCreated: boolean;
  outcome: RecommendJobPostingsAsyncToolResult["outcome"];
  statusRelation: OpportunityRunMarkerRelation | null;
  statusRunId: string | null;
};

type RpcResult = {
  blocking_run?: unknown;
  outcome?: unknown;
  replaced_run?: unknown;
  status_run?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

const ASYNC_RECEIPT_OUTCOMES = new Set<
  RecommendJobPostingsAsyncToolResult["outcome"]
>([
  "queued",
  "deduplicated",
  "active_same_request",
  "active_different_request",
  "stale_replaced",
  "external_recommendations_disabled",
  "enqueue_failed",
  "enqueue_status_unknown",
]);

export function extractRecommendJobPostingsReceipt(
  value: unknown
): RecommendJobPostingsReceipt | null {
  const result = asRecord(value);
  if (!result || !ASYNC_RECEIPT_OUTCOMES.has(result.outcome as any)) {
    return null;
  }
  const answerDraft = stripPostgresUnsafeChars(String(result.answerDraft ?? ""))
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 5000);
  if (!answerDraft) return null;
  const statusRunId =
    typeof result.statusRunId === "string" && result.statusRunId.trim()
      ? result.statusRunId.trim()
      : null;
  const statusRelation =
    result.statusRelation === "accepted" ||
    result.statusRelation === "same_request" ||
    result.statusRelation === "blocking_other_request"
      ? result.statusRelation
      : null;
  if (Boolean(statusRunId) !== Boolean(statusRelation)) return null;
  return {
    answerDraft,
    newRunCreated: result.newRunCreated === true,
    outcome: result.outcome as RecommendJobPostingsAsyncToolResult["outcome"],
    statusRelation,
    statusRunId,
  };
}

function normalizeRequest(value: unknown) {
  return stripPostgresUnsafeChars(String(value ?? ""))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, REQUEST_MAX_LENGTH);
}

export function normalizeOnDemandJobSearchMaxResults(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  const originalMaxResults = Number.isFinite(parsed) ? parsed : null;
  const integer = Number.isInteger(parsed)
    ? parsed
    : DEFAULT_ON_DEMAND_JOB_SEARCH_MAX_RESULTS;
  const maxResults = Math.max(
    MIN_ON_DEMAND_JOB_SEARCH_RESULTS,
    Math.min(MAX_ON_DEMAND_JOB_SEARCH_RESULTS, integer)
  );
  return {
    maxResults,
    maxResultsAdjusted:
      originalMaxResults !== null && originalMaxResults !== maxResults,
    originalMaxResults,
  };
}

function normalizePurposeText(value: unknown, fallback: string) {
  const purpose = normalizeRequest(value || fallback).slice(
    0,
    SAFE_PURPOSE_MAX_LENGTH
  );
  return purpose || "요청하신 새 공고";
}

function normalizeStatus(value: unknown): OpportunityRunStatus {
  return value === "queued" ||
    value === "running" ||
    value === "completed" ||
    value === "partial" ||
    value === "failed"
    ? value
    : "queued";
}

function toSafeStatusRun(value: unknown, fallbackPurpose: string) {
  const row = asRecord(value);
  if (!row) throw new Error("enqueue response did not include a status run");
  const id = String(row.id ?? "").trim();
  const createdAt = String(row.created_at ?? row.createdAt ?? "").trim();
  if (!id || !createdAt) {
    throw new Error("enqueue response included an invalid status run");
  }
  const triggerPayload = asRecord(row.trigger_payload ?? row.triggerPayload);
  const request = asRecord(triggerPayload?.request);
  const maxResults = Number(
    row.target_recommendation_count ?? row.targetRecommendationCount
  );
  return {
    createdAt,
    id,
    maxResults:
      Number.isInteger(maxResults) && maxResults > 0 ? maxResults : null,
    purposeText: normalizePurposeText(request?.text, fallbackPurpose),
    sourceKind:
      triggerPayload?.runContract === CAREER_CHAT_EXTERNAL_SEARCH_RUN_CONTRACT
        ? ("on_demand" as const)
        : row.trigger === "conversation_completed"
          ? ("initial" as const)
          : row.trigger === "periodic_refresh_due"
            ? ("periodic" as const)
            : ("other" as const),
    startedAt:
      typeof (row.started_at ?? row.startedAt) === "string"
        ? String(row.started_at ?? row.startedAt)
        : null,
    status: normalizeStatus(row.status),
  };
}

function getRunPurposeFallback(value: unknown, locale?: string | null) {
  const row = asRecord(value);
  const payload = asRecord(row?.trigger_payload ?? row?.triggerPayload);
  const english = String(locale ?? "")
    .toLowerCase()
    .startsWith("en");
  if (row?.trigger === "conversation_completed") {
    return english
      ? "the first recommendation search after onboarding"
      : "온보딩 완료 후 첫 추천 검색";
  }
  if (row?.trigger === "periodic_refresh_due") {
    return english
      ? "the scheduled job recommendation update"
      : "정기 공고 추천 업데이트";
  }
  if (row?.trigger === "all_batch_feedback_submitted") {
    return english
      ? "a new recommendation search reflecting recent feedback"
      : "최근 공고 피드백을 반영한 새 추천 검색";
  }
  if (
    row?.trigger === "immediate_opportunity_requested" &&
    payload?.runContract !== CAREER_CHAT_EXTERNAL_SEARCH_RUN_CONTRACT
  ) {
    return english ? "another opportunity review" : "다른 기회 검토";
  }
  return english
    ? "the opportunity search that was scheduled first"
    : "먼저 접수된 기회 검색";
}

function ageMinutes(createdAt: string) {
  const timestamp = Date.parse(createdAt);
  if (!Number.isFinite(timestamp)) return 0;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
}

function emailExpectationText(emailAvailable: boolean) {
  return emailAvailable
    ? {
        chat: "expected" as const,
        email: "expected" as const,
        userFacingText:
          "준비가 끝나면 이 채팅과 이메일로 함께 알려드리겠습니다.",
      }
    : {
        chat: "expected" as const,
        email: "unavailable" as const,
        userFacingText:
          "사용 가능한 이메일 주소가 없어 준비가 끝나면 이 채팅으로 알려드리겠습니다.",
      };
}

function emailExpectationTextForLocale(args: {
  emailAvailable: boolean | null;
  locale?: string | null;
}) {
  const english = String(args.locale ?? "")
    .toLowerCase()
    .startsWith("en");
  if (args.emailAvailable === null) {
    return {
      chat: "expected" as const,
      email: "unknown" as const,
      userFacingText: english
        ? "Harper will notify you in this chat and will also use email if it is available when the search finishes."
        : "준비가 끝나면 이 채팅으로 알려드리고, 완료 시 이메일 전달이 가능한 상태면 함께 보내드리겠습니다.",
    };
  }
  if (!english) return emailExpectationText(args.emailAvailable);
  return args.emailAvailable
    ? {
        chat: "expected" as const,
        email: "expected" as const,
        userFacingText:
          "When it is ready, Harper will let you know in this chat and by email.",
      }
    : {
        chat: "expected" as const,
        email: "unavailable" as const,
        userFacingText:
          "There is no usable email address, so Harper will let you know in this chat when it is ready.",
      };
}

function getNoRunCopy(args: {
  locale?: string | null;
  outcome: OnDemandJobSearchNoRunResult["outcome"];
}) {
  const english = String(args.locale ?? "")
    .toLowerCase()
    .startsWith("en");
  if (args.outcome === "external_recommendations_disabled") {
    return english
      ? "I did not schedule a search because external job recommendations are currently disabled. If you want to receive external roles again, tell me to turn them back on; after the setting is updated, I can schedule this search."
      : "현재 외부 공고 추천 설정이 꺼져 있어 이번 검색은 접수하지 않았어요. 외부 공고를 다시 받고 싶다고 말씀해 주시면 먼저 설정을 켠 뒤, 같은 조건으로 검색을 접수하겠습니다.";
  }
  if (args.outcome === "enqueue_status_unknown") {
    return english
      ? "I could not confirm whether the search request was registered. I did not immediately create another one to avoid a duplicate. If no search status appears, please send a new message shortly and ask again."
      : "검색 요청의 접수 상태를 지금 확인하지 못했습니다. 중복 검색을 만들지 않기 위해 같은 요청을 즉시 다시 등록하지는 않았어요. 검색 진행 표시가 나타나지 않으면 잠시 뒤 새 메시지로 다시 요청해 주세요.";
  }
  return english
    ? "I could not register the search request, so a search has not started. Please ask again with the same criteria in a moment."
    : "지금은 검색 요청을 등록하지 못해 실제 검색이 시작되지 않았습니다. 잠시 뒤 같은 조건으로 다시 요청해 주세요.";
}

function buildNoRunResult(args: {
  locale?: string | null;
  maxResults: number;
  outcome: OnDemandJobSearchNoRunResult["outcome"];
  requestText: string;
}): OnDemandJobSearchNoRunResult {
  const answerDraft = getNoRunCopy({
    locale: args.locale,
    outcome: args.outcome,
  });
  const statusUnknown = args.outcome === "enqueue_status_unknown";
  return {
    accepted: false,
    answerDraft,
    assistantInstruction:
      "Use answerDraft verbatim. Do not say a search was accepted, queued, started, or will deliver results. Do not mention internal errors or tool names.",
    currentRequestAlreadyRepresented: false,
    currentRequestApplied: false,
    currentRequestMergedIntoActiveRun: false,
    deliveryExpectation: {
      chat: statusUnknown ? "unknown" : "not_scheduled",
      email: statusUnknown ? "unknown" : "not_scheduled",
      userFacingText: answerDraft,
    },
    lifecycleEffect: {
      directRequestCountsAsStrongReaction: true,
      invocationKind: "direct_user_request",
      preferenceChanged: false,
      reactivationExpected: false,
    },
    newRunCreated: false,
    ok: args.outcome === "external_recommendations_disabled",
    outcome: args.outcome,
    requestedRequest: {
      kind: "bulk",
      maxResults: args.maxResults,
      purposeText: normalizePurposeText(args.requestText, args.requestText),
      requestText: args.requestText,
    },
    ...(args.outcome === "enqueue_failed" ||
    args.outcome === "enqueue_status_unknown"
      ? {
          retryAfterSeconds: statusUnknown ? null : 30,
          retryable: true,
        }
      : {}),
    skipCommonAssistantInstruction: true,
    statusRelation: null,
    statusRun: null,
    statusRunId: null,
  };
}

export function buildOnDemandJobSearchStatusUnknownResult(args: {
  locale?: string | null;
  maxResultsInput: unknown;
  request: string;
}) {
  const requestText = normalizeRequest(args.request);
  const { maxResults } = normalizeOnDemandJobSearchMaxResults(
    args.maxResultsInput
  );
  return buildNoRunResult({
    locale: args.locale,
    maxResults,
    outcome: "enqueue_status_unknown",
    requestText,
  });
}

function buildReceipt(args: {
  adjusted: boolean;
  blockerPurpose?: string;
  currentApplied: boolean;
  deliveryText: string;
  maxResults: number;
  originalMaxResults: number | null;
  outcome: OnDemandJobSearchOutcome;
  purpose: string;
  responseLocale?: string | null;
  replacedPurpose?: string;
  status: OpportunityRunStatus;
}) {
  const english = String(args.responseLocale ?? "")
    .toLowerCase()
    .startsWith("en");
  if (english) {
    const countText = args.adjusted
      ? `A single search can deliver at most ${args.maxResults} postings, so I adjusted your request from ${args.originalMaxResults} to a maximum of ${args.maxResults}.`
      : `I will select up to ${args.maxResults} postings for this search.`;
    if (args.outcome === "active_different_request") {
      return [
        `A search for “${args.blockerPurpose ?? "another opportunity request"}” is already in progress, so I did not create a new one. Because Harper runs one search at a time, your new “${args.purpose}” criteria were not added to or merged into the active search.`,
        `${args.deliveryText} Once that search finishes, send the new criteria again and I can schedule a separate search.`,
      ].join("\n\n");
    }
    if (args.outcome === "active_same_request") {
      return [
        `A search with the same purpose is already ${args.status === "queued" ? "queued" : "in progress"}. I did not create a duplicate; it already includes the “${args.purpose}” criteria and a maximum of ${args.maxResults} postings.`,
        `${args.deliveryText} You do not need to keep this page open, and Harper will not pad the result with weak matches just to reach the maximum.`,
      ].join("\n\n");
    }
    if (args.outcome === "deduplicated") {
      if (args.status === "completed" || args.status === "partial") {
        return "This same request has already been processed and its search results are ready. I did not create a duplicate. Check the latest result in this chat or open the full jobs view.";
      }
      if (args.status === "failed") {
        return "The earlier search for this same request did not finish. I did not automatically create a duplicate for the same request record. Send a new message if you want Harper to schedule a fresh search with the current criteria.";
      }
      return [
        `This same request is already ${args.status === "queued" ? "queued" : "in progress"}, so I did not create a duplicate after the retry.`,
        `${countText} ${args.deliveryText} You do not need to keep this page open.`,
      ].join("\n\n");
    }
    const replacement =
      args.outcome === "stale_replaced"
        ? `The earlier search for “${args.replacedPurpose ?? "another opportunity request"}” had no progress signal for an extended period, so Harper ended it as a problem state. `
        : "";
    return [
      `${replacement}I scheduled your search for “${args.purpose}.” Harper will use your current profile and experience as context while prioritizing this request. ${countText}`,
      `This deeper bulk search evaluates more postings for stronger matches, so it can take longer than an instant search. It runs in the background, so you do not need to keep this page open. ${args.deliveryText} If fewer strong postings pass the quality bar, Harper will send fewer rather than padding the result.`,
      "These criteria apply to this search only and will not become a long-term preference unless you separately ask to save them.",
    ].join("\n\n");
  }

  const countText = args.adjusted
    ? `한 번의 검색에서 전달할 수 있는 최대 개수에 맞춰 요청하신 ${args.originalMaxResults}개 대신 최대 ${args.maxResults}개 기준으로 조정했습니다.`
    : `이번에는 최대 ${args.maxResults}개의 공고를 선별하겠습니다.`;

  if (args.outcome === "active_different_request") {
    return [
      `현재 먼저 요청하신 “${args.blockerPurpose ?? "다른 기회 검토"}” 검색이 진행 중이라 새 검색을 만들지 않았습니다. 한 번에 한 검색만 진행하기 때문에, 방금 말씀하신 “${args.purpose}” 조건은 현재 검색에 추가되거나 합쳐지지 않았어요.`,
      `${args.deliveryText} 먼저 진행 중인 검색이 끝난 뒤 새 조건으로 다시 말씀해 주시면 별도의 검색으로 접수하겠습니다.`,
    ].join("\n\n");
  }

  if (args.outcome === "active_same_request") {
    return [
      `같은 목적의 검색이 이미 접수되어 ${args.status === "queued" ? "시작을 기다리고" : "진행 중"}이에요. 중복 검색을 하나 더 만들지는 않았고, 지금 검색에는 “${args.purpose}” 조건과 최대 ${args.maxResults}개 기준이 이미 포함되어 있습니다.`,
      `${args.deliveryText} 화면에 계속 머물러 계실 필요는 없습니다. 조건에 충분히 맞는 공고가 적으면 개수를 억지로 채우지 않겠습니다.`,
    ].join("\n\n");
  }

  if (args.outcome === "deduplicated") {
    if (args.status === "completed" || args.status === "partial") {
      return `같은 요청은 이미 처리되어 검색 결과가 준비된 상태예요. 중복 검색을 새로 만들지는 않았습니다. 이 채팅의 최신 결과와 전체 공고 보기에서 선별된 포지션을 확인해 주세요.`;
    }
    if (args.status === "failed") {
      return `같은 요청으로 접수된 이전 검색은 완료하지 못했고, 같은 요청 기록으로 새 검색을 자동 생성하지는 않았습니다. 원하시면 새 메시지로 다시 요청해 주세요. 그러면 현재 조건으로 새로운 검색을 접수하겠습니다.`;
    }
    return [
      `같은 요청은 이미 접수되어 ${args.status === "queued" ? "시작을 기다리고" : "진행 중"}이에요. 네트워크 재시도로 중복 검색을 만들지는 않았습니다.`,
      `${countText} ${args.deliveryText} 화면에 계속 머물러 계실 필요는 없습니다.`,
    ].join("\n\n");
  }

  const replacement =
    args.outcome === "stale_replaced"
      ? `먼저 진행 중이던 “${args.replacedPurpose ?? "다른 기회 검토"}” 검색은 오랫동안 진행 신호가 없어 문제 상태로 종료했습니다. `
      : "";
  return [
    `${replacement}요청하신 “${args.purpose}” 검색을 접수했어요. 현재 프로필과 경력을 기본 맥락으로 보되, 이번 요청을 가장 우선해서 살펴보겠습니다. ${countText}`,
    `더 많은 공고를 정밀하게 비교하는 대량 검색이라 빠른 검색보다 시간이 더 걸릴 수 있습니다. 백그라운드에서 진행되므로 이 화면에 계속 머물러 계실 필요는 없어요. ${args.deliveryText} 조건에 충분히 맞는 공고가 적으면 요청 개수를 억지로 채우지 않고 기준을 통과한 공고만 보내드릴게요.`,
    `이번 조건은 이번 검색의 목적이며, 별도로 요청하지 않는 한 향후 모든 추천의 장기 조건으로 저장하지 않습니다.`,
  ].join("\n\n");
}

function toRpcRun(value: unknown) {
  const row = asRecord(value);
  return row ?? null;
}

export function isCareerChatExternalSearchRun(run: unknown) {
  const row = asRecord(run);
  const payload = asRecord(row?.trigger_payload ?? row?.triggerPayload);
  return payload?.runContract === CAREER_CHAT_EXTERNAL_SEARCH_RUN_CONTRACT;
}

export async function findActiveCareerChatExternalSearchRun(args: {
  admin: TalentAdminClient;
  userId: string;
}) {
  const { data, error } = await ((args.admin as any)
    .from("opportunity_discovery_run")
    .select("*")
    .eq("talent_id", args.userId)
    .in("status", ["queued", "running"])
    .contains("trigger_payload", {
      runContract: CAREER_CHAT_EXTERNAL_SEARCH_RUN_CONTRACT,
    })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle() as Promise<{
    data: unknown;
    error: { message?: string } | null;
  }>);
  if (error) throw new Error(error.message ?? "Failed to load active search");
  return (data ?? null) as OpportunityRunRow | null;
}

export function buildActiveCareerChatExternalSearchResult(args: {
  activeRun: OpportunityRunRow;
  directUserRequest: boolean;
  kind: RecommendJobPostingsKind;
  maxResultsInput: unknown;
  request: string;
  responseLocale?: string | null;
}): OnDemandJobSearchToolResult {
  const requestText = normalizeRequest(args.request);
  const normalizedCount =
    args.kind === "bulk"
      ? normalizeOnDemandJobSearchMaxResults(args.maxResultsInput)
      : {
          maxResults: 5,
          maxResultsAdjusted: false,
          originalMaxResults: null,
        };
  const fingerprint = `sha256:${createHash("sha256")
    .update(`${requestText}\n${normalizedCount.maxResults}`)
    .digest("hex")}`;
  const payload = asRecord(args.activeRun.trigger_payload);
  const activeRequest = asRecord(payload?.request);
  const same =
    args.kind === "bulk" && activeRequest?.fingerprint === fingerprint;
  const statusRun = toSafeStatusRun(
    args.activeRun,
    getRunPurposeFallback(args.activeRun, args.responseLocale)
  );
  if (statusRun.status !== "queued" && statusRun.status !== "running") {
    throw new Error("Expected an active career search run");
  }
  const english = String(args.responseLocale ?? "")
    .toLowerCase()
    .startsWith("en");
  const deliveryExpectation = {
    chat: "expected" as const,
    email: "unknown" as const,
    userFacingText: english
      ? "Harper will notify you in this chat and, if email delivery is available at completion, by email as well."
      : "이 채팅으로 알려드리고, 완료 시 이메일 전달이 가능한 상태면 함께 보내드리겠습니다.",
  };
  const outcome = same
    ? ("active_same_request" as const)
    : ("active_different_request" as const);
  const purposeText = normalizePurposeText(requestText, requestText);
  return {
    accepted: false,
    answerDraft: buildReceipt({
      adjusted: normalizedCount.maxResultsAdjusted,
      blockerPurpose: statusRun.purposeText,
      currentApplied: same,
      deliveryText: deliveryExpectation.userFacingText,
      maxResults: normalizedCount.maxResults,
      originalMaxResults: normalizedCount.originalMaxResults,
      outcome,
      purpose: purposeText,
      responseLocale: args.responseLocale,
      status: statusRun.status,
    }),
    assistantInstruction:
      "Use answerDraft verbatim. Never say the new request was merged or accepted. Do not mention internal field names, run IDs, or tool names.",
    blockingRun: {
      ageMinutes: ageMinutes(statusRun.createdAt),
      createdAt: statusRun.createdAt,
      id: statusRun.id,
      maxResults: statusRun.maxResults,
      purposeText: statusRun.purposeText,
      startedAt: statusRun.startedAt,
      status: statusRun.status,
    },
    currentRequestAlreadyRepresented: same,
    currentRequestApplied: same,
    currentRequestMergedIntoActiveRun: false,
    deliveryExpectation,
    lifecycleEffect: {
      directRequestCountsAsStrongReaction: args.directUserRequest,
      invocationKind: args.directUserRequest
        ? "direct_user_request"
        : "session_reengagement",
      preferenceChanged: false,
      reactivationExpected: false,
    },
    newRunCreated: false,
    ok: true,
    outcome,
    requestedRequest: {
      kind: args.kind,
      maxResults: normalizedCount.maxResults,
      maxResultsAdjusted: normalizedCount.maxResultsAdjusted,
      originalMaxResults: normalizedCount.originalMaxResults,
      purposeText,
      requestText,
      scope: "one_off",
    },
    skipCommonAssistantInstruction: true,
    statusRelation: same ? "same_request" : "blocking_other_request",
    statusRun,
    statusRunId: statusRun.id,
  };
}

export async function enqueueOnDemandJobSearch(args: {
  admin: TalentAdminClient;
  conversationId: string;
  maxResultsInput: unknown;
  request: string;
  responseLocale?: string | null;
  userId: string;
  userMessageId?: number | string | null;
}): Promise<RecommendJobPostingsAsyncToolResult> {
  const requestText = normalizeRequest(args.request);
  if (!requestText) throw new Error("recommend_job_postings requires request");
  const userMessageId = String(args.userMessageId ?? "").trim();
  const hasUserMessage = /^[1-9][0-9]*$/.test(userMessageId);
  const sourceId = hasUserMessage
    ? `user_message:${userMessageId}`
    : `assistant_turn:${randomUUID()}`;
  const normalizedCount = normalizeOnDemandJobSearchMaxResults(
    args.maxResultsInput
  );
  const requestedAt = new Date().toISOString();
  const fingerprint = `sha256:${createHash("sha256")
    .update(`${requestText}\n${normalizedCount.maxResults}`)
    .digest("hex")}`;
  const dedupeKey = `career_recommend_job_postings:${args.userId}:${sourceId}`;
  const setting = await fetchTalentSetting({
    admin: args.admin,
    userId: args.userId,
  });
  if (setting?.get_external_recommendation === false) {
    return buildNoRunResult({
      locale: args.responseLocale,
      maxResults: normalizedCount.maxResults,
      outcome: "external_recommendations_disabled",
      requestText,
    });
  }
  const { data: talent, error: talentError } = await args.admin
    .from("talent_users")
    .select("email")
    .eq("user_id", args.userId)
    .maybeSingle();
  const deliveryExpectation = emailExpectationTextForLocale({
    emailAvailable: talentError
      ? null
      : typeof talent?.email === "string" && talent.email.trim().length > 0,
    locale: args.responseLocale,
  });
  const triggerPayload = {
    actionScope: "external_only",
    cadencePolicy: {
      affectsBaseCadence: false,
      affectsExternalCadence: false,
      affectsInternalCadence: false,
      countsAsPeriodicDelivery: false,
    },
    deliveryPolicy: {
      chat: true,
      email: true,
      periodicEmailCooldownHours: 24,
    },
    locksConversationInput: false,
    preferenceMutation: "none",
    request: {
      fingerprint,
      invocationKind: "direct_user_request",
      kind: "bulk",
      locale: args.responseLocale ?? null,
      maxResults: normalizedCount.maxResults,
      requestedAt,
      scope: "one_off",
      sourceId,
      sourceKind: hasUserMessage ? "user_message" : "assistant_turn",
      text: requestText,
      ...(hasUserMessage ? { messageId: userMessageId } : {}),
    },
    runContract: CAREER_CHAT_EXTERNAL_SEARCH_RUN_CONTRACT,
    schemaVersion: 1,
    source: "recommend_job_postings",
  };

  let { data, error } = await (args.admin as any).rpc(
    "enqueue_career_job_posting_discovery_run",
    {
      p_conversation_id: args.conversationId,
      p_dedupe_key: dedupeKey,
      p_fingerprint: fingerprint,
      p_settings_snapshot: {
        getExternalRecommendation: setting?.get_external_recommendation ?? true,
        profileVisibility: setting?.profile_visibility ?? null,
        recommendationBatchSize: setting?.recommendation_batch_size ?? null,
      },
      p_talent_id: args.userId,
      p_target_recommendation_count: normalizedCount.maxResults,
      p_trigger_payload: triggerPayload,
    }
  );
  if (error) {
    const { data: reconciled } = await ((args.admin as any)
      .from("opportunity_discovery_run")
      .select("*")
      .eq("talent_id", args.userId)
      .eq("dedupe_key", dedupeKey)
      .limit(1)
      .maybeSingle() as Promise<{
      data: unknown;
      error: { message?: string } | null;
    }>);
    if (reconciled) {
      data = { outcome: "deduplicated", status_run: reconciled };
      error = null;
    } else {
      return buildNoRunResult({
        locale: args.responseLocale,
        maxResults: normalizedCount.maxResults,
        // An RPC transport error does not prove the database transaction was
        // rolled back. The commit may become visible just after this immediate
        // reconciliation read, so fail closed instead of telling the user that
        // no search started and inviting an overlapping retry.
        outcome: "enqueue_status_unknown",
        requestText,
      });
    }
  }

  const rpcResult = (asRecord(data) ?? {}) as RpcResult;
  const rpcOutcome = String(rpcResult.outcome ?? "");
  if (rpcOutcome === "external_recommendations_disabled") {
    return buildNoRunResult({
      locale: args.responseLocale,
      maxResults: normalizedCount.maxResults,
      outcome: "external_recommendations_disabled",
      requestText,
    });
  }
  const outcome = rpcOutcome as OnDemandJobSearchOutcome;
  if (
    outcome !== "queued" &&
    outcome !== "deduplicated" &&
    outcome !== "active_same_request" &&
    outcome !== "active_different_request" &&
    outcome !== "stale_replaced"
  ) {
    throw new Error("enqueue response included an invalid outcome");
  }
  const statusRunRow =
    toRpcRun(rpcResult.status_run) ?? toRpcRun((data as any)?.statusRun);
  const isActiveOutcome =
    outcome === "active_same_request" || outcome === "active_different_request";
  const statusRun = toSafeStatusRun(
    statusRunRow,
    isActiveOutcome
      ? getRunPurposeFallback(statusRunRow, args.responseLocale)
      : requestText
  );
  const blockerRow = toRpcRun(rpcResult.blocking_run);
  const blockerStatusRun = blockerRow
    ? toSafeStatusRun(
        blockerRow,
        getRunPurposeFallback(blockerRow, args.responseLocale)
      )
    : null;
  const replacedRow = toRpcRun(rpcResult.replaced_run);
  const replacedStatusRun = replacedRow
    ? toSafeStatusRun(
        replacedRow,
        getRunPurposeFallback(replacedRow, args.responseLocale)
      )
    : null;
  const same = outcome === "active_same_request";
  const different = outcome === "active_different_request";
  const accepted =
    outcome === "queued" ||
    outcome === "deduplicated" ||
    outcome === "stale_replaced";
  const statusRelation: OpportunityRunMarkerRelation = different
    ? "blocking_other_request"
    : same
      ? "same_request"
      : "accepted";
  const purposeText = normalizePurposeText(requestText, requestText);
  const answerDraft = buildReceipt({
    adjusted: normalizedCount.maxResultsAdjusted,
    blockerPurpose: blockerStatusRun?.purposeText,
    currentApplied: !different,
    deliveryText: deliveryExpectation.userFacingText,
    maxResults: normalizedCount.maxResults,
    originalMaxResults: normalizedCount.originalMaxResults,
    outcome,
    purpose: purposeText,
    responseLocale: args.responseLocale,
    replacedPurpose: replacedStatusRun?.purposeText,
    status: statusRun.status,
  });

  return {
    accepted,
    answerDraft,
    assistantInstruction: [
      "Use answerDraft verbatim as the final user-facing receipt.",
      "Never claim that postings were already searched, found, selected, or saved.",
      "Never say the new request was merged when currentRequestMergedIntoActiveRun is false.",
      "Do not mention internal field names, run IDs, or tool names.",
    ].join(" "),
    ...(blockerStatusRun &&
    (blockerStatusRun.status === "queued" ||
      blockerStatusRun.status === "running")
      ? {
          blockingRun: {
            ageMinutes: ageMinutes(blockerStatusRun.createdAt),
            createdAt: blockerStatusRun.createdAt,
            id: blockerStatusRun.id,
            maxResults: blockerStatusRun.maxResults,
            purposeText: blockerStatusRun.purposeText,
            startedAt: blockerStatusRun.startedAt,
            status: blockerStatusRun.status,
          },
        }
      : {}),
    currentRequestAlreadyRepresented:
      outcome === "deduplicated" || outcome === "active_same_request",
    currentRequestApplied: !different,
    currentRequestMergedIntoActiveRun: false,
    deliveryExpectation,
    lifecycleEffect: {
      directRequestCountsAsStrongReaction: true,
      invocationKind: "direct_user_request",
      preferenceChanged: false,
      reactivationExpected: setting?.status !== "active",
    },
    newRunCreated: outcome === "queued" || outcome === "stale_replaced",
    ok: true,
    outcome,
    ...(replacedStatusRun &&
    (replacedStatusRun.status === "queued" ||
      replacedStatusRun.status === "running")
      ? {
          replacedRun: {
            id: replacedStatusRun.id,
            previousStatus: replacedStatusRun.status,
            purposeText: replacedStatusRun.purposeText,
            terminationReason: "stale_timeout" as const,
          },
        }
      : {}),
    requestedRequest: {
      kind: "bulk",
      maxResults: normalizedCount.maxResults,
      maxResultsAdjusted: normalizedCount.maxResultsAdjusted,
      originalMaxResults: normalizedCount.originalMaxResults,
      purposeText,
      requestText,
      scope: "one_off",
    },
    skipCommonAssistantInstruction: true,
    statusRelation,
    statusRun,
    statusRunId: statusRun.id,
  };
}
