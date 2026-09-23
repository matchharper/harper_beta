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
  if (error) throw error;
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
