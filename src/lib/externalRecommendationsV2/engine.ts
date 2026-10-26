import { runScoringBatches } from "./scoringBatches";
import { SEARCH_RESULT_LIMIT } from "./searchDefaults";
import salaryFx from "./salaryFx.json";
import { fillExternalRoleSalaries } from "./salaryEstimation.server";
import { countriesSchema, type V2SearchPlan } from "./countries";
import { buildScoringInput, v2PromptCandidate } from "./scoringInput";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { runTalentAssistantCompletion } from "../talentOnboarding/llm";
import type { TalentAdminClient } from "../talentOnboarding/admin";
import {
  attachCompanyContextToCards,
  roleCard,
  fullJdRoleSourceHash,
  fetchExistingExternalRecommendations,
  filterPreviouslyRecommendedExternalRows,
  roleLineForLlm,
  companyLineForLlm,
  sqlLiteral,
  type RoleCard,
  type RawRoleRow,
} from "../talentOnboarding/jobPostingRecommendations";
import { buildFullJdCandidateBatchText } from "../talentOnboarding/jobPostingFullJdScoring";
import {
  WORKER_PLAN_PROMPT,
  PLAN_PROMPT,
  summaryPrompt,
  rerankPrompt,
} from "./prompts";
import { callDecisions } from "./decisions";
import {
  chunks,
  mapConcurrent,
  evaluatorKey,
  fitProvider,
  fingerprint,
  fitSchema,
  planDecisionSchema,
  PROMPT_VERSION,
  EXPERIMENT,
  SEARCH_PLAN_VERSION,
  priorFitForLlm,
  priorFitSchema,
  scoreForLlm,
  type WorkerSearchContext,
  rankScore,
  cachedFitEligible,
  type FitProvider,
  type FitEvaluation,
  type SearchDefault,
} from "./contract";
import { evidenceText, loadExternalContext } from "./context";
import {
  retrieveRoles,
  embedSearchTitles,
  buildHybridSql,
  executeSql,
  eligibilitySql,
  ROLE_SELECT,
  ROLE_JOINS,
} from "./retrieval";

type Admin = TalentAdminClient;
export type EngineArgs = {
  admin: Admin;
  userId: string;
  request?: string;
  surface: "web" | "worker" | "daily";
  language: "ko" | "en";
  targetCount?: number;
  provider?: FitProvider;
  dryRun?: boolean;
  reuseDefault?: boolean;
  cachedOnly?: boolean;
  /** Set only for an explicitly requested reevaluation. */
  refreshFit?: boolean;
  signal?: AbortSignal;
  workerSearchContext?: WorkerSearchContext;
  behaviorSnapshot?: { text: string; version: number };
  onProgress?: (
    phase: "query" | "scoring" | "reranking" | "delivery",
    counts: Record<string, number>
  ) => void;
};
const capSearchArray = (limit: number) => (value: unknown) =>
  Array.isArray(value) ? value.slice(0, limit) : value;
const searchPlanSchema = z.object({
  searchIntentSummary: z.string(),
  ftsKeywords: z.preprocess(
    capSearchArray(4),
    z.array(
      z.object({
        terms: z.preprocess(
          capSearchArray(8),
          z.array(z.string().min(1)).min(1),
        ),
        weight: z.number().min(0).max(5).default(1),
      }),
    ),
  ),
  role_titles: z.preprocess(
    capSearchArray(24),
    z.array(z.string().trim().min(1)).min(1),
  ),
  include_contract: z.boolean(),
  include_parttime: z.boolean(),
  include_intern: z.boolean(),
  includeRemote: z.boolean(),
  remoteOnly: z.boolean(),
  is_prefer_entry: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
  countries: countriesSchema,
  postingRecency: z
    .object({
      maxAgeDays: z.number().int().min(1).max(3650).nullable(),
      recentDays: z.number().int().min(1).max(3650).nullable(),
      recentWeight: z.number().min(0).max(20).nullable(),
      olderWeight: z.number().min(0).max(20).nullable(),
    })
    .nullable(),
});
export function parsePlan(raw: unknown): V2SearchPlan {
  const p = searchPlanSchema.parse(raw);
  return {
    searchIntentSummary: p.searchIntentSummary,
    ftsKeywords: p.ftsKeywords,
    roleTitles: [...new Set(p.role_titles)],
    includeContract: p.include_contract,
    includeIntern: p.include_intern,
    includeParttime: p.include_parttime,
    includeRemote: p.includeRemote,
    remoteOnly: p.remoteOnly,
    isPreferEntry: p.is_prefer_entry,
    countries: p.countries,
    postingRecency: p.postingRecency,
  };
}
export function v2CompletionRequest(
  system: string,
  input: string,
  label: string,
): Parameters<typeof runTalentAssistantCompletion>[0] {
  const isV2Rerank = label === "rerank" || label === "rerank_repair";
  return {
    abortSignal: AbortSignal.timeout(90_000),
    primaryModel: "gpt-6-luna",
    fallbackModel: "gpt-6-luna",
    jsonMode: true,
    maxTokens: isV2Rerank ? 32768 : 8000,
    openAIResponsesReasoningEffort: isV2Rerank ? "high" : "low",
    messages: [
      { role: "system", content: system },
      { role: "user", content: input },
    ],
    usageLabel: `career_tool:recommend_job_postings:v2_${label}`,
  };
}
class InvalidRerankSelection extends Error {}
class InvalidCompletionJson extends SyntaxError {
  constructor(readonly raw: string) {
    super("Expected valid JSON");
  }
}
async function jsonCall(
  system: string,
  input: string,
  label: string,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const request = v2CompletionRequest(system, input, label);
  const raw = await runTalentAssistantCompletion({
    ...request,
    abortSignal: signal
      ? AbortSignal.any([signal, request.abortSignal!])
      : request.abortSignal,
  });
  signal?.throwIfAborted();
  try {
    return JSON.parse(raw);
  } catch {
    throw new InvalidCompletionJson(raw);
  }
}
export function summary(card: RoleCard, lang: string) {
  const s = card.roleSummary?.[lang] as { content?: unknown } | undefined;
  return typeof s?.content === "string" ? s.content.trim() : "";
}
function roleSourceHash(card: RoleCard) {
  // Includes funding and leadership evidence; cached fit must match actual scorer inputs.
  const p = v2PromptCandidate(card, "en");
  return fingerprint(buildScoringInput({}, [p]));
}
export async function getSearchPlan(
  args: EngineArgs,
  loaded: Awaited<ReturnType<typeof loadExternalContext>>,
  complete = jsonCall,
  embed = embedSearchTitles
) {
  let saved = loaded.setting?.external_search_default as
    | SearchDefault
    | undefined;
  // Older defaults carried an unused locations array. Do not feed it back to
  // the planner or return/persist it when reusing their country-based plan.
  if (saved) {
    const { locations: _legacyLocations, ...plan } =
      saved.plan as V2SearchPlan & {
        locations?: unknown;
      };
    saved = { ...saved, plan };
  }
  const usable =
    saved?.version === SEARCH_PLAN_VERSION &&
    countriesSchema.safeParse(saved.plan?.countries).success &&
    saved.plan?.roleTitles?.length &&
    saved.titleVectors?.length === 1
      ? saved
      : undefined;
  if (
    args.surface !== "worker" &&
    args.reuseDefault &&
    usable?.contextFingerprint === loaded.contextFingerprint
  )
    return {
      ...usable,
      sql: buildHybridSql({ plan: usable.plan, vectors: usable.titleVectors,
        userId: args.userId, blockedCompanies: loaded.blockedCompanies,
        limit: SEARCH_RESULT_LIMIT, template: true, targetSalaryKrw: usable.targetSalaryKrw }),
      defaultAction: "reuse", planCall: false,
    };
  const decisionSchema =
    args.surface === "worker"
      ? planDecisionSchema.extend({
          searchIntentSummary: z.string().trim().min(1).max(1200),
        })
      : planDecisionSchema;
  const result = decisionSchema.parse(
    await complete(
      args.surface === "worker" ? WORKER_PLAN_PROMPT : PLAN_PROMPT,
      evidenceText({
        user_context: loaded.context,
        current_request: args.request ?? null,
        salary_fx: salaryFx,
        ...(args.surface === "worker"
          ? { worker_search_context: args.workerSearchContext }
          : {}),
        saved_default: saved
          ? {
              revision: saved.revision,
              plan: saved.plan,
              sql: saved.sql,
              contextFingerprint: saved.contextFingerprint,
              targetSalaryKrw: saved.targetSalaryKrw ?? null,
              version: saved.version,
              reusable: Boolean(usable),
            }
          : null,
      }),
      "plan",
      args.signal
    )
  );
  if (result.defaultAction === "reuse" && !usable)
    throw new Error("Planner reused a nonexistent default");
  const plan =
    result.defaultAction === "reuse" ? usable!.plan : parsePlan(result.plan);
  const titleVectors =
    saved?.titleVectors?.length === 1 &&
    (saved.version === SEARCH_PLAN_VERSION ||
      saved.plan?.roleTitles.length === 1) &&
    JSON.stringify(plan.roleTitles) === JSON.stringify(saved?.plan?.roleTitles)
      ? saved.titleVectors
      : await embed(plan.roleTitles, args.signal);
  const sql = buildHybridSql({
    plan,
    vectors: titleVectors,
    userId: args.userId,
    blockedCompanies: loaded.blockedCompanies,
    limit: SEARCH_RESULT_LIMIT,
    template: true,
    targetSalaryKrw: result.targetSalaryKrw,
  });
  const value: SearchDefault = {
    revision: randomUUID(),
    plan,
    sql,
    titleVectors,
    contextFingerprint: loaded.contextFingerprint,
    targetSalaryKrw: result.targetSalaryKrw,
    version: SEARCH_PLAN_VERSION,
  };
  if (!args.dryRun && result.defaultAction !== "explore") {
    // CAS protects another concurrent search's default; a failed CAS does not change this run.
    let query = (args.admin.from("talent_setting") as any)
      .update({
        external_search_default: value,
      })
      .eq("user_id", args.userId);
    query = saved?.revision
      ? query.eq("external_search_default->>revision", saved.revision)
      : query.is("external_search_default->>revision", null);
    const { error } = await query;
    if (error) throw new Error(error.message);
  }
  // Keep a run-specific reuse rationale out of the durable default. It travels in
  // the returned plan and the existing run history, not in Brief/Memory.
  const purpose =
    "searchIntentSummary" in result ? String(result.searchIntentSummary) : null;
  return {
    ...value,
    plan: purpose ? { ...plan, searchIntentSummary: purpose } : plan,
    defaultAction: result.defaultAction,
    planCall: true,
  };
}
export async function hydrate(args: EngineArgs, rows: RawRoleRow[]) {
  const existing = await fetchExistingExternalRecommendations({
    admin: args.admin,
    userId: args.userId,
  });
  const cards = filterPreviouslyRecommendedExternalRows(rows, existing).map(
    roleCard
  );
  return attachCompanyContextToCards({ admin: args.admin, cards });
}
export async function loadFitCache(
  args: EngineArgs,
  cards: RoleCard[],
  inputFingerprint: string,
  provider: FitProvider
) {
  const result = new Map<string, FitEvaluation>();
  if (!cards.length || args.refreshFit) return result;
  // Keep the worker's 500 UUIDs below reverse-proxy URL limits.
  const pages = await mapConcurrent(
    chunks(
      cards.map((c) => c.roleId),
      200
    ),
    3,
    async (ids) => {
      const { data, error } = await (
        args.admin.from("talent_external_fit") as any
      )
        .select("role_id,evaluations")
        .eq("talent_id", args.userId)
        .in("role_id", ids);
      if (error) throw new Error(error.message);
      return data ?? [];
    }
  );
  const data = pages.flat();
  const byId = new Map(cards.map((c) => [c.roleId, c]));
  for (const row of data ?? []) {
    const card = byId.get(row.role_id);
    if (!card) continue;
    // Stored evaluations survive input, provider, prompt and age changes.
    // Metadata remains provenance; only an explicit refresh bypasses the cache.
    const evaluations = Object.values(row.evaluations ?? {}) as FitEvaluation[];
    const value = evaluations
      .filter((value) => value && fitSchema.safeParse(value).success)
      .sort((a, b) => (Date.parse(b.evaluatedAt) || 0) - (Date.parse(a.evaluatedAt) || 0))[0];
    if (value) result.set(row.role_id, value);
  }
  return result;
}
export async function generateSummaries(
  args: EngineArgs,
  cards: RoleCard[],
  complete = jsonCall
) {
  const missing = cards.filter((c) => !summary(c, args.language));
  // Web has exactly one batch at most; worker has at most ten batches for its top 100.
  const batches = chunks(
    args.surface === "worker" ? missing : missing.slice(0, 10)
  );
  const evaluationSchema = z.object({
    roleId: z.string().uuid(),
    fitSummary: z.string().trim().min(1),
  });
  const counts = await mapConcurrent(batches, 4, async (batch) => {
    let result: { evaluations: unknown[] };
    try {
      result = z.object({ evaluations: z.array(z.unknown()) }).parse(
        await complete(
          summaryPrompt(args.language),
          buildFullJdCandidateBatchText(
            batch.map((c) => ({
              ...v2PromptCandidate(c, args.language),
              cachedRoleSummary: null,
            }))
          ),
          "summaries",
          args.signal
        )
      );
    } catch (error) {
      args.signal?.throwIfAborted();
      console.warn("[externalRecommendationsV2] summary batch failed", {
        roleIds: batch.map((c) => c.roleId),
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
    const byId = new Map(batch.map((c) => [c.roleId, c]));
    // Validate each record independently so incomplete model output cannot
    // discard the valid summaries in this batch. Unchanged cards without a
    // requested-language summary are already excluded by rerankCandidates.
    const seen = new Set<string>();
    const evaluations = result.evaluations.flatMap((raw) => {
      const parsed = evaluationSchema.safeParse(raw);
      if (!parsed.success || !byId.has(parsed.data.roleId)) return [];
      if (seen.has(parsed.data.roleId)) return [];
      seen.add(parsed.data.roleId);
      return [parsed.data];
    });
    if (evaluations.length !== batch.length)
      console.warn("[externalRecommendationsV2] skipped incomplete summaries", {
        requested: batch.length,
        accepted: evaluations.length,
      });
    if (!evaluations.length) return 0;
    const pending = evaluations.map((e) => {
      const card = byId.get(e.roleId)!;
      return {
        ...e,
        roleName: card.row.role_name ?? card.roleName,
        description: card.row.description ?? "",
        companyWorkspaceId: card.companyWorkspaceId,
        payload: {
          content: e.fitSummary,
          version: "v2-neutral-source-hash",
          sourceHash: fullJdRoleSourceHash(card),
          generatedAt: new Date().toISOString(),
        },
      };
    });
    if (args.dryRun) {
      for (const e of pending) {
        const card = byId.get(e.roleId)!;
        card.roleSummary = { ...card.roleSummary, [args.language]: e.payload };
        card.row.summary = card.roleSummary;
      }
    } else {
      const { data, error } = await args.admin.rpc(
        "save_external_role_summaries_v2" as never,
        {
          p_locale: args.language,
          p_rows: pending,
        } as never
      );
      if (error) {
        if (error.code !== "57014") throw new Error(error.message);
        args.signal?.throwIfAborted();
        console.warn(
          "[externalRecommendationsV2] summary cache write timed out",
          {
            roleIds: batch.map((c) => c.roleId),
          }
        );
        return 0;
      }
      for (const row of (data ?? []) as any[]) {
        const card = byId.get(row.role_id);
        if (!card) continue;
        card.roleSummary = row.summary;
        card.row.summary = row.summary;
      }
    }
    return pending.length;
  });
  return counts.reduce((total, count) => total + count, 0);
}
export type SelectedRole = {
  card: RoleCard;
  score: number;
  recommendationNote: string;
  fitSummary: string;
};
export async function rerankCandidates(
  args: EngineArgs,
  context: unknown,
  ranked: Array<{ card: RoleCard; score: number; fit: unknown }>,
  complete = jsonCall,
  variant: "control" | "v2" = "v2",
): Promise<SelectedRole[]> {
  const valid = ranked.flatMap((r) => {
    const fit = priorFitSchema.safeParse(r.fit);
    if (
      !fit.success ||
      !Number.isFinite(r.score) ||
      r.score < 0 ||
      r.score > 100
    ) {
      console.warn("[externalRecommendationsV2] skipped invalid prior fit", {
        roleId: r.card.roleId,
      });
      return [];
    }
    return [{ ...r, fit: fit.data }];
  });
  if (ranked.length && !valid.length)
    throw new Error("No valid fit evaluations returned");
  const candidates = valid
    .filter((r) => summary(r.card, args.language))
    .slice(0, variant === "v2" ? 25 : 20);
  if (!candidates.length) return [];
  args.onProgress?.("reranking", { candidateCount: candidates.length });
  const target = Math.min(args.targetCount ?? 5, candidates.length);
  const { search_brief: currentSearchBrief, ...userFacts } =
    context && typeof context === "object" && !Array.isArray(context)
      ? (context as Record<string, unknown>)
      : { context };
  const outputSchema = z.object({
    selectedRoles: z
      .array(
        z.object({
          candidateId: z.string(),
          recommendationNote: z.string().trim().min(1),
        }),
      )
      .max(target),
  });
  const input =
    evidenceText({
      candidate_context: {
        target_count: target,
        roles: candidates.map((r, i) => ({
          id: String(i + 1),
          role: roleLineForLlm(r.card),
          company: companyLineForLlm(r.card, false),
          priorFit: {
            score: scoreForLlm(r.score),
            metrics: priorFitForLlm(r.fit),
            fitSummary: summary(r.card, args.language),
          },
        })),
      },
      // Keep the decision's authoritative context adjacent to generation,
      // after the larger collection of source documents.
      user_context: userFacts,
      current_search_brief: currentSearchBrief ?? null,
      current_request: args.request ?? null,
    });
  let correction = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    let raw: unknown;
    try {
      raw = await complete(
        rerankPrompt(args.language, args.surface) +
          (attempt
            ? "\n\nCorrect the previous output using the supplied validation errors. Return the complete JSON selection using only supplied candidate IDs, unique roles and at most one role per company, within target_count."
            : ""),
        input + correction,
        `${variant === "control" ? "control_" : ""}${attempt ? "rerank_repair" : "rerank"}`,
        args.signal,
      );
      const result = outputSchema.parse(raw);
      const seen = new Set<string>();
      const companies = new Set<string>();
      return result.selectedRoles.map((item) => {
        const index = candidates.findIndex(
          (_, i) => String(i + 1) === item.candidateId,
        );
        const r = candidates[index];
        if (
          !r ||
          seen.has(r.card.roleId) ||
          companies.has(r.card.companyWorkspaceId)
        )
          throw new InvalidRerankSelection(
            `Invalid or duplicate candidate/company: ${item.candidateId}`,
          );
        seen.add(r.card.roleId);
        companies.add(r.card.companyWorkspaceId);
        return {
          card: r.card,
          score: r.score,
          recommendationNote: item.recommendationNote,
          fitSummary: summary(r.card, args.language),
        };
      });
    } catch (error) {
      args.signal?.throwIfAborted();
      if (
        !(error instanceof z.ZodError) &&
        !(error instanceof InvalidRerankSelection) &&
        !(error instanceof InvalidCompletionJson)
      )
        throw error;
      if (attempt === 1) {
        console.warn(
          "[externalRecommendationsV2] rerank invalid after one repair; skipping selection",
        );
        return [];
      }
      correction =
        "\n\n" +
        evidenceText({
          previousInvalidResponse:
            error instanceof InvalidCompletionJson ? error.raw : raw,
          validationErrors:
            error instanceof z.ZodError ? error.issues : [error.message],
        });
    }
  }
  return [];
}
export type EngineDiagnostics = {
  complete?: typeof jsonCall;
  frozenInput?: {
    context: Awaited<ReturnType<typeof loadExternalContext>>;
    plan: Awaited<ReturnType<typeof getSearchPlan>>;
    cards: RoleCard[];
  };
  // Observational hook for private evaluation receipts; never changes runtime decisions.
  trace?: (stage: string, data: unknown) => void | Promise<void>;
};
export async function runExternalV2(
  args: EngineArgs,
  diagnostics: EngineDiagnostics = {}
) {
  const began = Date.now();
  const provider = args.provider ?? fitProvider();
  if (diagnostics.frozenInput && !args.dryRun)
    throw new Error("Frozen inputs require dryRun");
  const loaded =
    diagnostics.frozenInput?.context ??
    (await loadExternalContext(args.admin, args.userId, args.behaviorSnapshot));
  await diagnostics.trace?.("context", loaded);
  if (args.surface === "daily" ? !loaded.dailyEnabled : !loaded.externalEnabled)
    return { selected: [], plan: null, metrics: { skipped: true }, provider };
  const fitContext = {
    ...loaded.context,
    ...(args.request ? { current_request: args.request } : {}),
  };
  const inputFingerprint = fingerprint(fitContext);
  const metrics: Record<string, any> = {
    experiment: EXPERIMENT,
    contextMs: Date.now() - began,
    provider,
    model: provider === "openai" ? "gpt-6-luna" : "typesafe/jev-1.13",
    promptVersion: PROMPT_VERSION,
    earlyStopped: false,
    scoringCalls: 0,
    scoringUnknownCostAttempts: 0,
    scoredCount: 0,
    failedRoleIds: [],
    scoringUsage: [],
  };
  let cards: RoleCard[] = [];
  let plan: Awaited<ReturnType<typeof getSearchPlan>> | null = null;
  if (args.cachedOnly) {
    const rows = await executeSql(
      args.admin,
      `SELECT ${ROLE_SELECT} FROM public.talent_external_fit f JOIN public.company_roles cr ON cr.role_id=f.role_id ${ROLE_JOINS}
      JOIN LATERAL (
        SELECT e.value FROM jsonb_each(f.evaluations) e
        ORDER BY e.value->>'evaluatedAt' DESC, e.key
        LIMIT 1
      ) cached ON true
      WHERE f.talent_id=${sqlLiteral(args.userId)}::uuid AND ${eligibilitySql({ userId: args.userId, blockedCompanies: loaded.blockedCompanies })}
      ORDER BY (cached.value->>'mutualFit')::float DESC NULLS LAST`,
      200
    );
    cards = await hydrate(args, rows);
  } else if (diagnostics.frozenInput) {
    plan = diagnostics.frozenInput.plan;
    cards = structuredClone(diagnostics.frozenInput.cards);
  } else {
    args.onProgress?.("query", {});
    const planStarted = Date.now();
    plan = await getSearchPlan(args, loaded, diagnostics.complete);
    metrics.planMs = Date.now() - planStarted;
    await diagnostics.trace?.("plan", plan);
    const retrievalStarted = Date.now();
    const retrieved = await retrieveRoles({
      admin: args.admin,
      plan: plan.plan,
      targetSalaryKrw: plan.targetSalaryKrw,
      vectors: plan.titleVectors,
      userId: args.userId,
      blockedCompanies: loaded.blockedCompanies,
      limit: SEARCH_RESULT_LIMIT,
      signal: args.signal,
    });
    metrics.retrievalMs = Date.now() - retrievalStarted;
    metrics.sqlFingerprint = fingerprint(retrieved.sql);
    metrics.planCall = plan.planCall;
    const hydrationStarted = Date.now();
    cards = await hydrate(args, retrieved.rows);
    metrics.hydrationMs = Date.now() - hydrationStarted;
  }
  // Estimates are stored for the NEXT initial retrieval. Cards keep published-only
  // compensation; scorer, summaries, reranker and delivery never see estimates.
  if (!args.dryRun && !args.cachedOnly && !diagnostics.frozenInput) {
    const salaryStarted = Date.now();
    metrics.salaryFill = await fillExternalRoleSalaries(
      args.admin,
      cards
        .filter(
          (c) =>
            !c.row.salary_is_predicted &&
            c.row.salary_min == null &&
            c.row.salary_max == null &&
            !String(c.row.salary_range ?? "").trim()
        )
        .map((c) => c.roleId),
      args.signal
    );
    metrics.salaryFillMs = Date.now() - salaryStarted;
  }
  await diagnostics.trace?.("candidates", cards);
  const cacheStarted = Date.now();
  const fits = diagnostics.frozenInput
    ? new Map<string, FitEvaluation>()
    : await loadFitCache(args, cards, inputFingerprint, provider);
  metrics.cacheReadMs = Date.now() - cacheStarted;
  metrics.cacheHits = fits.size;
  metrics.candidateCount = cards.length;
  const fresh = args.cachedOnly ? [] : cards.filter((c) => !fits.has(c.roleId));
  args.onProgress?.("scoring", {
    candidateCount: cards.length,
    scoredCount: fits.size,
  });
  // Stop scheduling after both quality counts are met; drain and save in-flight batches.
  const scoringStarted = Date.now();
  const scoringStop = await runScoringBatches(fresh, fits, async (batch) => {
    args.signal?.throwIfAborted();
    const input = buildScoringInput(
      fitContext,
      batch.map((c) => v2PromptCandidate(c, args.language))
    );
    let r: Awaited<ReturnType<typeof callDecisions>>;
    try {
      r = await callDecisions(
        provider,
        input,
        batch.map((c) => c.roleId),
        args.signal
      );
    } catch (error) {
      args.signal?.throwIfAborted();
      await diagnostics.trace?.("fit_batch_error", {
        roleIds: batch.map((c) => c.roleId),
        error: error instanceof Error ? error.message : String(error),
      });
      const attempts = Number((error as { attempts?: number }).attempts ?? 1);
      metrics.scoringCalls += attempts;
      metrics.scoringUnknownCostAttempts += attempts;
      metrics.failedRoleIds.push(...batch.map((c) => c.roleId));
      return; // One provider failure cannot stop the remaining independent batches.
    }
    await diagnostics.trace?.("fit_batch", { input, receipt: r });
    metrics.scoringCalls += r.attempts;
    metrics.scoringUnknownCostAttempts += r.unknownCostAttempts;
    metrics.scoringUsage.push({
      elapsedMs: r.elapsedMs,
      usage: r.usage,
      attempts: r.attempts,
      unknownCostAttempts: r.unknownCostAttempts,
    });
    metrics.failedRoleIds.push(...r.errors);
    const byId = new Map(batch.map((c) => [c.roleId, c]));
    const values: FitEvaluation[] = r.evaluations.map((e) => ({
      ...e.fit,
      roleId: e.roleId,
      raw: e.raw,
      provider,
      model: r.model,
      promptVersion: PROMPT_VERSION,
      inputFingerprint,
      roleSourceHash: roleSourceHash(byId.get(e.roleId)!),
      evaluatedAt: new Date().toISOString(),
    }));
    const stored = [
      ...values,
      ...r.invalid.map((e) => ({
        ...e,
        provider,
        model: r.model,
        promptVersion: PROMPT_VERSION,
        inputFingerprint,
        roleSourceHash: roleSourceHash(byId.get(e.roleId)!),
        evaluatedAt: new Date().toISOString(),
      })),
    ];
    if (!args.dryRun && stored.length) {
      const { error } = await args.admin.rpc(
        "save_external_fit_v2" as never,
        {
          p_talent_id: args.userId,
          p_evaluator: evaluatorKey(provider),
          p_rows: stored,
        } as never
      );
      if (error) {
        if (error.code !== "57014") throw new Error(error.message);
        args.signal?.throwIfAborted();
        metrics.failedRoleIds.push(...batch.map((c) => c.roleId));
        await diagnostics.trace?.("fit_cache_write_error", {
          roleIds: batch.map((c) => c.roleId),
          error: error.message,
        });
        return;
      }
    }
    for (const value of values) fits.set(value.roleId, value);
    metrics.scoredCount += values.length;
    args.onProgress?.("scoring", {
      candidateCount: cards.length,
      scoredCount: fits.size,
    });
  });
  Object.assign(metrics, scoringStop);
  metrics.failedRoleIds = [...new Set(metrics.failedRoleIds)];
  metrics.scoringMs = Date.now() - scoringStarted;
  if (fresh.length && !fits.size)
    throw new Error("No valid fit evaluations returned");
  const rank = () =>
    cards
      .flatMap((card) => {
        const fit = fits.get(card.roleId);
        return fit && (!args.cachedOnly || cachedFitEligible(fit))
          ? [
              {
                card,
                fit,
                score: rankScore(fit),
              },
            ]
          : [];
      })
      .sort(
        (a, b) =>
          b.score - a.score || a.card.roleId.localeCompare(b.card.roleId)
      );
  let ranked = rank();
  await diagnostics.trace?.("ranking", ranked);
  if (
    args.cachedOnly &&
    new Set(
      ranked
        .filter((r) => summary(r.card, args.language))
        .map((r) => r.card.companyWorkspaceId)
    ).size < Math.min(args.targetCount ?? 5, 5)
  )
    return {
      selected: [],
      plan,
      metrics: {
        ...metrics,
        cacheInsufficient: true,
        durationMs: Date.now() - began,
      },
      provider,
    };
  const top = ranked.slice(0, 100).map((r) => r.card);
  const summaryStarted = Date.now();
  metrics.summariesGenerated = args.cachedOnly
    ? 0
    : await generateSummaries(args, top, diagnostics.complete);
  metrics.summaryMs = Date.now() - summaryStarted;
  metrics.missingSummaryRoleIds = top
    .filter((card) => !summary(card, args.language))
    .map((card) => card.roleId);
  if (top.length && metrics.missingSummaryRoleIds.length === top.length)
    throw new Error("No valid role summaries returned");
  ranked = rank();
  const rerankStarted = Date.now();
  const selected = await rerankCandidates(
    args,
    {
      ...loaded.context,
      ...(args.surface === "worker" && plan
        ? { current_search_purpose: plan.plan.searchIntentSummary }
        : {}),
      current_search_scope:
        plan?.plan ??
        (loaded.setting?.external_search_default as SearchDefault | undefined)
          ?.plan,
    },
    ranked,
    diagnostics.complete
  );
  metrics.rerankMs = Date.now() - rerankStarted;
  metrics.durationMs = Date.now() - began;
  metrics.recommendationCount = selected.length;
  return { selected, plan, metrics, provider };
}
