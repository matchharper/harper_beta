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
        `Schedule ${r.id}; revision ${r.revision}; Role ${r.role_id}; ${r.status}\n${r.title}\n${r.instruction}\nNext: ${r.next_run_at ? formatLlmDateTime(r.next_run_at) : "none"}; timezone ${r.timezone}; recurrence ${r.recurrence ?? r.interval_days ?? "once"}${r.target_refs?.introductionRootId ? `; introduction ${r.target_refs.introductionRootId}` : ""}`
    )
    .join("\n\n") || "No company schedules.";
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
        throw new Error(
          "This introduction event cannot change another company's scheduled responsibility"
        );
    }
    if (input.action === "create" && previous)
      return { modelOutput: render([previous]) };
    if (
      input.action !== "create" &&
      (!previous || Number(previous.revision) !== input.expectedRevision)
    )
      throw new Error("Schedule revision changed; reread before modifying");
    const timezone = input.timezone ?? previous?.timezone ?? "Asia/Seoul";
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
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
      nextScheduleOccurrence(recurrence, timezone, new Date(), interval);
    if (
      input.action === "create" &&
      (!input.title?.trim() || !input.instruction?.trim() || !next)
    )
      throw new Error("Title, instruction and next execution time required");
    if (next && !Number.isFinite(Date.parse(next)))
      throw new Error("Invalid schedule timestamp");
    nextScheduleOccurrence(recurrence, timezone, new Date(), interval);
    const rootId =
      input.introductionRootId ?? previous?.target_refs?.introductionRootId;
    if (rootId && !["pause", "cancel"].includes(input.action)) {
      const [root] = await q(
        "SELECT id,talent_id FROM public.agent_contact_messages WHERE id=$1::uuid AND root_id=id AND company_workspace_id=$2::uuid AND role_id=$3::uuid AND cancelled_at IS NULL",
        [rootId, source.workspaceId, input.roleId]
      );
      if (!root) throw new Error("Schedule introduction unavailable");
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
    const [saved] = previous
      ? await q(
          `UPDATE public.company_agent_schedules SET title=$2,instruction=$3,target_refs=$4::jsonb,timezone=$5,next_run_at=$6::timestamptz,recurrence=$7,interval_days=$8,status=$9,revision=revision+1,directive_revision=directive_revision+$11,source=$10::jsonb,updated_at=now() WHERE id=$1::uuid RETURNING *`,
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
            JSON.stringify(source),
            changesOwnFuture ? 0 : 1,
          ]
        )
      : await q(
          `INSERT INTO public.company_agent_schedules(company_workspace_id,role_id,title,instruction,target_refs,timezone,next_run_at,recurrence,interval_days,source,operation_key)
      VALUES($1::uuid,$2::uuid,$3,$4,$5::jsonb,$6,$7::timestamptz,$8,$9,$10::jsonb,$11) RETURNING *`,
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
            JSON.stringify(source),
            key,
          ]
        );
    return { status: "saved", modelOutput: render([saved]) };
  });
}
export async function enqueueDueCompanyAgentSchedules(
  db: Database = agentContactDatabase()
) {
  return db.transaction(async (q) => {
    const rows =
      await q(`SELECT s.* FROM public.company_agent_schedules s WHERE s.status='active' AND s.next_run_at<=now()
      AND NOT EXISTS(SELECT 1 FROM public.company_agent_web_action_jobs j WHERE j.id=s.last_job_id AND j.status IN ('queued','retry','processing'))
      ORDER BY s.next_run_at,s.id FOR UPDATE OF s SKIP LOCKED LIMIT 100`);
    let enqueued = 0;
    for (const row of rows) {
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
        "UPDATE public.company_agent_schedules SET last_job_id=$2::uuid,next_run_at=$3::timestamptz,revision=revision+1,updated_at=now() WHERE id=$1::uuid",
        [row.id, job.id, next]
      );
      enqueued++;
    }
    return enqueued;
  });
}
