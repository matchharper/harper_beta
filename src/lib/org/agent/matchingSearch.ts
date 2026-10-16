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
    const failure = record(error);
    // This RPC rejects membership before any queue write. Only this verified
    // machine error establishes non-enqueue; transport/unknown errors do not.
    if (
      failure.code === "42501" &&
      failure.message === "company_matching_search_workspace_forbidden"
    ) {
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
    "현재 계정이 이 회사의 팀원으로 등록되어 있지 않아 검색 요청이 거절됐어요. 이번 요청으로 새 검색은 시작되지 않았어요.",
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
  test_role: "테스트 전용 Role에서는 실제 후보자 검색을 시작할 수 없어요.",
};

export function matchingSearchUnavailableReason(reason: string | null | undefined) {
  return MATCHING_SEARCH_UNAVAILABLE_REASONS[reason ?? ""] ?? "현재 상태에서는 이 Role의 새 검색을 시작할 수 없어요.";
}
