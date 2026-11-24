import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { rankScore } from "@/lib/externalRecommendationsV2/contract";
import { directionHint } from "../companies/discovery";
import { readExternalEvaluationResults } from "./externalEvaluationResults";
import {
  formatLedger, formatPoolOptions, formatRouteHistory, readRouteHistory, recordSearchInPool, type Ledger,
} from "./candidatePool";

type Row = Record<string, any>;
const db = (admin: TalentAdminClient, table: string) => admin.from(table as never) as any;
const scoreOf = (assessment: Row | null | undefined) => { try { const s = rankScore(assessment?.fit ?? assessment); return Number.isFinite(s) ? s : null; } catch { return null; } };

/** Which companies near the top had their public information brought up to date before ranking, and
 * which were still being gathered, by option number when the matching has one. */
export function formatCompanyFill(fill: Row | undefined, numberOf: (companyWorkspaceId: string) => number | undefined) {
  if (!fill) return "";
  const list = (ids: unknown) => {
    const all = Array.isArray(ids) ? ids.map(String) : [];
    const numbers = all.map(numberOf).filter((n): n is number => typeof n === "number");
    return !all.length ? "" : numbers.length === all.length ? numbers.map(n => `[${n}]`).join(" ")
      : `${all.length} compan${all.length === 1 ? "y" : "ies"}`;
  };
  const ready = list(fill.ready), pending = list(fill.pending), deferred = list(fill.deferred);
  return [
    ready ? `Company overview and hiring signals brought up to date before ranking: ${ready}.` : "",
    pending ? `Still being gathered, so judged with what was on record (a later search uses what is found): ${pending}.` : "",
    deferred ? `Not gathered within this search's time, so judged with what was on record: ${deferred}.` : "",
    fill.error ? `Company information near the top could not be updated: ${fill.error}` : "",
  ].filter(Boolean).join("\n");
}

/**
 * The model-facing result of a search: the ledger (what was new, whether the
 * strongest options changed, routes tried), then one compact entry per option
 * with its matching number, weighted score and decision facts.
 */
export async function renderSearch(admin: TalentAdminClient, args: {
  userId: string; runId: string; poolMatchingId?: string; cursor?: string; limit?: number; notes?: string[]; fallback?: unknown;
}) {
  const { data: run, error } = await db(admin, "external_recommendation_runs").select("*")
    .eq("id", args.runId).eq("talent_id", args.userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!run) return { runId: args.runId, status: "not_found", modelOutput: `No search ${args.runId} is available to this user.` };
  const notes = [...(args.notes ?? [])];
  const failures = (run.metrics?.errors ?? []).map((e: unknown) => typeof e === "string" ? e : JSON.stringify(e)).slice(0, 3);
  // A partial run's saved evaluations are readable with its failures.
  if (!["completed", "partial"].includes(run.status)) {
    return {
      ...(args.fallback && typeof args.fallback === "object" ? args.fallback : {}),
      runId: run.id, status: run.status,
      modelOutput: [`Search ${run.id} is ${run.status}${run.error ? `: ${run.error}` : ""}. Read it again with action=read when it has finished.`,
        ...notes, ...failures.map((f: string) => `Partial failure: ${f}`)].join("\n"),
    };
  }
  const matchingId: string | undefined = run.matching_id ?? args.poolMatchingId;
  let ledger: Ledger | undefined = run.metrics?.ledger;
  if (matchingId && !ledger) {
    try { ledger = (await recordSearchInPool(admin, { userId: args.userId, matchingId, run })).ledger; }
    catch (poolError) { notes.push(`Options could not be numbered in the matching: ${String(poolError)}`); }
  }
  // The page, its counts and cursor come from the stored evaluation reader;
  // this adds option numbers, the ledger and decision facts.
  let structured: Row;
  try {
    structured = await readExternalEvaluationResults({ admin, userId: args.userId, runId: run.id, cursor: args.cursor,
      limit: args.limit, excludePreviouslyRecommended: true, includeCompanyResearch: false });
  } catch (readError) {
    const message = readError instanceof Error ? readError.message : String(readError);
    return { runId: run.id, matchingId, status: run.status, evaluationReadError: message,
      modelOutput: [ledger ? formatLedger(ledger) : "", ...notes,
        `The search finished but its results could not be read: ${message}. Read it again with action=read; nothing is evaluated again.`,
        `Search run ${run.id}.`].filter(Boolean).join("\n") };
  }
  const { data: pool } = matchingId
    ? await db(admin, "talent_matching_candidates").select("number,role_id,company_workspace_id,first_run_id,angles").eq("matching_id", matchingId)
    : { data: [] };
  const key = (r: Row) => r.role_id ? `role:${r.role_id}` : `company:${r.company_workspace_id}`;
  const poolOf = new Map((pool ?? []).map((r: Row) => [key(r), r]));
  const page: Row[] = structured.evaluations ?? [];
  // The same open roles the evaluator saw: closest to the searched titles, else to what this person wants.
  const titleHint = [run.request?.plan?.roleTitles].flat().filter(Boolean).join("; ")
    || directionHint(run.input_snapshot) || run.request?.titleHint || undefined;
  const lines = await formatPoolOptions(admin, {
    userId: args.userId,
    titleHint,
    options: page.map(e => {
      const p = poolOf.get(key(e)) as Row | undefined;
      return { key: { roleId: e.role_id, companyWorkspaceId: e.role_id ? null : e.company_workspace_id },
        number: p?.number, score: scoreOf(e.assessment), fresh: p ? p.first_run_id === run.id : undefined, angles: p?.angles };
    }),
  });
  const listed = Number(structured.evaluationCount ?? page.length);
  const hidden = ledger ? ledger.evaluated - listed - Number(structured.expiredRoleCount ?? 0) : 0;
  const routes = matchingId ? formatRouteHistory(await readRouteHistory(admin, matchingId, args.userId)) : "";
  const modelOutput = [
    ledger ? formatLedger(ledger) : `${listed} evaluated.`,
    routes,
    ...notes,
    ...failures.map((f: string) => `Partial failure: ${f}`),
    run.metrics?.companyResearchUnavailable ? "Shared employer research was unavailable when this search was evaluated." : "",
    formatCompanyFill(run.metrics?.companyFill, id => (poolOf.get(`company:${id}`) as Row | undefined)?.number),
    hidden > 0 ? `Already recommended to this person and not listed: ${hidden}.` : "",
    structured.expiredRoleCount ? `Closed postings not listed: ${structured.expiredRoleCount}.` : "",
    "",
    // Closed postings are left out above, so the listed roles are hiring.
    page.some(e => e.role_id) ? "Options (roles are hiring):" : "",
    ...lines,
    "",
    page.length ? `Showing ${page.length} of ${listed} by weighted score (mutualFit 55%, candidateInterest 35%, companyInterest 10%; a constraint conflict lowers it).${structured.evaluationCursor ? ` Next: cursor ${structured.evaluationCursor}.` : ""}` : "No options to list.",
    `Search run ${run.id}.`,
    "Team numbers come from Harper's career records as of the date shown.",
  ].filter((line, index, all) => line !== "" || (index > 0 && all[index - 1] !== "")).join("\n");
  return { ...structured, runId: run.id, matchingId, status: run.status, failures: run.metrics?.errors ?? [], ...(ledger ? { ledger } : {}),
    ...(run.error ? { error: run.error } : {}), modelOutput };
}
