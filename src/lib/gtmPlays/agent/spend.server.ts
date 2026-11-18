import "server-only";

import { gtmRead, gtmWrite } from "../db.server";
import { fitsUnderCap, spendDay, type AgentSpendStep } from "./spend";
import { agentCostToday } from "./store.server";

/**
 * #5 spend log writes and the cap check (rules in agent/spend.ts). A write also adds the amount to its run's cost_usd
 * in the same statement, so a tick that is killed later loses none of it.
 */

export type AgentSpendEntry = {
  step: AgentSpendStep;
  usd: number;
  runId?: string | null;
  personId?: string | null;
  /** The source searched (search steps). */
  source?: string | null;
  /** The 설정 묶음 of the tick that spends it; without one, the latest its run ran with. */
  configId?: string | null;
  isTest?: boolean;
};

/**
 * Logs one paid step on the Korea-time day it is spent. Best effort (the money is spent either way; a failed write is
 * logged, never thrown, so the step's own result is still recorded).
 */
export async function recordAgentSpend(entry: AgentSpendEntry, at = new Date()): Promise<void> {
  const usd = Math.round(Number(entry.usd) * 1_000_000) / 1_000_000;
  if (!Number.isFinite(usd) || usd === 0) return;
  try {
    await gtmWrite((sql) => sql`
      with spend as (
        insert into public.gtm_agent_spend (spent_day, spent_at, step, usd, run_id, person_id, source, config_id, is_test)
        values (${spendDay(at)}::date, ${at.toISOString()}::timestamptz, ${entry.step}, ${usd}, ${entry.runId ?? null}::uuid,
          ${entry.personId ?? null}::uuid, ${entry.source ?? null},
          coalesce(${entry.configId ?? null}::text, (select r.config_ids[cardinality(r.config_ids)] from public.gtm_agent_runs r
            where r.id = ${entry.runId ?? null}::uuid)),
          ${entry.isTest ?? false})
        returning run_id, usd
      )
      update public.gtm_agent_runs r set cost_usd = r.cost_usd + spend.usd from spend where r.id = spend.run_id
    `);
  } catch (error) {
    console.error("[gtm-agent] spend not logged", entry.step, usd, error instanceof Error ? error.message : String(error));
  }
}

/** What the agent spent so far today (Korea time), from the log. */
export async function agentSpentToday(at = new Date()): Promise<number> {
  return gtmRead((sql) => agentCostToday(sql, spendDay(at)));
}

/** Whether a paid call expected to cost `nextUsd` fits under today's cap (read from the log right now). */
export async function mayAgentSpend(capUsd: number, nextUsd = 0): Promise<boolean> {
  return fitsUnderCap(await agentSpentToday(), capUsd, nextUsd);
}
