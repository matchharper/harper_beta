import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { fetchAllTalentContexts } from "@/lib/talentOnboarding/talentContexts";
import { readExternalEvaluationResults } from "./externalEvaluationResults";
import { executeSql } from "@/lib/externalRecommendationsV2/retrieval";
import { sqlLiteral } from "@/lib/talentOnboarding/jobPostingRecommendations";
import { expiredExternalRoleSql } from "@/lib/externalRecommendationsV2/roleSql";

type Owner = { admin: TalentAdminClient; userId: string };
export const matchingTable = (admin: TalentAdminClient, name: string) =>
  admin.from(name as never) as any;
export async function readMatching(
  args: Owner & {
    matchingId: string;
    cursor?: string;
    evaluationCursor?: string;
    runCursor?: string;
    limit?: number;
    runId?: string;
  }
) {
  const { data: matching, error } = await matchingTable(
    args.admin,
    "talent_matchings"
  )
    .select("*")
    .eq("id", args.matchingId)
    .eq("talent_id", args.userId)
    .single();
  if (error) throw new Error(error.message);
  const limit = args.limit ?? 30;
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new Error("Matching page size must be a positive integer.");
  let runsQuery = matchingTable(args.admin, "external_recommendation_runs")
    .select(
      "id,status,created_at,finished_at,candidate_role_ids,evaluation_ids,metrics,error,request,cancelled_at,input_snapshot"
    )
    .eq("talent_id", args.userId)
    .eq("matching_id", args.matchingId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (args.runId) runsQuery = runsQuery.eq("id", args.runId);
  if (args.runCursor) {
    const cursor = await matchingTable(
      args.admin,
      "external_recommendation_runs"
    )
      .select("id,created_at")
      .eq("talent_id", args.userId)
      .eq("matching_id", args.matchingId)
      .eq("id", args.runCursor)
      .single();
    if (cursor.error) throw new Error(cursor.error.message);
    runsQuery = runsQuery.or(
      `created_at.lt.${cursor.data.created_at},and(created_at.eq.${cursor.data.created_at},id.lt.${cursor.data.id})`
    );
  }
  const [members, runs, revision] = await Promise.all([
    executeSql<any>(
      args.admin,
      `
      SELECT m.* FROM public.talent_opportunity_membership_index m
      JOIN public.company_roles role ON role.role_id = m.role_id
      WHERE m.talent_id = ${sqlLiteral(args.userId)}::uuid
        AND m.matching_id = ${sqlLiteral(args.matchingId)}::uuid
        AND (role.source_type IS DISTINCT FROM 'external' OR NOT ${expiredExternalRoleSql("role")})
        ${args.cursor ? `AND m.id > ${sqlLiteral(args.cursor)}::uuid` : ""}
      ORDER BY m.id
    `,
      limit + 1
    ),
    runsQuery,
    args.admin.rpc(
      "career_opportunity_list_revision" as never,
      { p_talent: args.userId, p_matching: args.matchingId } as never
    ),
  ]);
  for (const r of [runs, revision])
    if (r.error) throw new Error(r.error.message);
  const rows = members;
  const evaluations = await readExternalEvaluationResults({
    admin: args.admin,
    userId: args.userId,
    matchingId: args.matchingId,
    runId: args.runId,
    cursor: args.evaluationCursor,
    limit,
  });
  const currentBrief = await fetchAllTalentContexts({
    admin: args.admin,
    userId: args.userId,
    collection: "brief",
  });
  return {
    matching,
    currentBrief: currentBrief.map(({ ref, label, content }) => ({
      ref,
      label,
      content,
    })),
    listRevision: revision.data,
    memberships: rows.slice(0, limit),
    nextCursor: rows.length > limit ? rows[limit - 1].id : null,
    runs: runs.data.slice(0, limit),
    nextRunCursor: runs.data.length > limit ? runs.data[limit - 1].id : null,
    ...evaluations,
  };
}
export async function listMatchings(
  args: Owner & {
    archived?: boolean;
    cursor?: string;
    limit?: number;
    newestFirst?: boolean;
  }
) {
  const limit = args.limit ?? 30;
  let q = matchingTable(args.admin, "talent_matchings")
    .select(
      "id,title,description,revision,archived_at,created_at,updated_at,previous_matching_id"
    )
    .eq("talent_id", args.userId)
    .limit(limit + 1);
  q = args.newestFirst
    ? q
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
    : q.order("id");
  if (args.archived !== undefined)
    q = args.archived
      ? q.not("archived_at", "is", null)
      : q.is("archived_at", null);
  if (args.cursor) {
    if (args.newestFirst) {
      const cursor = await matchingTable(args.admin, "talent_matchings")
        .select("id,created_at")
        .eq("talent_id", args.userId)
        .eq("id", args.cursor)
        .single();
      if (cursor.error) throw new Error(cursor.error.message);
      q = q.or(
        `created_at.lt.${cursor.data.created_at},and(created_at.eq.${cursor.data.created_at},id.lt.${cursor.data.id})`
      );
    } else {
      q = q.gt("id", args.cursor);
    }
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const { data: revision, error: revError } = await args.admin.rpc(
    "career_opportunity_list_revision" as never,
    { p_talent: args.userId, p_all: true } as never
  );
  if (revError) throw new Error(revError.message);
  const baseline = await args.admin.rpc(
    "career_opportunity_list_revision" as never,
    { p_talent: args.userId } as never
  );
  if (baseline.error) throw new Error(baseline.error.message);
  return {
    defaultListRevision: baseline.data,
    matchings: (data ?? []).slice(0, limit),
    nextCursor: data.length > limit ? data[limit - 1].id : null,
    allListsRevision: revision,
  };
}
export async function upsertMatching(
  args: Owner & {
    operationId: string;
    action: string;
    matchingId?: string;
    expectedRevision?: number;
    title?: string;
    description?: string;
    criteria?: unknown;
    previousMatchingId?: string;
  }
) {
  const { admin, userId, operationId, ...command } = args;
  const { data, error } = await admin.rpc(
    "write_career_matching" as never,
    { p_talent: userId, p_operation: operationId, p_command: command } as never
  );
  if (error) throw new Error(error.message);
  const revision = await admin.rpc(
    "career_opportunity_list_revision" as never,
    { p_talent: userId, p_matching: (data as any).id } as never
  );
  if (revision.error) throw new Error(revision.error.message);
  return { matching: data, listRevision: revision.data };
}
export async function upsertOpportunities(
  args: Owner & {
    backgroundRunId?: string;
    operationId: string;
    action: string;
    matchingId?: string;
    allLists?: boolean;
    expectedRevision?: string;
    items?: Array<Record<string, unknown>>;
  }
) {
  const { admin, userId, operationId, ...command } = args;
  if (command.action === "set_stage") {
    const { setOpportunityStages } = await import("./opportunityStages");
    return setOpportunityStages({ admin, userId, items: command.items });
  }
  const { data, error } = await admin.rpc(
    "write_career_opportunities" as never,
    { p_talent: userId, p_operation: operationId, p_command: command } as never
  );
  if (error) throw new Error(error.message);
  return data;
}

export async function readCareerMatchingIndex(args: Owner): Promise<string> {
  const [matches, runs] = await Promise.all([
    matchingTable(args.admin, "talent_matchings")
      .select("id,title,revision")
      .eq("talent_id", args.userId)
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(6),
    matchingTable(args.admin, "external_recommendation_runs")
      .select("id,matching_id,status")
      .eq("talent_id", args.userId)
      .eq("variant", "career_agent")
      .in("status", ["queued", "running", "partial"])
      .order("created_at", { ascending: false })
      .limit(6),
  ]);
  for (const r of [matches, runs])
    if (r.error) throw new Error(r.error.message);
  return [
    "Matching index (recent active entries; use list_matchings/read_matching for further pages):",
    ...(matches.data ?? []).map(
      (m: any) => `- ${m.title}; matching ${m.id}; revision ${m.revision}`
    ),
    ...(runs.data ?? []).map(
      (r: any) =>
        `- Search ${r.id}; ${r.status}; matching ${r.matching_id ?? "company follow"}`
    ),
  ].join("\n");
}

export async function readExternalEvaluation(
  args: Owner & { runId: string; cursor?: string; limit?: number }
) {
  const { data: run, error } = await matchingTable(
    args.admin,
    "external_recommendation_runs"
  )
    .select("*")
    .eq("talent_id", args.userId)
    .eq("id", args.runId)
    .eq("variant", "career_agent")
    .single();
  if (error) throw new Error(error.message);
  const receipt = {
    runId: run.id,
    status: run.status,
    source: "external",
    roleIds: run.candidate_role_ids,
    runs: [run],
    failures: run.metrics?.errors ?? [],
    error: run.error,
  };
  try {
    return { ...receipt, ...(await readExternalEvaluationResults(args)) };
  } catch (error) {
    // The stored evaluation outcome survives a failure to read this page.
    return {
      ...receipt,
      evaluationReadError:
        error instanceof Error ? error.message : String(error),
    };
  }
}
