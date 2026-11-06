import type { AgentContactSource, AgentContactMessage } from "./contracts";
import {
  agentContactDatabase,
  assertAgentContactSource,
  assertAgentContactPair,
  AgentContactSupersededError,
} from "./store";
import { nextScheduleOccurrence } from "@/lib/career/schedules/server";
import { formatLlmDateTime } from "@/lib/llm/promptDateTime";
import type { Database } from "@/lib/career/matching/internalScoring/database";

const render = (rows: any[]) =>
  rows
    .map(
      (r) =>
        `Schedule ${r.id}; revision ${r.revision}; Role ${r.role_id}; ${r.status}\n${r.title}\n${r.instruction}\nNext: ${r.next_run_at ? formatLlmDateTime(r.next_run_at) : "none"}; timezone ${r.timezone}; recurrence ${r.recurrence ?? r.interval_days ?? "once"}${r.target_refs?.introductionRootId ? `; introduction ${r.target_refs.introductionRootId}` : `; effect tier ${r.effect_tier}; created by ${r.created_by}; ends ${r.expires_at ? formatLlmDateTime(r.expires_at) : "-"}${r.max_runs ? `; runs ${r.run_count}/${r.max_runs}` : ""}`}`
    )
    .join("\n\n") || "No company schedules.";
/** Harper's own schedules (not tied to an introduction) follow D15 limits. */
const GENERAL_LIMIT_MESSAGES: Record<string, string> = {
  company_schedule_tier_requires_user:
    "A schedule Harper makes on its own may only look again (effectTier 0) or propose (1). Searching, contacting or publishing (2) needs a company member to ask for it.",
  company_schedule_role_limit: "This Role already has 5 active Harper schedules. Cancel or update one first.",
  company_schedule_expiry_too_far: "A Harper schedule ends within 30 days of when it was made.",
  company_schedule_interval_too_short: "A Harper schedule repeats at most once a day.",
  company_schedule_creator_required: "Schedule creator is unknown.",
};

/**
 * A schedule change the server refuses (a limit, a stale revision, an invalid
 * value). The model can correct it, so the tool returns it to the model
 * instead of failing the whole run (companyTools maps it to a tool input error).
 */
export class CompanyScheduleInputError extends Error {
  override name = "CompanyScheduleInputError";
}

function scheduleLimitError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const known = Object.keys(GENERAL_LIMIT_MESSAGES).find((key) => message.includes(key));
  return known ? new CompanyScheduleInputError(GENERAL_LIMIT_MESSAGES[known]) : error;
}

/** Next run time; a recurrence or timezone the model got wrong is its input to fix. */
function occurrence(recurrence: string | null, timezone: string, interval: number | null) {
  try {
    return nextScheduleOccurrence(recurrence, timezone, new Date(), interval);
  } catch (error) {
    throw new CompanyScheduleInputError(`Invalid schedule recurrence or timezone: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Recurring Harper work runs at most once a day. */
function assertDailyAtMost(recurrence: string | null, timezone: string, interval: number | null) {
  if (interval != null) {
    if (interval < 1) throw new CompanyScheduleInputError(GENERAL_LIMIT_MESSAGES.company_schedule_interval_too_short);
    return;
  }
  if (!recurrence) return;
  let at = new Date();
  for (let index = 0; index < 6; index += 1) {
    const next = nextScheduleOccurrence(recurrence, timezone, at, null);
    if (!next) return;
    const nextAt = new Date(next);
    if (index > 0 && nextAt.getTime() - at.getTime() < 23 * 3_600_000)
      throw new CompanyScheduleInputError(GENERAL_LIMIT_MESSAGES.company_schedule_interval_too_short);
    at = nextAt;
  }
}

/**
 * user when a company member's own message started this run, agent when an
 * event (search result, decision, schedule) did. Decided from the stored
 * message, not from what the model says.
 */
async function scheduleCreator(
  q: (sql: string, params?: unknown[]) => Promise<any[]>,
  source: Exclude<AgentContactSource, { kind: "career" }>
): Promise<{ actor: "user" | "agent"; channel: "chat" | "slack" | null }> {
  if (source.kind !== "company") return { actor: "agent", channel: null };
  const [message] = await q(
    "SELECT role,message_type FROM public.company_messages WHERE id=$1 AND company_workspace_id=$2::uuid",
    [source.messageId, source.workspaceId]
  );
  return message?.role === "user" && ["chat", "slack"].includes(message.message_type)
    ? { actor: "user", channel: message.message_type }
    : { actor: "agent", channel: null };
}

export async function manageCompanySchedule(
  source: Exclude<AgentContactSource, { kind: "career" }>,
  input: Record<string, any>,
  key: string,
  db: Database = agentContactDatabase()
) {
  return db.transaction(async (q) => {
    const sourceRecord = await assertAgentContactSource(
      q,
      source,
      input.roleId
    );
    if (input.action === "list") {
      const rows = await q(
        "SELECT * FROM public.company_agent_schedules WHERE company_workspace_id=$1::uuid AND role_id=$2::uuid ORDER BY created_at,id",
        [source.workspaceId, input.roleId]
      );
      return { modelOutput: render(rows) };
    }
    await q("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `company-schedule:${source.workspaceId}:${input.scheduleId ?? key}`,
    ]);
    const [previous] = input.scheduleId
      ? await q(
          "SELECT * FROM public.company_agent_schedules WHERE id=$1::uuid AND company_workspace_id=$2::uuid AND role_id=$3::uuid FOR UPDATE",
          [input.scheduleId, source.workspaceId, input.roleId]
        )
      : await q(
          "SELECT * FROM public.company_agent_schedules WHERE company_workspace_id=$1::uuid AND operation_key=$2",
          [source.workspaceId, key]
        );
    if (previous && source.kind === "company_event") {
      const [invokingSchedule] = sourceRecord.action_context?.scheduleId
        ? await q(
            "SELECT target_refs FROM public.company_agent_schedules WHERE id=$1::uuid",
            [sourceRecord.action_context.scheduleId]
          )
        : [];
      const authorizedRoot =
        sourceRecord.action_context?.introductionRootId ??
        invokingSchedule?.target_refs?.introductionRootId;
      if (
        authorizedRoot &&
        previous.target_refs?.introductionRootId !== authorizedRoot
      )
        throw new CompanyScheduleInputError(
          "This introduction event cannot change another company's scheduled responsibility"
        );
    }
    if (input.action === "create" && previous)
      return { modelOutput: render([previous]) };
    if (
      input.action !== "create" &&
      (!previous || Number(previous.revision) !== input.expectedRevision)
    )
      throw new CompanyScheduleInputError("Schedule revision changed; reread before modifying");
    const timezone = input.timezone ?? previous?.timezone ?? "Asia/Seoul";
    try {
      new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
    } catch {
      throw new CompanyScheduleInputError(`Invalid timezone: ${timezone}`);
    }
    const recurrence =
      input.recurrence === undefined
        ? (previous?.recurrence ?? null)
        : input.recurrence;
    const interval =
      input.intervalDays === undefined
        ? (previous?.interval_days ?? null)
        : input.intervalDays;
    const next =
      input.nextRunAt ??
      previous?.next_run_at ??
      occurrence(recurrence, timezone, interval);
    if (
      input.action === "create" &&
      (!input.title?.trim() || !input.instruction?.trim() || !next)
    )
      throw new CompanyScheduleInputError("Title, instruction and next execution time required");
    if (next && !Number.isFinite(Date.parse(next)))
      throw new CompanyScheduleInputError("Invalid schedule timestamp");
    occurrence(recurrence, timezone, interval);
    const rootId =
      input.introductionRootId ?? previous?.target_refs?.introductionRootId;
    // Schedules tied to an introduction keep their #227 behavior; the others
    // carry an effect tier and the D15 limits (also enforced by the database).
    const general = !rootId;
    const { actor, channel } = await scheduleCreator(q, source);
    // The stored source says whether a member's own message drove this change;
    // only then is a cancellation recorded as the company's decision.
    const savedSource = source.kind === "company" ? { ...source, actor, ...(channel ? { channel } : {}) } : source;
    const createdBy = !general
      ? (previous?.created_by ?? actor)
      : input.action === "create" || !previous?.created_by
        ? actor
        : actor === "user" ? "user" : previous.created_by;
    const effectTier = general ? Number(input.effectTier ?? previous?.effect_tier ?? 0) : 2;
    if (general && ![0, 1, 2].includes(effectTier)) throw new CompanyScheduleInputError("effectTier must be 0, 1 or 2");
    if (general && createdBy === "agent" && effectTier > 1)
      throw new CompanyScheduleInputError(GENERAL_LIMIT_MESSAGES.company_schedule_tier_requires_user);
    if (general && input.action !== "pause" && input.action !== "cancel") assertDailyAtMost(recurrence, timezone, interval);
    const expiresAt = general ? (input.expiresAt ?? previous?.expires_at ?? null) : null;
    if (expiresAt && !Number.isFinite(Date.parse(expiresAt))) throw new CompanyScheduleInputError("Invalid schedule end time");
    const maxRuns = general ? (input.maxRuns === undefined ? (previous?.max_runs ?? null) : input.maxRuns) : null;
    if (rootId && !["pause", "cancel"].includes(input.action)) {
      const [root] = await q(
        "SELECT id,talent_id FROM public.agent_contact_messages WHERE id=$1::uuid AND root_id=id AND company_workspace_id=$2::uuid AND role_id=$3::uuid AND cancelled_at IS NULL",
        [rootId, source.workspaceId, input.roleId]
      );
      if (!root) throw new CompanyScheduleInputError("Schedule introduction unavailable");
      await assertAgentContactSource(q, source, input.roleId, root.talent_id);
    }
    const { sourceBudgetAnchor } = await import("./executionBudget");
    const budgetAnchor =
      (await sourceBudgetAnchor(q, source)) ??
      previous?.target_refs?.agentContactBudgetAnchor;
    const targets = {
      ...(rootId ? { introductionRootId: rootId } : {}),
      ...(budgetAnchor ? { agentContactBudgetAnchor: budgetAnchor } : {}),
    };
    const [invokingJob] =
      source.kind === "company_event"
        ? await q(
            "SELECT action_context FROM public.company_agent_web_action_jobs WHERE id=$1::uuid",
            [source.jobId]
          )
        : [];
    const changesOwnFuture = Boolean(
      previous && invokingJob?.action_context?.scheduleId === previous.id
    );
    const status =
      input.action === "cancel"
        ? "cancelled"
        : input.action === "pause"
          ? "paused"
          : "active";
    const [saved] = await (previous
      ? q(
          `UPDATE public.company_agent_schedules SET title=$2,instruction=$3,target_refs=$4::jsonb,timezone=$5,next_run_at=$6::timestamptz,recurrence=$7,interval_days=$8,status=$9,revision=revision+1,directive_revision=directive_revision+$11,source=$10::jsonb,effect_tier=$12,created_by=$13,expires_at=coalesce($14::timestamptz,expires_at),max_runs=$15,updated_at=now() WHERE id=$1::uuid RETURNING *`,
          [
            previous.id,
            input.title ?? previous.title,
            input.instruction ?? previous.instruction,
            JSON.stringify(targets),
            timezone,
            next,
            recurrence,
            interval,
            status,
            JSON.stringify(savedSource),
            changesOwnFuture ? 0 : 1,
            effectTier,
            createdBy,
            expiresAt,
            maxRuns,
          ]
        )
      : q(
          `INSERT INTO public.company_agent_schedules(company_workspace_id,role_id,title,instruction,target_refs,timezone,next_run_at,recurrence,interval_days,source,operation_key,effect_tier,created_by,expires_at,max_runs)
      VALUES($1::uuid,$2::uuid,$3,$4,$5::jsonb,$6,$7::timestamptz,$8,$9,$10::jsonb,$11,$12,$13,$14::timestamptz,$15) RETURNING *`,
          [
            source.workspaceId,
            input.roleId,
            input.title,
            input.instruction,
            JSON.stringify(targets),
            timezone,
            next,
            recurrence,
            interval,
            JSON.stringify(savedSource),
            key,
            effectTier,
            createdBy,
            expiresAt,
            maxRuns,
          ]
        )).catch((error) => {
          throw scheduleLimitError(error);
        });
    return { status: "saved", modelOutput: render([saved]) };
  });
}
export async function enqueueDueCompanyAgentSchedules(
  db: Database = agentContactDatabase()
) {
  return db.transaction(async (q) => {
    // Harper's own schedules end at their end time or run count.
    await q(`UPDATE public.company_agent_schedules SET status='expired',next_run_at=NULL,revision=revision+1,updated_at=now()
      WHERE status='active' AND NOT coalesce(target_refs,'{}'::jsonb) ? 'introductionRootId'
        AND ((expires_at IS NOT NULL AND expires_at<=now()) OR (max_runs IS NOT NULL AND run_count>=max_runs))`);
    const rows =
      await q(`SELECT s.* FROM public.company_agent_schedules s WHERE s.status='active' AND s.next_run_at<=now()
      AND NOT EXISTS(SELECT 1 FROM public.company_agent_web_action_jobs j WHERE j.id=s.last_job_id AND j.status IN ('queued','retry','processing'))
      ORDER BY s.next_run_at,s.id FOR UPDATE OF s SKIP LOCKED LIMIT 100`);
    let enqueued = 0;
    for (const row of rows) {
      if (!row.target_refs?.introductionRootId) {
        // At most 20 runs a day per company from Harper's own schedules (KST day).
        const [today] = await q(
          `SELECT count(*)::int AS n FROM public.company_agent_web_action_jobs j
          JOIN public.company_agent_schedules s ON s.id::text=j.action_context->>'scheduleId'
          WHERE j.company_workspace_id=$1::uuid AND j.action_name='agent_schedule_due'
            AND NOT coalesce(s.target_refs,'{}'::jsonb) ? 'introductionRootId'
            AND j.created_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul')`,
          [row.company_workspace_id]
        );
        if (Number(today?.n ?? 0) >= 20) {
          await q(
            `UPDATE public.company_agent_schedules SET next_run_at=((date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') + interval '1 day') AT TIME ZONE 'Asia/Seoul'),updated_at=now() WHERE id=$1::uuid`,
            [row.id]
          );
          continue;
        }
      }
      if (row.target_refs?.introductionRootId) {
        const [root] = await q(
          `SELECT m.* FROM public.agent_contact_messages m
          JOIN public.talent_opportunity_recommendation r ON r.agent_introduction_root_id=m.id
          WHERE m.id=$1::uuid AND m.id=m.root_id AND m.cancelled_at IS NULL AND r.feedback='like'`,
          [row.target_refs.introductionRootId]
        );
        let available = Boolean(root);
        if (root) {
          try {
            await assertAgentContactPair(q, root as AgentContactMessage);
          } catch (error) {
            if (error instanceof AgentContactSupersededError) available = false;
            else throw error;
          }
        }
        if (!available) {
          await q(
            "UPDATE public.company_agent_schedules SET status=$2,next_run_at=NULL,revision=revision+1,directive_revision=directive_revision+1,updated_at=now() WHERE id=$1::uuid",
            [row.id, root ? "paused" : "cancelled"]
          );
          continue;
        }
      }
      const [job] = await q(
        "SELECT public.enqueue_agent_company_event_v1($1::uuid,$2::uuid,$3,$4::jsonb) AS id",
        [
          row.company_workspace_id,
          row.role_id,
          `schedule:${row.id}:${row.directive_revision}:${new Date(row.next_run_at).toISOString()}`,
          JSON.stringify({
            scheduleId: row.id,
            scheduleRevision: row.directive_revision,
            agentContactBudgetAnchor: row.target_refs?.agentContactBudgetAnchor,
          }),
        ]
      );
      const next = nextScheduleOccurrence(
        row.recurrence,
        row.timezone,
        new Date(),
        row.interval_days
      );
      await q(
        "UPDATE public.company_agent_schedules SET last_job_id=$2::uuid,next_run_at=$3::timestamptz,run_count=run_count+1,revision=revision+1,updated_at=now() WHERE id=$1::uuid",
        [row.id, job.id, next]
      );
      enqueued++;
    }
    return enqueued;
  });
}
