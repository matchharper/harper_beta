import { readCompanyFacts, formatCompanyFacts, embedHint, directionHint } from "@/lib/career/companies/discovery";
import { formatCompanyPersonalContext, readCompanyPersonalContext, type CompanyPersonalContext } from "@/lib/career/companies/personalContext";
import { formatCompanySignals, readCompanySignals, type CompanySignals } from "@/lib/career/companies/signals";
import {
  chooseCompaniesToFill,
  needsInformation,
  prepareCompanies,
  retrievalRanks,
  scoreRanks,
  TOP_COMPANY_FILL_BUDGET_MS,
} from "@/lib/career/companies/fill";
import { parseExternalSearchPlan } from "./searchPlan";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { send } from "@vercel/queue";
import { z } from "zod";
import {
  getTalentSupabaseAdmin,
  type TalentAdminClient,
} from "@/lib/talentOnboarding/admin";
import {
  roleCard,
  attachCompanyContextToCards,
  sqlLiteral,
} from "@/lib/talentOnboarding/jobPostingRecommendations";
import {
  loadExternalContext,
  loadExternalSearchAccess,
} from "@/lib/externalRecommendationsV2/context";
import { readProfileSnapshot } from "@/lib/career/profiles/store";
import {
  buildScoringInput,
  buildScoringInputParts,
  v2PromptCandidate,
} from "@/lib/externalRecommendationsV2/scoringInput";
import { callDecisions } from "@/lib/externalRecommendationsV2/decisions";
import { fillExternalRoleSalaries } from "@/lib/externalRecommendationsV2/salaryEstimation.server";
import {
  cachedFitEligible,
  chunks,
  evaluatorKey,
  fitProvider,
  fingerprint,
  mapConcurrent,
  rankScore,
} from "@/lib/externalRecommendationsV2/contract";
import {
  retrieveRoles,
  executeSql,
  eligibilitySql,
  ROLE_SELECT,
  ROLE_JOINS,
} from "@/lib/externalRecommendationsV2/retrieval";
import type { V2SearchPlan } from "@/lib/externalRecommendationsV2/countries";
import { ownSubmittedRoleSql } from "@/lib/externalRecommendationsV2/roleSql";
import { companyWorkspaceFilterSql, companyWorkspaceIdsSchema } from "@/lib/externalRecommendationsV2/indexedTitleSearch";
import { matchingTable, readExternalEvaluation } from "./store";
import { EXTERNAL_EVALUATION_PAGE_SIZE, readExternalEvaluationResults } from "./externalEvaluationResults";
import { scheduleCareerDevelopmentJob } from "../developmentQueue.server";
import { formatCompanyOverview, readCompanyProjections, readRoleCompanyList } from "../resources/companyData";
import { throwIfToolControlError } from "@/lib/llm/toolError";
import { expiredExternalRoleSql } from "@/lib/externalRecommendationsV2/roleSql";

type CompanyOpportunityRow = Record<string, any> & {
  company_workspace_id: string;
  open_role_count: number;
  open_role_titles: string[] | null;
};
/** Company opportunities use the same company columns as Role cards. Only public
 * external Roles describe current openings; anonymous internal Roles stay private. */
async function readCompanyOpportunityRows(admin: TalentAdminClient, userId: string, ids: string[]) {
  const valid = [...new Set(companyWorkspaceIdsSchema.parse(ids))];
  const open = `r.company_workspace_id=cw.company_workspace_id AND r.source_type='external'
    AND NOT ${expiredExternalRoleSql("r")} AND lower(coalesce(r.information->>'testOnly','false'))<>'true'`;
  return executeSql<CompanyOpportunityRow>(admin, `
    SELECT cw.company_workspace_id::text, cw.company_name, cw.company_description, cw.test_score AS company_test_score,
      cd.name AS company_db_name, cd.description AS company_db_description, cd.short_description AS company_db_short_description,
      cd.location AS company_db_location, cd.founded_year AS company_db_founded_year, cd.employee_count_range AS company_db_employee_count_range,
      (SELECT count(*) FROM public.company_roles r WHERE ${open})::int AS open_role_count,
      (SELECT array_agg(name) FROM (SELECT r.name FROM public.company_roles r WHERE ${open}
        ORDER BY r.posted_at DESC NULLS LAST, r.role_id LIMIT 20) recent) AS open_role_titles
    FROM public.company_workspace cw LEFT JOIN public.company_db cd ON cd.id=cw.company_db_id
    WHERE cw.company_workspace_id = ANY(ARRAY[${valid.map(id => `${sqlLiteral(id)}::uuid`).join(",")}])
      AND NOT COALESCE(cw.is_internal, false)
      AND NOT public.career_company_blocked_v1(${sqlLiteral(userId)}::uuid, cw.company_workspace_id)
    ORDER BY array_position(ARRAY[${valid.map(id => `${sqlLiteral(id)}::uuid`).join(",")}], cw.company_workspace_id)`, valid.length);
}
async function readCompanyWorkspaceList(context: { admin: TalentAdminClient; userId: string }, ids: string[]) {
  try {
    return { projections: await readCompanyProjections(context, ids.map(id => ({ kind: "company_workspace", id })), { mode: "list" }), unavailable: false };
  } catch (error) {
    throwIfToolControlError(error);
    return { projections: new Map(), unavailable: true };
  }
}

type EvaluationKey = { role_id?: string | null; company_workspace_id?: string | null; input_fingerprint: string };
type EvaluationRef = EvaluationKey & { id: string };
/** The option an evaluation judges: a Role, or a company itself. */
const optionOf = (row: { role_id?: string | null; company_workspace_id?: string | null }) =>
  row.role_id ? `role:${row.role_id}` : `company:${row.company_workspace_id}`;
const evaluationKey = (row: EvaluationKey) => `${optionOf(row)}:${row.input_fingerprint}`;

/** Weighted score of each option's evaluation in this run. */
async function readEvaluationScores(admin: TalentAdminClient, userId: string, idOf: ReadonlyMap<string, string>) {
  const optionOfId = new Map([...idOf].map(([option, id]) => [id, option]));
  const scores = new Map<string, number>();
  for (const part of chunks([...optionOfId.keys()], 100)) {
    const { data, error } = await matchingTable(admin, "talent_external_evaluations")
      .select("id,assessment").eq("talent_id", userId).in("id", part);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as { id: string; assessment?: { fit?: unknown } }[]) {
      try {
        const score = rankScore((row.assessment?.fit ?? row.assessment) as Parameters<typeof rankScore>[0]);
        if (Number.isFinite(score)) scores.set(optionOfId.get(row.id)!, score);
      } catch { /* An evaluation without a score has no rank. */ }
    }
  }
  return scores;
}
/** Opportunity kinds share one Decisions rubric and evaluation store. */
export const opportunityKinds = ["postings", "hiring_posts", "companies"] as const;
export type OpportunityKind = (typeof opportunityKinds)[number];
const DEFAULT_KINDS: OpportunityKind[] = ["postings", "hiring_posts"];
const COMPANY_KEY_PREFIX = "company:";
const companyKey = (workspaceId: string) => COMPANY_KEY_PREFIX + workspaceId;

async function readCachedEvaluations(
  admin: TalentAdminClient,
  userId: string,
  keys: EvaluationKey[],
  signal?: AbortSignal
) {
  const found = new Map<string, EvaluationRef>();
  // Use the existing SQL RPC's 500-row page size. A POST body avoids large
  // PostgREST filter URLs and matches exact indexed owner/role/fingerprint keys.
  for (const part of chunks(keys, 500)) {
    signal?.throwIfAborted();
    const rows = await executeSql<EvaluationRef>(
      admin,
      `
      SELECT e.id::text, e.role_id::text, e.company_workspace_id::text, e.input_fingerprint
      FROM jsonb_to_recordset(${sqlLiteral(JSON.stringify(part))}::jsonb)
        AS requested(role_id uuid, company_workspace_id uuid, input_fingerprint text)
      JOIN public.talent_external_evaluations e
        ON (e.role_id = requested.role_id OR e.company_workspace_id = requested.company_workspace_id)
        AND e.input_fingerprint = requested.input_fingerprint
      WHERE e.talent_id = ${sqlLiteral(userId)}::uuid
    `,
      part.length
    );
    for (const row of rows) found.set(evaluationKey(row), row);
  }
  return found;
}

export const CAREER_MATCHING_TOPIC = "career-matching-search-v1";
export type ExternalSearchRequest = {
  admin: TalentAdminClient;
  userId: string;
  conversationId?: string;
  replyId?: string;
  operationId: string;
  matchingId?: string;
  roleIds?: string[];
  companyWorkspaceIds?: string[];
  /** Companies to evaluate as opportunities themselves, found by description, similarity or name. */
  companyCandidateIds?: string[];
  /** The routes that produced each company candidate, kept for the matching's pool. */
  angles?: Record<string, string[]>;
  /** What a company search was after, used to pick each company's closest open roles. */
  titleHint?: string;
  kinds?: OpportunityKind[];
  plan?: V2SearchPlan;
  evaluationLimit?: number;
  profileId?: string;
  profileRevision?: number;
  sourceEvents?: unknown[];
  preparationRunId?: string;
  locale?: string;
  targetSalaryKrw?: number;
  signal?: AbortSignal;
  deadlineAt?: number;
};
export async function publishCareerMatchingSearch(runId: string, kind?: "internal_evaluation") {
  const job = { runId, ...(kind ? { kind } : {}) };
  if (
    scheduleCareerDevelopmentJob(`career-matching:${runId}`, () =>
      processCareerMatchingSearch(job)
    )
  )
    return;
  await send(CAREER_MATCHING_TOPIC, job, {
    idempotencyKey: `matching:${runId}:${randomUUID()}`,
    retentionSeconds: 86400,
  });
}
/** Dispatch only; the import transaction has already committed the scoring runs. */
export async function publishImportedPostingEvaluations(
  admin: TalentAdminClient, userId: string, recommendationIds: string[],
) {
  const { data, error } = await matchingTable(admin, "external_recommendation_runs")
    .select("id").eq("talent_id", userId).eq("surface", "import").eq("status", "queued")
    .in("operation_id", recommendationIds.map(id => `job-posting:${id}`));
  if (error) throw new Error(error.message);
  await Promise.all((data ?? []).map((run: { id: string }) => publishCareerMatchingSearch(run.id)));
}

export async function requestExternalMatchingSearch(
  args: ExternalSearchRequest
) {
  args.signal?.throwIfAborted();
  const companyWorkspaceIds = args.companyWorkspaceIds === undefined || (Array.isArray(args.companyWorkspaceIds) && args.companyWorkspaceIds.length === 0)
    ? undefined
    : [...new Set(companyWorkspaceIdsSchema.parse(args.companyWorkspaceIds))];
  const db = matchingTable(args.admin, "external_recommendation_runs");
  const existing = await db
    .select("*")
    .eq("talent_id", args.userId)
    .eq("operation_id", args.operationId)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) {
    return executeRequestedSearch(args, existing.data);
  }
  const companyCandidateIds = args.companyCandidateIds?.length
    ? [...new Set(companyWorkspaceIdsSchema.parse(args.companyCandidateIds))].slice(0, 300) : undefined;
  const kinds = args.kinds?.length || companyCandidateIds
    ? [...new Set(z.array(z.enum(opportunityKinds)).parse([...(args.kinds ?? []), ...(companyCandidateIds ? ["companies"] : [])]))]
    : undefined;
  const exactCompanies = Boolean(kinds?.includes("companies") && (companyWorkspaceIds?.length || companyCandidateIds));
  if (!args.roleIds?.length && !args.plan && !exactCompanies)
    throw new Error("Provide a retrieval plan, exact role IDs, or companies to evaluate.");
  const plan = args.plan === undefined ? undefined : parseExternalSearchPlan(args.plan);
  const limit = args.evaluationLimit ?? (args.roleIds?.length || (!plan && exactCompanies
    ? (companyCandidateIds ?? companyWorkspaceIds!).length : 600));
  // One retrieval returns at most 1200 rows.
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    (!args.roleIds?.length && limit > 1200)
  )
    throw new Error(
      "Evaluation limit must be 1–1200; continue with another search for more."
    );
  const [loaded, profile, m] = await Promise.all([
    loadExternalContext(args.admin, args.userId),
    readProfileSnapshot({
      admin: args.admin,
      userId: args.userId,
      profileId: args.profileId,
      revision: args.profileRevision,
    }),
    args.matchingId
      ? matchingTable(args.admin, "talent_matchings")
          .select("*")
          .eq("id", args.matchingId)
          .eq("talent_id", args.userId)
          .single()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (m.error) throw new Error(m.error.message);
  if (args.sourceEvents?.length && !loaded.externalEnabled)
    throw new Error("Automatic external recommendations disabled.");
  const snapshot = profile.snapshot;
  const criteria = m.data?.criteria ?? { brief: loaded.context.search_brief };
  const input = {
    ...loaded.context,
    profile: {
      ...snapshot.talentUser,
      experiences: snapshot.talentExperiences,
      educations: snapshot.talentEducations,
      extras: snapshot.talentExtras,
    },
    search_brief: criteria.brief ?? criteria.searchBrief ?? criteria,
    matching_scope: criteria.scope ?? null,
  };
  const request = {
    roleIds: args.roleIds,
    companyWorkspaceIds,
    ...(companyCandidateIds ? { companyCandidateIds, angles: args.angles } : {}),
    ...(args.titleHint ? { titleHint: args.titleHint.slice(0, 500) } : {}),
    kinds,
    plan,
    evaluationLimit: limit,
    replyId: args.replyId,
    profileId: profile.profileId,
    profileRevision: profile.revision,
    sourceEvents: args.sourceEvents,
    preparationRunId: args.preparationRunId,
    targetSalaryKrw: args.targetSalaryKrw,
  };
  const { data, error } = await db
    .insert({
      talent_id: args.userId,
      experiment: "career-agent-search",
      variant: "career_agent",
      surface: args.sourceEvents?.length ? "follow" : "search",
      status: "queued",
      // Use the stored Behavior snapshot; a direct search never refreshes it.
      context_ready_at: new Date().toISOString(),
      matching_id: args.matchingId ?? null,
      operation_id: args.operationId,
      conversation_id: args.conversationId ?? null,
      locale: args.locale ?? "ko",
      provider: fitProvider(),
      request,
      input_snapshot: input,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") {
      const retry = await db
        .select("*")
        .eq("talent_id", args.userId)
        .eq("operation_id", args.operationId)
        .single();
      if (retry.error) throw new Error(retry.error.message);
      return executeRequestedSearch(args, retry.data);
    }
    throw new Error(error.message);
  }
  return executeRequestedSearch(args, data);
}

async function executeRequestedSearch(
  args: {
    admin: TalentAdminClient;
    userId: string;
    signal?: AbortSignal;
    deadlineAt?: number;
  },
  run: any
) {
  // Follow discovery and imported recommendations are evaluated in the queue.
  // Direct search calls return evaluation evidence in the same tool result.
  if (run.request?.sourceEvents?.length || run.request?.preparationRunId || run.surface === "import") {
    if (run.status === "queued") await publishCareerMatchingSearch(run.id);
    return searchReceipt(run);
  }
  while (["queued", "running"].includes(run.status)) {
    args.signal?.throwIfAborted();
    if (args.deadlineAt !== undefined && Date.now() >= args.deadlineAt) break;
    if (
      run.status === "queued" ||
      !run.lease_expires_at ||
      new Date(run.lease_expires_at).getTime() <= Date.now()
    ) {
      await executeCareerMatchingSearch(
        { runId: run.id },
        {
          admin: args.admin,
          signal: args.signal,
          deadlineAt: args.deadlineAt,
          notifyCompletion: false,
        }
      );
    } else {
      // A concurrent retry joins the existing execution instead of evaluating twice.
      await delay(250, undefined, { signal: args.signal });
    }
    const current = await matchingTable(
      args.admin,
      "external_recommendation_runs"
    )
      .select("*")
      .eq("id", run.id)
      .eq("talent_id", args.userId)
      .single();
    if (current.error) throw new Error(current.error.message);
    run = current.data;
  }
  args.signal?.throwIfAborted();
  return readExternalEvaluation({
    ...args,
    runId: run.id,
  });
}
function searchReceipt(run: any) {
  return {
    runId: run.id,
    matchingId: run.matching_id ?? undefined,
    status: run.status,
    source: "external",
    roleIds: run.request?.roleIds ?? run.candidate_role_ids,
    companyWorkspaceIds: run.candidate_company_workspace_ids?.length ? run.candidate_company_workspace_ids : undefined,
    careerContinuation: ["queued", "running"].includes(run.status)
      ? { kind: "external_evaluation", id: run.id }
      : undefined,
  };
}
export async function controlExternalMatchingSearch(args: {
  admin: TalentAdminClient;
  userId: string;
  runId: string;
  action: "resume" | "cancel";
  signal?: AbortSignal;
  deadlineAt?: number;
}) {
  const db = matchingTable(args.admin, "external_recommendation_runs");
  const { data: r, error } = await db
    .select("*")
    .eq("id", args.runId)
    .eq("talent_id", args.userId)
    .eq("variant", "career_agent")
    .single();
  if (error) throw new Error(error.message);
  if (args.action === "cancel") {
    const { error: e } = await db
      .update({ cancelled_at: new Date().toISOString(), status: "cancelled" })
      .eq("id", r.id);
    if (e) throw new Error(e.message);
    return searchReceipt({ ...r, status: "cancelled" });
  }
  if (
    r.status === "running" &&
    new Date(r.lease_expires_at).getTime() > Date.now()
  )
    return executeRequestedSearch(args, r);
  const { error: e } = await db
    .update({
      status: "queued",
      cancelled_at: null,
      lease_token: null,
      lease_expires_at: null,
      error: null,
      finished_at: null,
      completion_notified_at: null,
    })
    .eq("id", r.id);
  if (e) throw new Error(e.message);
  return executeRequestedSearch(args, {
    ...r,
    status: "queued",
    lease_expires_at: null,
  });
}
export async function processCareerMatchingSearch(message: unknown) {
  if ((message as { kind?: string })?.kind === "internal_evaluation") {
    const { runId } = z.object({ runId: z.string().uuid() }).parse(message);
    const { executeInternalEvaluation } = await import("./internalScoring/runtime");
    return executeInternalEvaluation(runId);
  }
  return executeCareerMatchingSearch(message);
}

async function executeCareerMatchingSearch(
  message: unknown,
  options: {
    admin?: TalentAdminClient;
    signal?: AbortSignal;
    deadlineAt?: number;
    notifyCompletion?: boolean;
  } = {}
) {
  const { runId } = z.object({ runId: z.string().uuid() }).parse(message);
  const admin = options.admin ?? getTalentSupabaseAdmin(),
    token = randomUUID(),
    db = matchingTable(admin, "external_recommendation_runs");
  const deadlineSignal =
    options.deadlineAt === undefined
      ? undefined
      : AbortSignal.timeout(Math.max(1, options.deadlineAt - Date.now()));
  const signals = [options.signal, deadlineSignal].filter(
    (s): s is AbortSignal => Boolean(s)
  );
  const signal = signals.length > 1 ? AbortSignal.any(signals) : signals[0];
  // Queue workers prepare import context after claiming the run. Also unblock
  // old context-preparation requests, reusing their existing snapshot.
  const ready = await db
    .update({ context_ready_at: new Date().toISOString() })
    .eq("id", runId)
    .eq("status", "queued")
    .is("context_ready_at", null);
  if (ready.error) throw new Error(ready.error.message);
  const claimed = await admin.rpc(
    "claim_career_external_search" as never,
    { p_id: runId, p_token: token } as never
  );
  if (claimed.error) throw new Error(claimed.error.message);
  const run: any = claimed.data;
  if (!run) {
    const existing = await db.select("*").eq("id", runId).single();
    if (existing.error) throw new Error(existing.error.message);
    if (options.notifyCompletion === false) return;
    if (["queued", "running"].includes(existing.data.status))
      throw new Error(
        "Search is already running; retry after its lease or completion."
      );
    if (!existing.data.completion_notified_at)
      await completeExternalSearch(admin, existing.data);
    return;
  }
  const start = Date.now(),
    request = run.request ?? {},
    provider = run.provider ?? fitProvider();
  let context = run.input_snapshot;
  const metrics: any = {
    ...(run.metrics ?? {}),
    batches: [],
    errors: [],
    reused: 0,
    retryable: false,
  };
  const ids = new Set<string>(run.evaluation_ids ?? []);
  const update = async (patch: Record<string, unknown>) => {
    const r = await db
      .update(patch)
      .eq("id", runId)
      .eq("lease_token", token)
      .select("id")
      .maybeSingle();
    if (r.error) throw new Error(r.error.message);
    if (!r.data)
      throw new Error("Search lease changed; this executor cannot write.");
  };
  const alive = async () => {
    if (signal?.aborted) return false;
    const r = await db
      .select("cancelled_at,lease_token")
      .eq("id", runId)
      .single();
    if (r.error) throw new Error(r.error.message);
    return !r.data.cancelled_at && r.data.lease_token === token;
  };
  try {
    signal?.throwIfAborted();
    if (run.surface === "import" && !context) {
      const [loaded, profile] = await Promise.all([
        loadExternalContext(admin, run.talent_id),
        readProfileSnapshot({ admin, userId: run.talent_id }),
      ]);
      const snapshot = profile.snapshot;
      context = {
        ...loaded.context,
        profile: {
          ...snapshot.talentUser,
          experiences: snapshot.talentExperiences,
          educations: snapshot.talentEducations,
          extras: snapshot.talentExtras,
        },
      };
      request.profileId = profile.profileId;
      request.profileRevision = profile.revision;
      await update({ input_snapshot: context, request, provider });
    }
    const loaded = await loadExternalSearchAccess(admin, run.talent_id);
    let requested = run.candidate_role_ids?.length
      ? run.candidate_role_ids
      : request.roleIds;
    if (request.sourceEvents?.length) {
      const sourceIds = request.sourceEvents.map((e: any) => e.sourceId);
      const follows = await matchingTable(admin, "talent_company_follow")
        .select("id,revision,unfollowed_at,scan_state")
        .eq("talent_id", run.talent_id)
        .in("id", sourceIds);
      if (follows.error) throw new Error(follows.error.message);
      const active = new Set(
        request.sourceEvents
          .filter((e: any) =>
            (follows.data ?? []).some(
              (f: any) =>
                f.id === e.sourceId &&
                f.revision === e.revision &&
                !f.unfollowed_at &&
                (!f.scan_state?.latestSourceKey ||
                  f.scan_state.latestSourceKey === e.sourceKey)
            )
          )
          .flatMap((e: any) => e.roleIds ?? [])
      );
      requested = (requested ?? []).filter((id: string) => active.has(id));
      if (!requested.length) {
        await update({
          status: "cancelled",
          finished_at: new Date().toISOString(),
          lease_expires_at: null,
        });
        return;
      }
    }
    if (request.preparationRunId) {
      const { assertCareerSourceEventsCurrent } = await import("../companies/server");
      const parentResult = await matchingTable(admin,"opportunity_discovery_run").select("*").eq("id",request.preparationRunId).eq("talent_id",run.talent_id).single();
      if (parentResult.error) throw new Error(parentResult.error.message);
      const parent = parentResult.data;
      if (parent.trigger_payload?.runContract !== "career_agent_v1" || parent.status !== "handed_off")
        throw new Error("Follow preparation owner is no longer active.");
      await assertCareerSourceEventsCurrent({ admin, run: parent });
      const { readFollowInventory } = await import("../companies/inventory");
      const inventory = await readFollowInventory(admin, run.talent_id);
      const eligible = new Set(inventory.roles.filter(role => role.source === "external" && !role.evaluation && !role.recommendationId).map(role => role.id));
      requested = (requested ?? []).filter((id: string) => eligible.has(id));
    }
    let rows: Awaited<ReturnType<typeof retrieveRoles>>["rows"];
    if (requested?.length || request.preparationRunId) {
      rows = [];
      for (const part of chunks<string>(requested ?? [], 500))
        rows.push(
          ...(await executeSql(
            admin,
            `SELECT ${ROLE_SELECT} FROM public.company_roles cr ${ROLE_JOINS} WHERE ((${eligibilitySql({ userId: run.talent_id, blockedCompanies: loaded.blockedCompanies, includePreviouslyRecommended: true })}) OR (${ownSubmittedRoleSql({ userId: run.talent_id, blockedCompanies: loaded.blockedCompanies })})) AND (${companyWorkspaceFilterSql(request.companyWorkspaceIds)}) AND cr.role_id=ANY(ARRAY[${part.map((id) => `${sqlLiteral(z.string().uuid().parse(id))}::uuid`).join(",")}])`,
            part.length
          ))
        );
    } else if (!request.plan) rows = [];
    else
      rows = (
        await retrieveRoles({
          admin,
          userId: run.talent_id,
          plan: parseExternalSearchPlan(request.plan),
          companyWorkspaceIds: request.companyWorkspaceIds,
          blockedCompanies: loaded.blockedCompanies,
          limit: request.evaluationLimit,
          includePreviouslyRecommended: true,
          excludeInternalCompanies: true,
          unlimitedPerCompany: true,
          targetSalaryKrw: request.targetSalaryKrw,
          signal,
        })
      ).rows;
    const kinds = new Set<OpportunityKind>(request.kinds?.length ? request.kinds : DEFAULT_KINDS);
    // Exact roleIds are explicit choices; kinds select among retrieved roles.
    const selectedRows = (requested?.length ? rows : rows.filter((row: any) =>
      kinds.has(row.is_hiring_post ? "hiring_posts" : "postings"))).slice(0, request.evaluationLimit);
    const companyIds: string[] = request.companyCandidateIds?.length
      ? [...new Set<string>(request.companyCandidateIds)]
      : kinds.has("companies")
      ? [...new Set<string>(request.companyWorkspaceIds?.length ? request.companyWorkspaceIds
        : rows.map((row: any) => String(row.company_workspace_id)))].slice(0, request.evaluationLimit)
      : [];
    const companyRows = companyIds.length ? await readCompanyOpportunityRows(admin, run.talent_id, companyIds) : [];
    // Team, leader, hiring and access facts are part of judging a company itself. Its open roles closest
    // to the searched titles are named; without a title, the ones closest to what this person wants.
    const titleHint = [request.plan?.roleTitles].flat().filter(Boolean).join("; ") || directionHint(context) || request.titleHint;
    const titleVector = companyRows.length ? await embedHint(titleHint ? String(titleHint) : undefined, signal) : undefined;
    const companyFacts = companyRows.length
      ? await readCompanyFacts(admin, companyRows.map(row => row.company_workspace_id), { userId: run.talent_id, titleVector, signal })
      : new Map();
    const [cards, companyResearch, companyCards, companyOverviews] = await Promise.all([
      attachCompanyContextToCards({ admin, cards: selectedRows.map(roleCard) }),
      readRoleCompanyList({ admin, userId: run.talent_id }, selectedRows.flatMap(row => row.role_id ? [row.role_id] : [])),
      attachCompanyContextToCards({ admin, cards: companyRows.map(row => roleCard({ ...row, role_id: companyKey(row.company_workspace_id) })) }),
      readCompanyWorkspaceList({ admin, userId: run.talent_id }, companyRows.map(row => row.company_workspace_id)),
      (async () => {
        const began = Date.now();
        // Persist for subsequent retrievals. Fit evaluation and public cards
        // continue to receive published compensation only.
        metrics.salaryFill = await fillExternalRoleSalaries(
          admin,
          selectedRows.filter((row) => !row.salary_is_predicted &&
            row.salary_min == null && row.salary_max == null &&
            !String(row.salary_range ?? "").trim()).flatMap((row) =>
              row.role_id ? [row.role_id] : []),
          signal
        );
        metrics.salaryFillMs = Date.now() - began;
      })(),
    ]);
    signal?.throwIfAborted();
    await update({ candidate_role_ids: cards.map((c) => c.roleId),
      ...(companyRows.length ? { candidate_company_workspace_ids: companyRows.map(row => row.company_workspace_id) } : {}) });
    if (companyResearch.unavailable || companyOverviews.unavailable) metrics.companyResearchUnavailable = true;
    const scoringContext = { ...context };
    delete scoringContext.behavior_source_watermark; // Stored provenance is not scoring evidence.
    const openRoles = new Map(companyRows.map(row => [companyKey(row.company_workspace_id),
      { total: Number(row.open_role_count ?? 0), titles: row.open_role_titles ?? [] }]));
    // What this person said about a company and how they reacted to it judges every option there;
    // a change to it changes the input fingerprint, so the option is evaluated again.
    const employerOf = new Map<string, string>(selectedRows.flatMap((row: any) =>
      row.role_id && row.company_workspace_id ? [[String(row.role_id), String(row.company_workspace_id)] as [string, string]] : []));
    const [personal, employerSignals] = await Promise.all([
      readCompanyPersonalContext(admin, run.talent_id,
        [...companyRows.map(row => String(row.company_workspace_id)), ...employerOf.values()])
        .catch(() => new Map<string, CompanyPersonalContext>()),
      // A posting is judged with its employer's dated hiring signals; a company's own are among its facts.
      readCompanySignals(admin, [...new Set(employerOf.values())], undefined, signal)
        .catch(() => new Map<string, CompanySignals>()),
    ]);
    const describe = (card: (typeof cards)[number]) => {
      signal?.throwIfAborted();
      const companyId = card.roleId.startsWith(COMPANY_KEY_PREFIX) ? card.roleId.slice(COMPANY_KEY_PREFIX.length) : null;
      const employerId = companyId ?? employerOf.get(card.roleId) ?? "";
      const company = companyId
        ? companyOverviews.projections.get("company_workspace:" + companyId)
        : companyResearch.projections.get("role:" + card.roleId);
      const overview = [company ? formatCompanyOverview(company) : "",
        companyId ? formatCompanyFacts(companyFacts.get(companyId)) : formatCompanySignals(employerSignals.get(employerId)),
        formatCompanyPersonalContext(personal.get(employerId), "evaluator")].filter(Boolean).join("\n");
      const rendered = v2PromptCandidate(
        card,
        run.locale === "en" ? "en" : "ko",
        overview || undefined
      );
      const candidate = companyId
        ? { ...rendered, opportunityKind: "company" as const, openRoles: openRoles.get(card.roleId) }
        : rendered;
      const key = fingerprint({
        evaluator: evaluatorKey(provider),
        profileId: request.profileId,
        profileRevision: request.profileRevision,
        input: buildScoringInput(scoringContext, [candidate]),
      });
      return {
        card,
        candidate,
        key,
        role_id: companyId ? null : card.roleId,
        company_workspace_id: companyId,
        input_fingerprint: key,
      };
    };
    const candidates = [...cards, ...companyCards].map(describe);
    // This execution's evaluation of each option. Judging a company again after its information was
    // filled replaces the evaluation this execution made of it first, so the run lists the company once.
    const idOf = new Map<string, string>();
    const remember = (option: string, id: string) => {
      const previous = idOf.get(option);
      if (previous && previous !== id) ids.delete(previous);
      idOf.set(option, id);
      ids.add(id);
    };
    const evaluate = async (list: typeof candidates) => {
      const cached = await readCachedEvaluations(
        admin,
        run.talent_id,
        list.map(({ role_id, company_workspace_id, input_fingerprint }) => ({
          role_id,
          company_workspace_id,
          input_fingerprint,
        })),
        signal
      );
      const pending = [];
      for (const candidate of list) {
        const saved = cached.get(evaluationKey(candidate));
        if (saved) {
          remember(optionOf(candidate), saved.id);
          metrics.reused++;
        } else pending.push(candidate);
      }
      await mapConcurrent(chunks(pending, 10), 4, async (batch) => {
        if (!(await alive())) return;
        try {
          const result = await callDecisions(
            provider,
            buildScoringInputParts(
              scoringContext,
              batch.map((b) => b.candidate)
            ),
            batch.map((b) => b.card.roleId),
            signal
          );
          // Successful evaluation receipts survive partial failures and cancellation.
          const evaluations = result.evaluations.map((evaluation) => {
            const b = batch.find((b) => b.card.roleId === evaluation.roleId)!;
            return {
              talent_id: run.talent_id,
              role_id: b.role_id,
              ...(b.company_workspace_id ? { company_workspace_id: b.company_workspace_id } : {}),
              run_id: runId,
              input_fingerprint: b.key,
              assessment: { fit: evaluation.fit, raw: evaluation.raw },
              input_snapshot: {
                context,
                candidate: b.candidate,
                profileId: request.profileId,
                profileRevision: request.profileRevision,
                evaluator: evaluatorKey(provider),
              },
            };
          });
          if (evaluations.length) {
            const inserted = new Set<string>();
            // Each target has its own unique key; a batch may contain both.
            for (const [target, group] of [
              ["role_id", evaluations.filter(e => e.role_id)],
              ["company_workspace_id", evaluations.filter(e => !e.role_id)],
            ] as const) {
              if (!group.length) continue;
              const saved = await matchingTable(admin, "talent_external_evaluations")
                .upsert(group, { onConflict: `talent_id,${target},input_fingerprint`, ignoreDuplicates: true })
                .select("id,role_id,company_workspace_id,input_fingerprint");
              if (saved.error) throw new Error(saved.error.message);
              for (const row of (saved.data ?? []) as EvaluationRef[]) {
                remember(optionOf(row), row.id);
                inserted.add(evaluationKey(row));
              }
            }
            // A concurrent run may have inserted some exact keys first. Preserve
            // its immutable evidence and recover all conflict IDs in one read.
            const conflicts = evaluations
              .filter((e) => !inserted.has(evaluationKey(e)))
              .map(({ role_id, input_fingerprint, ...rest }) => ({
                role_id,
                company_workspace_id: "company_workspace_id" in rest ? rest.company_workspace_id : null,
                input_fingerprint,
              }));
            const existing = await readCachedEvaluations(
              admin,
              run.talent_id,
              conflicts
            );
            for (const key of conflicts) {
              const row = existing.get(evaluationKey(key));
              if (!row)
                throw new Error(
                  `Saved evaluation unavailable for ${key.role_id ? `role ${key.role_id}` : `company ${key.company_workspace_id}`}`
                );
              remember(optionOf(key), row.id);
            }
          }
          metrics.batches.push({
            roleIds: batch.map((b) => b.card.roleId),
            usage: result.usage,
            attempts: result.attempts,
            elapsedMs: result.elapsedMs,
            unknownCostAttempts: result.unknownCostAttempts,
          });
          metrics.errors.push(
            ...result.invalid.map((v) => ({ roleId: v.roleId, error: v.error }))
          );
        } catch (error) {
          metrics.retryable = true;
          metrics.errors.push(
            ...batch.map((b) => ({
              roleId: b.card.roleId,
              error: error instanceof Error ? error.message : String(error),
            }))
          );
        }
        await update({ evaluation_ids: [...ids], metrics });
      });
    };
    await evaluate(candidates);
    // Companies are judged first with what Harper has. Those that could reach the top while their
    // overview or hiring signals are missing or stale get them now, within a budget, and are judged
    // again; what is not ready in time finishes in the background for the next search
    // (docs/career-good-opportunity-recommendation-ko.md 2.7).
    if (companyRows.length && (await alive())) {
      try {
        const scores = await readEvaluationScores(admin, run.talent_id, idOf);
        const byScore = scoreRanks([...idOf.keys()].map(key => ({ key, score: scores.get(key) })));
        const near = retrievalRanks(request.companyCandidateIds?.length ? request.companyCandidateIds
          : companyRows.map(row => row.company_workspace_id), request.angles);
        const chosen = chooseCompaniesToFill(companyRows.map(row => ({
          companyId: row.company_workspace_id,
          scoreRank: byScore.get(companyKey(row.company_workspace_id)),
          retrievalRank: near.get(row.company_workspace_id),
          needsInformation: needsInformation(companyOverviews.projections.get("company_workspace:" + row.company_workspace_id)?.state,
            companyFacts.get(row.company_workspace_id)?.signals),
        })), EXTERNAL_EVALUATION_PAGE_SIZE);
        if (chosen.length) {
          // At most half of the time left before the deadline, so judging again still fits.
          const room = options.deadlineAt === undefined ? Infinity : (options.deadlineAt - Date.now()) / 2;
          const prepared = await prepareCompanies({ admin, userId: run.talent_id }, chosen,
            { budgetMs: Math.min(TOP_COMPANY_FILL_BUDGET_MS, room), startWithinBudget: true, signal: options.signal });
          metrics.companyFill = { ready: prepared.ready, pending: prepared.pending, failed: prepared.failed,
            deferred: prepared.deferred, judgedAgain: 0 };
          if (prepared.ready.length && (await alive())) {
            const [overviews, facts] = await Promise.all([
              readCompanyWorkspaceList({ admin, userId: run.talent_id }, prepared.ready),
              readCompanyFacts(admin, prepared.ready, { userId: run.talent_id, titleVector, signal }),
            ]);
            for (const [key, value] of overviews.projections) companyOverviews.projections.set(key, value);
            for (const [key, value] of facts) companyFacts.set(key, value);
            const ready = new Set(prepared.ready);
            const again = candidates.flatMap(candidate => {
              if (!candidate.company_workspace_id || !ready.has(candidate.company_workspace_id)) return [];
              const updated = describe(candidate.card);
              return updated.key === candidate.key ? [] : [updated];
            });
            await evaluate(again);
            metrics.companyFill.judgedAgain = again.length;
          }
        }
      } catch (error) {
        options.signal?.throwIfAborted();
        metrics.companyFill = { ...metrics.companyFill, error: error instanceof Error ? error.message : String(error) };
      }
    }
    const stopped = !(await alive());
    const timedOut = deadlineSignal?.aborted && !options.signal?.aborted;
    const cancelled = stopped && !timedOut;
    await update({
      evaluation_ids: [...ids],
      metrics: { ...metrics, elapsedMs: Date.now() - start },
      status: cancelled
        ? "cancelled"
        : timedOut || metrics.errors.length
          ? ids.size
            ? "partial"
            : "failed"
          : "completed",
      ...(cancelled ? { cancelled_at: new Date().toISOString() } : {}),
      ...(timedOut
        ? {
            error:
              "Request deadline reached; completed evaluations are saved. Resume this run to evaluate the remaining roles.",
          }
        : {}),
      finished_at: new Date().toISOString(),
      lease_expires_at: null,
    });
  } catch (error) {
    metrics.retryable = true;
    await update({
      status: options.signal?.aborted
        ? "cancelled"
        : ids.size
          ? "partial"
          : "failed",
      ...(options.signal?.aborted
        ? { cancelled_at: new Date().toISOString() }
        : {}),
      error: error instanceof Error ? error.message : String(error),
      evaluation_ids: [...ids],
      metrics,
      finished_at: new Date().toISOString(),
      lease_expires_at: null,
    });
  }
  const finished = await db.select("*").eq("id", runId).single();
  if (finished.error) throw new Error(finished.error.message);
  if (options.notifyCompletion === false) {
    await update({ completion_notified_at: new Date().toISOString() });
  } else await completeExternalSearch(admin, finished.data);
}
async function completeExternalSearch(admin: TalentAdminClient, run: any) {
  const table = matchingTable(admin, "external_recommendation_runs");
  const current = await table
    .select("status,lease_token")
    .eq("id", run.id)
    .single();
  if (current.error) throw new Error(current.error.message);
  if (
    current.data.status !== run.status ||
    current.data.lease_token !== run.lease_token
  )
    return;
  const request = run.request ?? {},
    runId = run.id,
    ids = new Set<string>(run.evaluation_ids ?? []),
    metrics = run.metrics ?? {};
  if (
    request.sourceEvents?.length &&
    run.status !== "cancelled" &&
    !(["failed", "partial"].includes(run.status) && metrics.retryable)
  ) {
    const { evaluations } = await readExternalEvaluationResults({
      admin,
      userId: run.talent_id,
      runId,
      limit: null,
      excludePreviouslyRecommended: true,
    });
    const good = evaluations
      .filter((e) => e.role_id && cachedFitEligible(e.assessment.fit))
      .map((e) => e.role_id as string);
    const { completeCareerFollowEvaluation } =
      await import("../companies/server");
    await completeCareerFollowEvaluation({
      admin,
      evaluationId: runId,
      userId: run.talent_id,
      conversationId: run.conversation_id ?? undefined,
      sourceEvents: request.sourceEvents,
      roleIds: good,
      evidence: {
        source: "external",
        evaluationIds: [...ids],
        errors: metrics.errors,
      },
    });
  }
  if (run.surface === "import" && ids.size) {
    const { error } = await admin.rpc("attach_career_import_evaluation" as never,
      { p_run: runId, p_token: run.lease_token } as never);
    if (error) throw new Error(error.message);
  }
  if (request.replyId && run.conversation_id) {
    const { resumeCareerAgentAfterWork } = await import("../agentContinuation");
    await resumeCareerAgentAfterWork({
      admin,
      userId: run.talent_id,
      conversationId: run.conversation_id,
      replyId: request.replyId,
    });
  }
  let notification = table
    .update({ completion_notified_at: new Date().toISOString() })
    .eq("id", runId)
    .eq("status", run.status);
  notification = run.lease_token
    ? notification.eq("lease_token", run.lease_token)
    : notification.is("lease_token", null);
  const { error } = await notification;
  if (error) throw new Error(error.message);
}

/** Queue transport/lease recovery, without launching another selection model. */
export async function recoverCareerMatchingSearches(admin: TalentAdminClient) {
  const stale = new Date(Date.now() - 15 * 60_000).toISOString();
  const result = await matchingTable(admin, "external_recommendation_runs")
    .select("*")
    .eq("variant", "career_agent")
    .or(
      `status.eq.queued,and(status.eq.running,lease_expires_at.lt.${new Date().toISOString()}),completion_notified_at.is.null,and(surface.in.(follow,import),status.in.(failed,partial),finished_at.lt.${stale})`
    )
    .order("created_at")
    .limit(50);
  if (result.error) throw new Error(result.error.message);
  const failures: unknown[] = [];
  for (const run of result.data ?? []) {
    try {
      if (["queued", "running"].includes(run.status)) {
        await publishCareerMatchingSearch(run.id);
        continue;
      }
      if (
        ["follow", "import"].includes(run.surface) &&
        ["failed", "partial"].includes(run.status) &&
        run.metrics?.retryable &&
        new Date(run.finished_at).getTime() < Date.now() - 15 * 60_000
      ) {
        await controlExternalMatchingSearch({
          admin,
          userId: run.talent_id,
          runId: run.id,
          action: "resume",
        });
        continue;
      }
      if (!run.completion_notified_at) await completeExternalSearch(admin, run);
    } catch (error) {
      console.error("[career-matching] Recovery failed", { runId: run.id, error: String(error) });
      failures.push(error);
    }
  }
  if (failures.length) throw new AggregateError(failures, `Failed to recover ${failures.length} Career searches`);
}
