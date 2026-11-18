import "server-only";

import { randomUUID } from "node:crypto";
import { evidenceText } from "@/lib/externalRecommendationsV2/context";
import { fitProvider, planDecisionSchema, rankScore, type Fit } from "@/lib/externalRecommendationsV2/contract";
import type { V2SearchPlan } from "@/lib/externalRecommendationsV2/countries";
import { callDecisions } from "@/lib/externalRecommendationsV2/decisions";
import {
  generateSummaries, parsePlan, rerankCandidates, summary, v2CompletionRequest, type EngineArgs,
} from "@/lib/externalRecommendationsV2/engine";
import { embedSearchTitles, retrieveRoles } from "@/lib/externalRecommendationsV2/retrieval";
import salaryFx from "@/lib/externalRecommendationsV2/salaryFx.json";
import { runScoringBatches } from "@/lib/externalRecommendationsV2/scoringBatches";
import { buildScoringInput, v2PromptCandidate } from "@/lib/externalRecommendationsV2/scoringInput";
import { directUsageCost } from "@/lib/externalRecommendationsV2/usage";
import { createCompanyRunUsage } from "@/lib/llm/runUsage";
import { withLlmUsageContext } from "@/lib/llm/usageContext";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import {
  attachCompanyContextToCards, roleCard, type RawRoleRow, type RoleCard,
} from "@/lib/talentOnboarding/jobPostingRecommendations";
import { runTalentAssistantCompletion } from "@/lib/talentOnboarding/llm";
import { GTM_ROLE_PURPOSE, GTM_WORKSPACE_ID, HARPER_WORKSPACE_ID } from "../constants";
import { gtmRead } from "../db.server";
import { cleanPublicDescription } from "../shared";
import {
  MIN_FITS, MAX_FITS, OUTREACH_PLAN_PROMPT, OUTREACH_REVISE_PROMPT, byRankScore, detectLanguage, fitClears,
  fittingCompanyCount, internalCandidate, isExcludedCompany, outreachContext, outreachPlanFields, postingExcluded,
  personFacts, postingsFromSelection, rankInternalRoles, reviseEvidence, withFitScores, withOutreachRecency, withoutNames, type AgentPlanStep,
  type InternalCandidate, type InternalRoleSource, type PostingMeta, type ScoredPosting,
} from "./match";
import { mailPersonName } from "./mailRules";
import { writePostingFrames } from "./postingFrame.server";
import { mailWhy } from "./render";
import { reviewPostingText } from "./review";
import type { AgentPersonInput, AgentPosting } from "./types";

/** Public postings read per search and scored per search; customer and GTM Roles scored per search. */
const PUBLIC_FETCH = 48;
const PUBLIC_SCORED = 40;
const INTERNAL_SCORED = 10;
const SUMMARIES_WRITTEN = 10;
const SUMMARY_CALL_SIZE = 5;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Career's JSON call (same model, effort and limits per step), logged as #5's. */
async function pickJsonCall(system: string, input: string, label: string, signal?: AbortSignal): Promise<unknown> {
  const request = v2CompletionRequest(system, input, label);
  const raw = await runTalentAssistantCompletion({
    ...request,
    abortSignal: signal ? AbortSignal.any([signal, request.abortSignal!]) : request.abortSignal,
    usageLabel: `gtm-agent:pick_${label}`,
  });
  try {
    return JSON.parse(raw);
  } catch {
    // Not JSON: the caller's schema check fails and Career's selector repairs it once, as it does for members.
    return { invalidJson: raw.slice(0, 4_000) };
  }
}

/** The shared posting search (filter-first + one combined title vector), without any talent row. */
async function searchPublicPostings(
  plan: V2SearchPlan,
  args: { targetSalaryKrw: number | null; excluded: string[]; seenRoleIds: string[] },
  addUsd: (usd: number) => void,
): Promise<RawRoleRow[]> {
  const vectors = await embedSearchTitles(plan.roleTitles, undefined, (usage) => addUsd(directUsageCost("embeddings", usage).usd ?? 0));
  const { rows } = await retrieveRoles({
    admin: getTalentSupabaseAdmin(),
    plan,
    vectors,
    targetSalaryKrw: args.targetSalaryKrw,
    // Only used to leave out postings already recommended to a member; nobody has this id.
    userId: randomUUID(),
    blockedCompanies: args.excluded.map((name) => name.trim().slice(0, 100)).filter(Boolean).slice(0, 20),
    excludeRoleIds: args.seenRoleIds.filter((id) => UUID.test(id)),
    limit: PUBLIC_FETCH,
  });
  return rows;
}

/**
 * Open Roles a mail can propose besides public postings, with their full text: customers' own Roles (as #4 ③, the
 * customer's name) and saved GTM Roles (as #4 ②, "Harper 고객사(<설명>)"; never the real company). A Role's text is
 * its description only: a customer's brief (company_internal_roles.request) is private and a GTM Role's request names
 * the real company, so a Role without a description is left out (internalCandidate).
 */
export async function internalRoles(): Promise<InternalCandidate[]> {
  const rows = await gtmRead((sql) => sql<InternalRoleSource[]>`
    select r.role_id::text as role_id,
      case when w.company_workspace_id = ${GTM_WORKSPACE_ID}::uuid then 'gtm' else 'customer' end as kind,
      r.name, r.company_workspace_id::text as company_workspace_id,
      case when w.company_workspace_id = ${GTM_WORKSPACE_ID}::uuid then w.company_name
        else coalesce(nullif(btrim(w.published_name), ''), w.company_name) end as company_name,
      w.company_name as workspace_name,
      nullif(btrim(r.description), '') as description,
      r.location_text, r.work_mode, r.type, r.posted_at::text as posted_at, r.seniority_level, r.summary,
      r.salary_min::float8 as salary_min, r.salary_max::float8 as salary_max, r.salary_currency, r.salary_period, r.salary_range,
      w.company_description, cd.short_description as company_db_short_description,
      cd.employee_count_range as company_db_employee_count_range, cd.founded_year as company_db_founded_year,
      cd.location as company_db_location,
      r.information->'gtm'->>'publicDescription' as public_description,
      r.information->'gtm'->>'companyName' as gtm_company,
      r.information->'gtm'->>'opsName' as gtm_ops_name,
      -- A GTM Role made from a customer's own Role: that customer's names are the real company's too.
      array_remove(array[sw.company_name, nullif(btrim(sw.published_name), '')], null) as gtm_source_names
    from public.company_roles r
    join public.company_workspace w on w.company_workspace_id = r.company_workspace_id
    left join public.company_workspace sw on w.company_workspace_id = ${GTM_WORKSPACE_ID}::uuid
      and sw.company_workspace_id::text = r.information->'gtm'->>'sourceWorkspaceId'
    left join public.company_db cd on cd.id = w.company_db_id
    where r.source_type = 'internal' and r.status in ('active', 'top_priority')
      and (
        (w.is_internal is true and w.company_workspace_id <> all(array[${HARPER_WORKSPACE_ID}, ${GTM_WORKSPACE_ID}]::uuid[])
          and coalesce(lower(btrim(r.information->>'testOnly')), '') not in ('true', '1', 'yes', 'on'))
        or (w.company_workspace_id = ${GTM_WORKSPACE_ID}::uuid and r.information->>'purpose' = ${GTM_ROLE_PURPOSE})
      )
    order by r.updated_at desc nulls last
    limit 400
  `);
  return rows.flatMap((row) => internalCandidate(row, cleanPublicDescription) ?? []);
}

/** Where candidates come from and what the pick may write (tests and measurements swap them). */
export type PickSources = {
  searchPublic: typeof searchPublicPostings;
  internalRoles: () => Promise<InternalCandidate[]>;
  /** Company funding and leadership on public cards (as Career reads them). */
  companyContext: (cards: RoleCard[]) => Promise<RoleCard[]>;
  /** true: role summaries stay in memory (nothing is written). Otherwise public postings' summaries go to the shared cache. */
  dryRun: boolean;
};

const LIVE_SOURCES: PickSources = {
  searchPublic: searchPublicPostings,
  internalRoles,
  companyContext: (cards) => attachCompanyContextToCards({ admin: getTalentSupabaseAdmin(), cards }),
  dryRun: false,
};

export type AgentMatch = {
  postings: AgentPosting[];
  language: "ko" | "en";
  notJobSeeking: boolean;
  reason: string;
  costUsd: number;
  /** The search plans the pick used, in order (the second only when the first found fewer than 2 fits). */
  plans: AgentPlanStep[];
  /**
   * Each picked posting's own text, in the postings' order (a GTM Role's with its real company's names replaced), for
   * the separate grader (agent/review.server.ts); never stored. null: no text.
   */
  postingTexts: Array<string | null>;
};

/**
 * One outside person → 2-3 fitting postings, the way Career picks postings for members: Career's planner writes a
 * search plan from the person's public facts (and says whether they are looking at all), the shared search finds
 * public postings, they and the open customer / GTM Roles are scored on their full JD with Career's fit rubric, and
 * Career's selector picks among the ones that fit, writing the why. Fewer than 2 fits after the first search → the
 * planner revises the plan once from what came back, and only the new candidates are scored. Never a posting at their
 * current company (or `excludeCompanyNames`). Fewer than 2 fits → no postings (the caller records no_fit).
 */
export async function matchAgentPostings(person: AgentPersonInput, opts: { excludeCompanyNames?: string[] } = {}): Promise<AgentMatch> {
  return pickAgentPostings(person, opts, LIVE_SOURCES);
}

export async function pickAgentPostings(person: AgentPersonInput, opts: { excludeCompanyNames?: string[] }, sources: PickSources): Promise<AgentMatch> {
  const totals = createCompanyRunUsage();
  let directUsd = 0;
  const addUsd = (usd: number) => { directUsd += usd; };
  const excluded = [...new Set([person.currentCompany, ...(opts.excludeCompanyNames ?? [])]
    .map((name) => name?.trim() ?? "").filter(Boolean))];
  const result = await withLlmUsageContext(
    { requestId: randomUUID(), careerOrigin: "server", careerCapability: { name: "gtm_agent", step: "match" }, companyRunUsage: totals },
    () => pick(person, excluded, sources, addUsd),
  );
  return { ...result, costUsd: Number((totals.costUsd + directUsd).toFixed(6)) };
}

async function pick(person: AgentPersonInput, excluded: string[], sources: PickSources, addUsd: (usd: number) => void): Promise<Omit<AgentMatch, "costUsd">> {
  const context = outreachContext(person, excluded);
  const planInput = (extra: Record<string, unknown>) => evidenceText({ user_context: context, salary_fx: salaryFx, ...extra });
  const internalLoad = sources.internalRoles().catch((error) => {
    console.warn("[gtm-agent:match] internal roles", error instanceof Error ? error.message : String(error));
    return [] as InternalCandidate[];
  });

  const firstRaw = await pickJsonCall(OUTREACH_PLAN_PROMPT, planInput({}), "plan");
  const first = outreachPlanFields(firstRaw);
  const hasText = Boolean(person.signalText || person.profileText || person.headline);
  const language = hasText ? detectLanguage([person.signalText, person.profileText, person.headline], "ko") : first.language ?? "ko";
  if (!first.jobSeeking) {
    return { postings: [], language, notJobSeeking: true, reason: first.jobSeekingReason, plans: [], postingTexts: [] };
  }
  const firstPlan = planFrom(firstRaw);
  const internal = await internalLoad;

  // Every candidate seen, its card and how it becomes a posting; every fit scored.
  const cards = new Map<string, RoleCard>();
  const metaByRoleId = new Map<string, PostingMeta>();
  const fits = new Map<string, Fit>();
  const plans: AgentPlanStep[] = [];
  const scored = (): ScoredPosting[] => [...fits.entries()].flatMap(([roleId, fit]) => {
    const meta = metaByRoleId.get(roleId);
    return meta ? [{
      roleId, companyName: meta.companyName, title: meta.title, location: meta.location, fit, kind: meta.kind, companyNames: meta.companyNames,
    }] : [];
  });

  const searchAndScore = async (plan: V2SearchPlan, targetSalaryKrw: number | null, reason: string, revised: boolean) => {
    const rows = await sources.searchPublic(plan, { targetSalaryKrw, excluded, seenRoleIds: [...cards.keys()] }, addUsd).catch((error) => {
      console.warn("[gtm-agent:match] public search", error instanceof Error ? error.message : String(error));
      return [] as RawRoleRow[];
    });
    const publicCards = rows.map(roleCard)
      .filter((card) => card.roleId && card.roleName && !cards.has(card.roleId) && !isExcludedCompany(card.companyName ?? "", excluded))
      .slice(0, PUBLIC_SCORED);
    const internalPicked = rankInternalRoles(
      internal.filter((item) => !cards.has(item.meta.roleId!) && !postingExcluded(item.meta, excluded)), plan, INTERNAL_SCORED,
    );
    const fresh = [...await sources.companyContext(publicCards), ...internalPicked.map((item) => roleCard(item.row))];
    for (const card of publicCards) {
      metaByRoleId.set(card.roleId, {
        kind: "external", roleId: card.roleId, url: card.row.external_jd_url ?? null,
        companyName: card.companyName?.trim() || "—", title: card.roleName, location: card.location,
      });
    }
    for (const item of internalPicked) metaByRoleId.set(item.meta.roleId!, item.meta);
    for (const card of fresh) cards.set(card.roleId, card);
    await scoreCards(fresh, context, language, fits, addUsd);
    plans.push({
      plan, reason, revised, found: rows.length, scored: fresh.length, fittingCompanies: fittingCompanyCount(scored(), excluded),
    });
  };

  await searchAndScore(firstPlan.plan, firstPlan.targetSalaryKrw, firstPlan.plan.searchIntentSummary, false);
  if (plans[0].fittingCompanies < MIN_FITS) {
    // One revise round: the planner sees what was searched and why the scored postings fell short.
    try {
      const revisedRaw = await pickJsonCall(OUTREACH_REVISE_PROMPT, planInput({ previous_searches: reviseEvidence(plans, scored()) }), "plan_revise");
      const revised = planFrom(revisedRaw);
      const why = outreachPlanFields(revisedRaw).reviseReason || "검색 범위를 넓혀 다시 찾아요";
      await searchAndScore(revised.plan, revised.targetSalaryKrw, why, true);
    } catch (error) {
      console.warn("[gtm-agent:match] revise", error instanceof Error ? error.message : String(error));
    }
  }

  const candidateCount = cards.size;
  const revisedNote = plans.length > 1 ? ", 검색 계획을 한 번 바꿔 다시 찾음" : "";
  const fitting = byRankScore(scored().filter((item) => fitClears(item.fit) && !postingExcluded(item, excluded)));
  const fittingCompanies = fittingCompanyCount(fitting, excluded);
  if (fittingCompanies < MIN_FITS) {
    return {
      postings: [], language, notJobSeeking: false, plans, postingTexts: [],
      reason: `맞는 공고가 ${fittingCompanies}곳뿐이에요 (공고 ${candidateCount}개 점수 매김${revisedNote})`,
    };
  }

  // Career's selector reads each candidate's neutral summary: write the missing ones (public postings' go to the
  // shared cache, customer and GTM Roles' stay in memory), then let it pick.
  const ranked = fitting.map((item) => ({ card: cards.get(item.roleId)!, fit: item.fit, score: rankScore(item.fit) }));
  const engine = (dryRun: boolean): EngineArgs => ({
    admin: getTalentSupabaseAdmin(), userId: randomUUID(), surface: "daily", language, targetCount: MAX_FITS, dryRun,
  });
  // At most 10, as Career's web and daily runs write; in parallel calls of 5 (one call of 10 takes ~18s).
  const missing = ranked.map((item) => item.card).filter((card) => !summary(card, language)).slice(0, SUMMARIES_WRITTEN);
  const isPublic = (card: RoleCard) => metaByRoleId.get(card.roleId)?.kind === "external";
  const writeSummaries = (cardsInCall: RoleCard[], dryRun: boolean) => generateSummaries(engine(dryRun), cardsInCall, pickJsonCall)
    .catch((error) => {
      // A role left without a summary only drops out of the selector's list (as for members).
      console.warn("[gtm-agent:match] summaries", error instanceof Error ? error.message : String(error));
      return 0;
    });
  await Promise.all([
    ...chunk(missing.filter(isPublic), SUMMARY_CALL_SIZE).map((cardsInCall) => writeSummaries(cardsInCall, sources.dryRun)),
    ...chunk(missing.filter((card) => !isPublic(card)), SUMMARY_CALL_SIZE).map((cardsInCall) => writeSummaries(cardsInCall, true)),
  ]);
  const selected = await rerankCandidates(engine(true), { ...context, current_search_scope: plans.at(-1)!.plan }, ranked, pickJsonCall);
  // The why keeps only the fit (Shaun 11/17: the picker's "다만 …" caveats are not needed for GTM, on the mail or the log).
  const picked = postingsFromSelection(selected.map((item) => ({ roleId: item.card.roleId, note: mailWhy(item.recommendationNote ?? "") })), metaByRoleId, excluded);
  // Each posting's reason in the 후보자 링크 frame (what the company needs → the person's experience → so they fit),
  // read from the posting text; a GTM Role's text and words never name its real company.
  const scrub = (posting: AgentPosting, text: string) => {
    const hide = posting.roleId ? metaByRoleId.get(posting.roleId)?.hide : undefined;
    return hide ? withoutNames(text, hide.names, hide.replacement) : text;
  };
  const framed = picked.length ? await writePostingFrames({
    language, personFacts: personFacts(person), personName: mailPersonName(person.name),
    postings: picked.map((posting) => {
      const raw = posting.roleId ? cards.get(posting.roleId)?.row.description ?? null : null;
      return { companyName: posting.companyName, title: posting.title, location: posting.location, why: posting.why, description: raw ? scrub(posting, raw) : null };
    }),
  }) : { frames: [], costUsd: 0 };
  addUsd(framed.costUsd);
  const postings = picked.map((posting, index) => {
    const frame = framed.frames[index];
    return frame ? { ...posting, summary: scrub(posting, frame.summary), fit: frame.fit.map((line) => scrub(posting, line)) } : posting;
  });
  // The matcher's fit stays on each posting (/ops 추천 품질), and the grader reads the same posting text.
  const postingText = (posting: AgentPosting) => {
    const row = posting.roleId ? cards.get(posting.roleId)?.row : undefined;
    return row ? reviewPostingText(row, (text) => scrub(posting, text)) : null;
  };
  return {
    postings: withFitScores(postings, fits), language, notJobSeeking: false, plans, postingTexts: postings.map(postingText),
    reason: postings.length
      ? `맞는 ${fittingCompanies}곳 중 ${postings.length}곳을 골랐어요 (공고 ${candidateCount}개 점수 매김${revisedNote})`
      : `맞는 ${fittingCompanies}곳이 있었지만 고르는 단계에서 2곳이 안 됐어요 (공고 ${candidateCount}개 점수 매김${revisedNote})`,
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

/** The planner's envelope as a search plan (Career's parser, plus #5's 180-day posting limit). */
function planFrom(raw: unknown): { plan: V2SearchPlan; targetSalaryKrw: number | null } {
  const decision = planDecisionSchema.parse(raw);
  if (!decision.plan) throw new Error("planner gave no plan");
  return { plan: withOutreachRecency(parsePlan(decision.plan)), targetSalaryKrw: decision.targetSalaryKrw };
}

/**
 * Career's fit scoring (four metrics from the shared rubric over the full JD, 10 roles per call, as for members). A
 * failed batch leaves its roles unscored and never stops the others; nothing is saved (the person is not a member).
 */
async function scoreCards(cards: RoleCard[], context: object, language: "ko" | "en", fits: Map<string, Fit>, addUsd: (usd: number) => void) {
  if (!cards.length) return;
  const provider = fitProvider();
  await runScoringBatches(cards, fits, async (batch) => {
    const input = buildScoringInput(context, batch.map((card) => v2PromptCandidate(card, language)));
    try {
      const result = await callDecisions(provider, input, batch.map((card) => card.roleId));
      addUsd(directUsageCost(provider === "openai" ? "openai_decisions" : "jev_decisions", result.usage).usd ?? 0);
      for (const evaluation of result.evaluations) fits.set(evaluation.roleId, evaluation.fit);
    } catch (error) {
      console.warn("[gtm-agent:match] fit batch", error instanceof Error ? error.message : String(error));
    }
  });
}
