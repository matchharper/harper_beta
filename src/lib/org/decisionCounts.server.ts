import type { User } from "@supabase/supabase-js";
import type { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { readOrgCandidateSaves } from "./candidateSaved.server";
import { OrgHttpError } from "./httpError";
import {
  countsTowardDecision,
  getOrgInboxCounts,
  type OrgInboxCounts,
} from "./inboxPagination";
import { nextScheduledSearchAt } from "./introSearchSchedule";
import { readPendingConnections } from "./pendingConnections.server";
import { fetchOrgBoard } from "./server";

type Admin = ReturnType<typeof getSupabaseAdmin>;

/** One Role's decision numbers, from the inbox rule (getOrgInboxCounts). */
export type OrgRoleDecisionRead = {
  counts: OrgInboxCounts;
  /** When the longest-waiting counted candidate started waiting. */
  oldestWaitingSince: string | null;
  /** The people behind the two decision numbers (server use: names on the To-do). */
  waiting: Array<{ talentId: string; since: string | null }>;
  toRequest: Array<{ talentId: string; at: string | null }>;
};

function emptyRead(): OrgRoleDecisionRead {
  return {
    counts: getOrgInboxCounts([]),
    oldestWaitingSince: null,
    waiting: [],
    toRequest: [],
  };
}

/**
 * The workspace owner, for readers that act for the company with no person
 * (Slack summaries, email). Same choice as the proactive review.
 */
export async function readWorkspaceOwnerUser(
  admin: Admin,
  workspaceId: string
): Promise<User | null> {
  const { data: owner, error } = await (
    admin.from("company_user_workspace") as any
  )
    .select("company_user_id,authority")
    .eq("company_workspace_id", workspaceId)
    .eq("authority", "owner")
    .order("created_at")
    .order("id")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (owner?.authority !== "owner") return null;
  const auth = await admin.auth.admin.getUserById(owner.company_user_id);
  if (auth.error) throw auth.error;
  return auth.data.user ?? null;
}

/**
 * Waiting, to request, saved and reviewing for each Role, read through the
 * board so every surface counts the same people: team access, deleted
 * profiles, test-only Roles and saved candidates are handled once, there.
 * With no user, the workspace owner reads. Roles the reader cannot see, or
 * a workspace with no owner, come back as zeros.
 */
export async function readOrgDecisionCounts(args: {
  admin: Admin;
  user: User | null;
  workspaceId: string;
  roleIds: string[];
}): Promise<Map<string, OrgRoleDecisionRead>> {
  const roleIds = [...new Set(args.roleIds.filter(Boolean))];
  const result = new Map(roleIds.map((id) => [id, emptyRead()] as const));
  if (!roleIds.length) return result;
  const user =
    args.user ?? (await readWorkspaceOwnerUser(args.admin, args.workspaceId));
  if (!user) return result;

  let board: Awaited<ReturnType<typeof fetchOrgBoard>>;
  try {
    board = await fetchOrgBoard({
      admin: args.admin,
      countReviewing: true,
      includeInternalStages: false,
      includeProfileLabels: false,
      lean: true,
      roleId: roleIds.length === 1 ? roleIds[0] : null,
      user,
      workspaceId: args.workspaceId,
    });
  } catch (error) {
    // One Role the reader cannot see: nothing to count.
    if (error instanceof OrgHttpError && error.status === 404) return result;
    throw error;
  }
  const items = (
    await readOrgCandidateSaves(args.admin, args.workspaceId, board.items)
  ).filter((item) => result.has(item.roleId));
  const pending = await readPendingConnections(args.admin, roleIds);

  for (const roleId of roleIds) {
    const roleItems = items.filter((item) => item.roleId === roleId);
    const waiting = roleItems
      .filter((item) => countsTowardDecision(item, "pending_connection"))
      .map((item) => ({
        talentId: item.talentId,
        since: pending.sinceByPair.get(`${roleId}:${item.talentId}`) ?? null,
      }))
      .sort((left, right) =>
        String(left.since ?? "~").localeCompare(String(right.since ?? "~"))
      );
    const toRequest = roleItems
      .filter((item) => countsTowardDecision(item, "company_intro"))
      .map((item) => ({
        talentId: item.talentId,
        at: item.companyPresentedAt ?? item.recommendedAt ?? null,
      }))
      .sort((left, right) =>
        String(right.at ?? "").localeCompare(String(left.at ?? ""))
      );
    result.set(roleId, {
      counts: getOrgInboxCounts(
        roleItems,
        board.reviewingCountByRoleId?.[roleId] ?? 0
      ),
      oldestWaitingSince: waiting.find((row) => row.since)?.since ?? null,
      waiting,
      toRequest,
    });
  }
  return result;
}

type ScheduledSearchRow = {
  role_id: string;
  eligible: boolean;
  days: string[] | null;
  hour: number | null;
};

/**
 * The next scheduled search per Role, by the worker's rule
 * (company_role_scheduled_search_v1). null: no scheduled search. A Role
 * missing from the map could not be read; say nothing about it.
 */
export async function readNextScheduledSearches(args: {
  admin: Admin;
  roleIds: string[];
  now: Date;
}): Promise<Map<string, string | null>> {
  const next = new Map<string, string | null>();
  const roleIds = [...new Set(args.roleIds.filter(Boolean))];
  if (!roleIds.length) return next;
  const { data, error } = await (args.admin.rpc as any)(
    "company_role_scheduled_search_v1",
    { p_role_ids: roleIds }
  );
  if (error) {
    // The To-do and chat still work without it; nothing is shown instead.
    console.warn("[org/scheduled-search] unavailable", {
      code: error.code ?? "unknown",
    });
    return next;
  }
  for (const row of (data ?? []) as ScheduledSearchRow[]) {
    next.set(
      String(row.role_id),
      row.eligible
        ? nextScheduledSearchAt({ days: row.days, hour: row.hour, now: args.now })
        : null
    );
  }
  return next;
}
