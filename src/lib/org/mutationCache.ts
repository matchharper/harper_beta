import type { Query, QueryClient } from "@tanstack/react-query";
import { getOrgCompanyIntroBoardStage } from "./pipelineStage";
import type {
  OrgBoardItem,
  OrgBoardResponse,
  OrgBootstrapResponse,
  OrgCompanyIntroMutationResponse,
  OrgRole,
  OrgTalentDetailResponse,
} from "./server";

// Profile-label queries have a different shape and do not change with a decision.
export function orgBoardMatches(
  query: Query,
  workspaceId: string,
  roleId?: string
) {
  const key = query.queryKey;
  return (
    key[0] === "org" &&
    key[1] === "board" &&
    key[2] === workspaceId &&
    (!roleId || !key[3] || key[3] === roleId)
  );
}

export function orgDetailMatches(
  query: Query,
  workspaceId: string,
  roleId?: string,
  talentId?: string
) {
  const key = query.queryKey;
  const data = query.state.data as OrgTalentDetailResponse | undefined;
  return (
    key[0] === "org" &&
    key[1] === "detail" &&
    key[2] === workspaceId &&
    (!roleId || key[3] === roleId || data?.role.roleId === roleId) &&
    (!talentId || key[4] === talentId)
  );
}

export function orgBootstrapMatches(query: Query, workspaceId: string) {
  return (
    query.queryKey[0] === "org" &&
    query.queryKey[1] === "bootstrap" &&
    (query.queryKey[2] === workspaceId ||
      (query.state.data as OrgBootstrapResponse | undefined)?.workspace
        ?.workspaceId === workspaceId)
  );
}

export function orgBillingMatches(query: Query, workspaceId: string) {
  return (
    query.queryKey[0] === "org" &&
    query.queryKey[1] === "billing" &&
    query.queryKey[3] === workspaceId
  );
}

export async function reconcileOrgCandidateSave(
  client: QueryClient,
  input: { workspaceId: string; roleId: string; recommendationId: string },
  savedAt: string | null
) {
  const board = {
    predicate: (query: Query) =>
      orgBoardMatches(query, input.workspaceId, input.roleId),
  };
  await client.cancelQueries(board);
  client.setQueriesData<OrgBoardResponse>(board, (current) =>
    current
      ? {
          ...current,
          items: current.items.map((item) =>
            item.roleId === input.roleId &&
            item.recommendationId === input.recommendationId
              ? { ...item, savedAt }
              : item
          ),
        }
      : current
  );
  void client.invalidateQueries(board);
}

export async function reconcileOrgRole(
  client: QueryClient,
  role: OrgRole,
  isExpired?: boolean | null
) {
  const bootstrap = {
    predicate: (query: Query) => orgBootstrapMatches(query, role.workspaceId),
  };
  const board = {
    predicate: (query: Query) =>
      orgBoardMatches(query, role.workspaceId, role.roleId),
  };
  const detail = {
    predicate: (query: Query) =>
      orgDetailMatches(query, role.workspaceId, role.roleId),
  };
  // Discard reads started before the write, including inactive aliases.
  await Promise.all([
    client.cancelQueries(bootstrap),
    client.cancelQueries(board),
    client.cancelQueries(detail),
  ]);
  const removed = isExpired === true || role.status === "deleted";
  const merge = (old: OrgRole) => ({
    ...old,
    ...role,
    memory: old.memory,
    memoryUpdatedAt: old.memoryUpdatedAt,
    lastConversationAt: old.lastConversationAt,
  });
  client.setQueriesData<OrgBootstrapResponse>(bootstrap, (current) =>
    current
      ? {
          ...current,
          roles: removed
            ? current.roles.filter((item) => item.roleId !== role.roleId)
            : current.roles.map((item) =>
                item.roleId === role.roleId ? merge(item) : item
              ),
          teamRoles: current.teamRoles?.map((item) =>
            item.roleId === role.roleId
              ? { ...item, name: role.name, teamId: role.teamId }
              : item
          ),
        }
      : current
  );
  client.setQueriesData<OrgBoardResponse>(board, (current) =>
    current
      ? {
          ...current,
          items: removed
            ? current.items.filter((item) => item.roleId !== role.roleId)
            : current.items.map((item) =>
                item.roleId === role.roleId
                  ? { ...item, roleName: role.name }
                  : item
              ),
          totalCount: removed
            ? current.items.filter((item) => item.roleId !== role.roleId).length
            : current.totalCount,
        }
      : current
  );
  client.setQueriesData<OrgTalentDetailResponse>(detail, (current) =>
    current ? { ...current, role: merge(current.role) } : current
  );
  // Completion is the confirmed write; dependent server projections refresh separately.
  void client.invalidateQueries(bootstrap);
  void client.invalidateQueries(board);
  void client.invalidateQueries(detail);
}

export async function reconcileOrgCompanyIntro(
  client: QueryClient,
  workspaceId: string,
  result: OrgCompanyIntroMutationResponse
) {
  const update = result.candidateUpdate;
  const board = {
    predicate: (query: Query) =>
      orgBoardMatches(query, workspaceId, update?.roleId),
  };
  const detail = {
    predicate: (query: Query) =>
      orgDetailMatches(query, workspaceId, update?.roleId, update?.talentId),
  };
  void client.invalidateQueries({
    predicate: (query) => orgBillingMatches(query, workspaceId),
  });
  // A connected/replaced Intro needs the canonical recommendation and its permissions.
  // Older servers also lack this projection; wait for an authoritative read in that case.
  if (!update) {
    await Promise.all([
      client.invalidateQueries(board),
      client.invalidateQueries(detail),
    ]);
    return;
  }
  await Promise.all([
    client.cancelQueries(board),
    client.cancelQueries(detail),
  ]);
  const stage = getOrgCompanyIntroBoardStage(update.status);
  const mergeIntro = (intro: NonNullable<OrgBoardItem["companyIntro"]>) => ({
    ...intro,
    status: update.status,
    requestedAt: update.requestedAt,
    candidateSentAt: update.candidateSentAt,
    talentDecisionAt: update.talentDecisionAt,
    closeReason: update.closeReason,
    companyAppeal: update.companyAppeal,
    nextStageId: update.nextStageId,
  });
  const capabilities = (old: OrgBoardItem["capabilities"]) => ({
    ...old,
    pass: old.pass && update.status === "ready",
    requestIntro: old.requestIntro && update.status === "ready",
  });
  client.setQueriesData<OrgBoardResponse>(board, (current) =>
    current
      ? {
          ...current,
          items: current.items.map((item) =>
            item.companyIntro?.id === result.introCandidateId
              ? {
                  ...item,
                  companyIntro: mergeIntro(item.companyIntro),
                  savedAt: item.stage === stage ? item.savedAt : null,
                  stage,
                  stageTag: null,
                  capabilities: capabilities(item.capabilities),
                  updatedAt: update.updatedAt,
                }
              : item
          ),
        }
      : current
  );
  client.setQueriesData<OrgTalentDetailResponse>(detail, (current) =>
    current?.companyIntro?.id === result.introCandidateId
      ? {
          ...current,
          companyIntro: mergeIntro(current.companyIntro),
          capabilities: capabilities(current.capabilities),
          recommendation: { ...current.recommendation, stage },
        }
      : current
  );
  void client.invalidateQueries(board);
  void client.invalidateQueries(detail);
}
