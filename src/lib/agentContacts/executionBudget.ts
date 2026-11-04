import { agentContactDatabase } from "./store";
import type { AgentContactSource } from "./contracts";
import type {
  Database,
  Query,
} from "@/lib/career/matching/internalScoring/database";

// A causal chain shares the existing company invocation's 25-minute compute
// allowance. This bounds work across jobs without classifying message content.
export const AGENT_CHAIN_EXECUTION_SECONDS = 25 * 60;
export class AgentContactBudgetExhaustedError extends Error {}
export class AgentContactBudgetBusyError extends Error {}

export async function sourceBudgetAnchor(
  q: Query,
  source: AgentContactSource
): Promise<string | null> {
  if (source.kind === "career" && source.backgroundRunId) {
    const [run] = await q(
      "SELECT trigger_payload FROM public.opportunity_discovery_run WHERE id=$1::uuid",
      [source.backgroundRunId]
    );
    return run?.trigger_payload?.agentContactBudgetAnchor ?? null;
  }
  if (source.kind === "company_event") {
    const [job] = await q(
      "SELECT action_context FROM public.company_agent_web_action_jobs WHERE id=$1::uuid",
      [source.jobId]
    );
    return job?.action_context?.agentContactBudgetAnchor ?? null;
  }
  return null;
}

/** Reserve shared compute atomically across both agents, retries and schedules. */
export async function reserveAgentExecution(
  anchorId: string,
  key: string,
  invocationSeconds: number,
  db: Database = agentContactDatabase()
) {
  return db.transaction(async (q) => {
    const [anchor] = await q(
      "SELECT execution_usage FROM public.agent_contact_messages WHERE id=$1::uuid FOR UPDATE",
      [anchorId]
    );
    if (!anchor) throw new Error("Agent compute source unavailable");
    const usage = { ...anchor.execution_usage },
      reservations = { ...(usage.reservations ?? {}) };
    let spent = Number(usage.spentSeconds ?? 0);
    for (const [id, r] of Object.entries(reservations) as [string, any][])
      if (Date.parse(r.expiresAt) <= Date.now()) {
        spent += r.seconds;
        delete reservations[id];
      }
    if (reservations[key])
      throw new Error("Agent compute reservation already running");
    const configured = Number(
      process.env.AGENT_CONTACT_CHAIN_EXECUTION_SECONDS ||
        AGENT_CHAIN_EXECUTION_SECONDS
    );
    if (!Number.isFinite(configured) || configured <= 0)
      throw new Error("Invalid agent compute allowance");
    const limit = Number(usage.allowanceSeconds ?? configured);
    const available =
      limit -
      spent -
      Object.values(reservations).reduce(
        (sum: number, r: any) => sum + Number(r.seconds),
        0
      );
    const seconds = Math.min(invocationSeconds, available);
    if (seconds < 1) {
      if (limit - spent >= 1 && Object.keys(reservations).length)
        throw new AgentContactBudgetBusyError(
          "Related agent work is still running; retry after its compute reservation settles."
        );
      throw new AgentContactBudgetExhaustedError(
        "Agent compute allowance exhausted; work remains recorded for an explicit operational resumption or a new user request."
      );
    }
    reservations[key] = {
      seconds,
      startedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + seconds * 1000).toISOString(),
    };
    await q(
      "UPDATE public.agent_contact_messages SET execution_usage=$2::jsonb WHERE id=$1::uuid",
      [
        anchorId,
        JSON.stringify({
          ...usage,
          allowanceSeconds: limit,
          spentSeconds: spent,
          reservations,
        }),
      ]
    );
    return seconds;
  });
}

export async function settleAgentExecution(
  anchorId: string,
  key: string,
  db: Database = agentContactDatabase()
) {
  await db.transaction(async (q) => {
    const [anchor] = await q(
      "SELECT execution_usage FROM public.agent_contact_messages WHERE id=$1::uuid FOR UPDATE",
      [anchorId]
    );
    const usage = anchor?.execution_usage,
      reservations = { ...(usage?.reservations ?? {}) },
      r = reservations[key];
    if (!r) return;
    delete reservations[key];
    const seconds = Math.min(
      r.seconds,
      Math.max(0, (Date.now() - Date.parse(r.startedAt)) / 1000)
    );
    await q(
      "UPDATE public.agent_contact_messages SET execution_usage=$2::jsonb WHERE id=$1::uuid",
      [
        anchorId,
        JSON.stringify({
          ...usage,
          reservations,
          spentSeconds: Number(usage.spentSeconds ?? 0) + seconds,
        }),
      ]
    );
  });
}
