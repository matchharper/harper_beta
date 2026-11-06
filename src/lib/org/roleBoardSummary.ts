import type {
  OrgBoardItem,
  OrgBoardResponse,
  OrgRole,
  OrgStage,
} from "./server";
import { getOrgInboxCountsByRole } from "./inboxPagination";

export function getRoleStageLabel(stage: OrgStage, role: OrgRole) {
  const prefix = `${role.name} · `;
  return stage.label.startsWith(prefix)
    ? stage.label.slice(prefix.length)
    : stage.label;
}

export function buildRoleStages(
  board: OrgBoardResponse | null | undefined,
  role: OrgRole
) {
  const stages = board?.stages ?? [];
  const accepted = stages.find((stage) => stage.id === "accepted");
  const pending = stages.find((stage) => stage.id === "pending_connection");
  const connected = stages.find((stage) => stage.id === "connected");
  const customStages = stages.filter((stage) => stage.roleId === role.roleId);
  const finalOffer = stages.find((stage) => stage.id === "final_offer");
  const stopped = stages.find((stage) => stage.id === "process_stopped");
  const archived = stages.find((stage) => stage.id === "archived");

  return [
    accepted,
    pending,
    connected,
    ...customStages,
    finalOffer,
    stopped,
    archived,
  ].filter((stage): stage is OrgStage => Boolean(stage));
}

export function buildCounts(items: OrgBoardItem[]) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = `${item.roleId}:${item.stage}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * The company roles overview: stage counts as in buildCounts, except the two
 * decision lists, which follow the inbox rule (getOrgInboxCounts).
 */
export function buildRoleOverviewCounts(items: OrgBoardItem[]) {
  const counts = buildCounts(items);
  for (const [roleId, roleCounts] of Object.entries(
    getOrgInboxCountsByRole(items)
  )) {
    counts.set(`${roleId}:pending_connection`, roleCounts.pending_connection);
    counts.set(`${roleId}:company_intro`, roleCounts.company_intro);
  }
  return counts;
}
