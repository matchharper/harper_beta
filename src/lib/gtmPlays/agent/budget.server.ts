import "server-only";

import { randomUUID } from "node:crypto";
import { createCompanyRunUsage } from "@/lib/llm/runUsage";
import { withLlmUsageContext } from "@/lib/llm/usageContext";
import { gtmRead } from "../db.server";
import { gtmStructuredCall } from "../llm.server";
import {
  BUDGET_HISTORY_DAYS, BUDGET_PLAN_SCHEMA, BUDGET_PLAN_SYSTEM, EMPTY_TALLY, LAYOFF_OPTION_SUFFIX, budgetPlanPrompt,
  diceAllocations, readBudgetAnswer, readStoredBudgetPlan, rollBudgetDice, searchOrder, type BudgetOption, type BudgetPlan, type BudgetTally,
} from "./budget";
import { EXPLORE_SOURCE } from "./signals";
import { recordAgentSpend } from "./spend.server";
import { readRunBudget, writeRunBudget, type AgentRun } from "./store.server";
import { SIGNAL_BUDGET_MAX, SIGNAL_BUDGET_SHARE } from "./tickRules";
import { agentFunnelRows } from "./views.server";

/**
 * #5 검색 예산 나누기, the server side (rules in budget.ts): the day's split is made once per run, at its first search,
 * and kept on the run; later ticks read it back.
 */

const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const addDays = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** The searches a run started, from its counts (search_attempts_<id>). */
function searchedOf(counts: Record<string, unknown>): Set<string> {
  return new Set(Object.keys(counts).filter((key) => key.startsWith("search_attempts_")).map((key) => key.slice("search_attempts_".length)));
}

/**
 * What each option's money brought over the BUDGET_HISTORY_DAYS days before `today` (day and manual runs that kept a
 * split, test runs left out), and the latest earlier split. A person counts for the search that found them: the layoff
 * option for people found by the layoff method, the place's own search for a place the run searched, else the open
 * web. Runs without a split are left out: they did not count the layoff method's spend apart (layoff_cost_<id>), so it
 * would look free.
 */
export async function readBudgetHistory(runId: string, today: string): Promise<{
  tallies: Record<string, BudgetTally>; lastPlan: { day: string; plan: BudgetPlan } | null;
}> {
  return gtmRead(async (sql) => {
    const rows = await sql<Array<{ id: string; day: string; counts: Record<string, unknown> | null; budget: unknown }>>`
      select id::text as id, to_char(run_date, 'YYYY-MM-DD') as day, counts, signal_log -> 'budget' as budget
      from public.gtm_agent_runs
      where kind in ('daily', 'manual') and not is_test and id <> ${runId}::uuid
        and run_date >= ${addDays(today, -BUDGET_HISTORY_DAYS)}::date and run_date < ${today}::date
      order by created_at desc
    `;
    const runs = rows.flatMap((row) => {
      const plan = readStoredBudgetPlan(row.budget);
      return plan ? [{ ...row, plan }] : [];
    });
    const tallies: Record<string, BudgetTally> = {};
    const tally = (option: string) => (tallies[option] ??= { ...EMPTY_TALLY });
    const searchedBy = new Map<string, Set<string>>();
    // The options each run gave money to, spent on or found people with (each counts the run once).
    const usedBy = new Map<string, Set<string>>();
    const lastPlan = runs[0] ? { day: runs[0].day, plan: runs[0].plan } : null;
    for (const run of runs) {
      const counts = run.counts ?? {};
      const searched = searchedOf(counts);
      searchedBy.set(run.id, searched);
      const used = new Set<string>();
      usedBy.set(run.id, used);
      for (const search of searched) {
        const layoff = num(counts[`layoff_cost_${search}`]);
        const signal = Math.max(0, num(counts[`signal_cost_${search}`]) - layoff);
        if (signal > 0) { tally(search).spentUsd += signal; used.add(search); }
        if (layoff > 0) { tally(`${search}${LAYOFF_OPTION_SUFFIX}`).spentUsd += layoff; used.add(`${search}${LAYOFF_OPTION_SUFFIX}`); }
      }
      for (const item of run.plan.allocations) {
        if (item.usd <= 0) continue;
        tally(item.option).givenUsd += item.usd;
        used.add(item.option);
      }
    }
    const ids = runs.map((run) => run.id);
    const people = ids.length
      ? await agentFunnelRows(sql, sql`p.run_id = any(${ids}::uuid[]) and p.method <> 'applicant' and not p.is_test`)
      : [];
    for (const person of people) {
      const searched = searchedBy.get(person.runId ?? "") ?? new Set<string>();
      const option = person.method === "layoff_company" && searched.has(person.source) ? `${person.source}${LAYOFF_OPTION_SUFFIX}`
        : searched.has(person.source) && person.source !== EXPLORE_SOURCE ? person.source
          : searched.has(EXPLORE_SOURCE) ? EXPLORE_SOURCE : null;
      if (!option) continue;
      usedBy.get(person.runId ?? "")?.add(option);
      const into = tally(option);
      into.people += 1;
      if (person.hasFit) into.fits += 1;
      if (person.sentAt) into.sent += 1;
      if (person.clickedAt || person.signedUpAt) into.clicked += 1;
      if (person.signedUpAt) into.signedUp += 1;
      if (person.connected) into.connected += 1;
    }
    for (const used of usedBy.values()) for (const option of used) tally(option).runs += 1;
    for (const value of Object.values(tallies)) {
      value.givenUsd = Math.round(value.givenUsd * 100) / 100;
      value.spentUsd = Math.round(value.spentUsd * 100) / 100;
    }
    return { tallies, lastPlan };
  });
}

/** The longest the split's call may take (it runs inside the first search's time). */
const BUDGET_CALL_MS = 30_000;

/**
 * The run's split of today's search budget: the one kept on the run, else a new one (the dice, then the agent's
 * call; the dice split as is when the call fails or runs past BUDGET_CALL_MS or `deadlineAt`), with the searches'
 * order (searchOrder), kept on the run. The total is SIGNAL_BUDGET_MAX, or less when today's money is running out
 * (SIGNAL_BUDGET_SHARE of what is left). The call's cost is a search cost of the run. A failed read of the kept split
 * throws (the tick tries again later) instead of planning the day over it.
 */
export async function dayBudgetPlan(args: {
  run: AgentRun; options: readonly BudgetOption[]; leftUsd: number; day: string; configId: string | null; deadlineAt: number; now?: Date;
}): Promise<BudgetPlan> {
  const kept = readStoredBudgetPlan(await readRunBudget(args.run.id));
  if (kept) return kept;
  const totalUsd = Math.floor(Math.min(SIGNAL_BUDGET_MAX, Math.max(0, args.leftUsd) * SIGNAL_BUDGET_SHARE) * 100) / 100;
  const history = await readBudgetHistory(args.run.id, args.day).catch((error) => {
    console.warn("[gtm-agent] budget history", error instanceof Error ? error.message : String(error));
    return { tallies: {}, lastPlan: null };
  });
  const dice = rollBudgetDice(args.options, history.tallies);
  const at = (args.now ?? new Date()).toISOString();
  const order = searchOrder(args.options, history.tallies);
  const usage = createCompanyRunUsage();
  let plan: BudgetPlan;
  try {
    const raw = await withLlmUsageContext(
      { requestId: randomUUID(), careerOrigin: "server", careerCapability: { name: "gtm_agent", step: "search_budget" }, companyRunUsage: usage },
      () => gtmStructuredCall<unknown>({
        label: "gtm-agent:search-budget", schemaName: "gtm_agent_search_budget", schema: BUDGET_PLAN_SCHEMA as unknown as Record<string, unknown>,
        system: BUDGET_PLAN_SYSTEM, maxTokens: 2_000,
        signal: AbortSignal.timeout(Math.max(1_000, Math.min(BUDGET_CALL_MS, args.deadlineAt - Date.now()))),
        user: budgetPlanPrompt({ day: args.day, totalUsd, options: args.options, tallies: history.tallies, dice, lastPlan: history.lastPlan }),
      }),
    );
    const answer = readBudgetAnswer(raw, args.options, totalUsd);
    plan = answer
      ? { at, totalUsd, dice, allocations: answer.allocations, note: answer.note, by: "agent", error: null, order }
      : { at, totalUsd, dice, allocations: diceAllocations(args.options, dice, totalUsd), note: "", by: "dice", error: "배분 답에 쓸 금액이 없어요", order };
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 300);
    console.warn("[gtm-agent] budget plan", message);
    plan = { at, totalUsd, dice, allocations: diceAllocations(args.options, dice, totalUsd), note: "", by: "dice", error: message, order };
  }
  await recordAgentSpend({ step: "search", usd: usage.costUsd, runId: args.run.id, configId: args.configId, isTest: args.run.isTest });
  await writeRunBudget(args.run.id, plan).catch((error) => {
    // Not kept: a later tick plans the day again (one more call).
    console.warn("[gtm-agent] budget write", error instanceof Error ? error.message : String(error));
  });
  return plan;
}
