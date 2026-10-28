import { OrgAgentToolInputError } from "./toolAvailability";
import type { OrgAgentAdminClient } from "./data";
export type CompanyMatchingSearchQueueStatus =
  | "already_queued"
  | "already_running"
  | "not_queued"
  | "queued";

export type CompanyMatchingSearchQueueResult = {
  reason: string | null;
  startsAfterCurrentRun: boolean;
  status: CompanyMatchingSearchQueueStatus;
};

type MatchingSearchAdmin = {
  rpc: (
    name: "enqueue_company_matching_search_v1",
    params: {
      p_company_user_id: string;
      p_company_workspace_id: string;
      p_role_id: string;
    }
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function isMatchingSearchAuthorizationRejection(error: unknown) {
  const failure = record(error);
  // Both enqueue RPCs raise this exact error before writing the search queue.
  // Other database/transport failures do not establish whether a write occurred.
  return failure.code === "42501" &&
    failure.message === "company_matching_search_workspace_forbidden";
}

export async function enqueueOrgMatchingSearch(args: {
  admin: MatchingSearchAdmin;
  roleId: string;
  userId: string;
  workspaceId: string;
}): Promise<CompanyMatchingSearchQueueResult> {
  const { data, error } = await args.admin.rpc(
    "enqueue_company_matching_search_v1",
    {
      p_company_user_id: args.userId,
      p_company_workspace_id: args.workspaceId,
      p_role_id: args.roleId,
    }
  );
  if (error) {
    if (isMatchingSearchAuthorizationRejection(error)) {
      return {
        reason: "workspace_forbidden",
        startsAfterCurrentRun: false,
        status: "not_queued",
      };
    }
    throw error;
  }
  const payload = record(data);
  const status = String(payload.status ?? "").trim();
  if (
    status !== "queued" &&
    status !== "already_queued" &&
    status !== "already_running" &&
    status !== "not_queued"
  ) {
    throw new Error("Unexpected company matching search enqueue result");
  }
  return {
    reason: String(payload.reason ?? "").trim() || null,
    startsAfterCurrentRun: payload.startsAfterCurrentRun === true,
    status,
  };
}

const MATCHING_SEARCH_UNAVAILABLE_REASONS: Record<string, string> = {
  workspace_forbidden:
    "현재 계정에는 이 회사·Role의 검색을 요청할 권한이 없어 요청이 거절됐어요. 이번 요청으로 새 검색은 시작되지 않았어요.",
  brief_missing:
    "이 Role에는 아직 검색에 사용할 Hiring Brief가 저장되어 있지 않아요.",
  pending_capacity_reached:
    "이 Role은 현재 연결 대기 인원이 설정된 상한에 도달해 새 검색을 시작하지 않았어요.",
  ready_backlog_reached:
    "아직 회사의 판단을 기다리는 먼저 제안 가능한 후보가 설정된 상한에 도달해 새 검색을 시작하지 않았어요.",
  role_channel_unavailable:
    "이 Role의 검색 결과를 전달할 활성 Slack 채널이 없어 새 검색을 시작하지 않았어요.",
  role_unavailable:
    "이 Role은 현재 채용 중인 상태가 아니어서 새 검색을 시작하지 않았어요.",
  slack_not_connected:
    "이 workspace에 활성 Slack 연결이 없어 새 검색을 시작하지 않았어요.",
  paid_role_required: "이 Role에는 유료 검색 권한이 없어 검색이 시작되지 않았어요.",
  test_role: "테스트 전용 Role에서는 실제 후보자 검색을 시작할 수 없어요.",
};

export function matchingSearchUnavailableReason(reason: string | null | undefined) {
  return MATCHING_SEARCH_UNAVAILABLE_REASONS[reason ?? ""] ?? "현재 상태에서는 이 Role의 새 검색을 시작할 수 없어요.";
}

export async function enqueueOrgAgenticMatchingSearch(args: {
  admin: OrgAgentAdminClient; roleId: string; userId: string; workspaceId: string; requestId: string; sourceMessageId?: number; input: Record<string, unknown>;
}) {
  const { input } = args;
  if (input.sourceRelation !== undefined || input.recommendCounts !== undefined) {
    throw new OrgAgentToolInputError('Scheduled options require server-owned scheduled execution authority');
  }
  const scope = input.scope ?? 'unassessed', startStage = input.startStage ?? 1;
  if (!['unassessed', 'new_members', 'all', 'evaluated'].includes(String(scope)) || typeof startStage !== 'number' || ![1, 2].includes(startStage)) throw new OrgAgentToolInputError('Unknown matching scope or stage');
  const limit = input.limit ?? 5000, recommendCount = input.recommendCount ?? 10;
  if (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 1 || typeof recommendCount !== 'number' || !Number.isSafeInteger(recommendCount) || recommendCount < 0) throw new OrgAgentToolInputError('Invalid search or recommendation count');
  if (input.talentIds !== undefined && (!Array.isArray(input.talentIds) || !input.talentIds.length || !input.talentIds.every(id => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)))) throw new OrgAgentToolInputError('talentIds needs exact identifiers');
  // Search produces evidence. Only an explicit publication command changes cards.
  const options = { scope, startStage, limit, recommendCount: 0, recommendationTarget: recommendCount || 10, ...(args.sourceMessageId !== undefined ? {sourceMessageId:args.sourceMessageId} : {}), ...(input.talentIds ? { talentIds: input.talentIds } : {}), ...(typeof input.reason === 'string' ? { reason: input.reason } : {}) };
  const { data, error } = await (args.admin.rpc as any)('enqueue_company_agentic_search_v1', {
    p_company_workspace_id: args.workspaceId, p_company_user_id: args.userId, p_role_id: args.roleId, p_options: options, p_request_id: args.requestId,
  });
  if (error) {
    if (isMatchingSearchAuthorizationRejection(error)) {
      return { status: 'not_queued', reason: 'workspace_forbidden', options };
    }
    throw error;
  }
  const result = record(data);
  if (!['queued','already_queued','already_running','already_completed','not_queued'].includes(String(result.status))) throw new Error('Unexpected search receipt');
  return { ...result, status: String(result.status), reason: typeof result.reason === "string" ? result.reason : null, options, effect: 'evaluation_only' };
}
