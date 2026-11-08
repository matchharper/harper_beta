import "server-only";
import type { User } from "@supabase/supabase-js";
import { agentContactDatabase } from "@/lib/agentContacts/store";
import type { Database } from "@/lib/career/matching/internalScoring/database";
import { OrgHttpError } from "./httpError";

/**
 * A company member cancels Harper's scheduled work from the To-do. The
 * database records it as a company decision (agent_schedule cancel, channel
 * todo). Schedules tied to an introduction are managed in that correspondence.
 *
 * The cancel applies to the schedule as it is now. The scheduler raises
 * revision each time it starts a run, so the revision the To-do showed is
 * often old; it is not compared. Stopping is safe on any version, and the
 * bumped directive_revision ends a queued or running job.
 */
export async function cancelHarperScheduleFromTodo(
  args: {
    user: Pick<User, "id">;
    workspaceId: string;
    roleId: string;
    scheduleId: string;
    /** The revision the To-do showed; kept for the route, not compared. */
    expectedRevision?: number;
  },
  db: Database = agentContactDatabase()
) {
  const scope = [args.scheduleId, args.workspaceId, args.roleId];
  const rows = await db.query(
    `UPDATE public.company_agent_schedules
    SET status='cancelled', next_run_at=NULL, revision=revision+1, directive_revision=directive_revision+1,
      source=$4::jsonb, updated_at=now()
    WHERE id=$1::uuid AND company_workspace_id=$2::uuid AND role_id=$3::uuid
      AND status IN ('active','paused') AND NOT coalesce(target_refs,'{}'::jsonb) ? 'introductionRootId'
    RETURNING id`,
    [...scope, JSON.stringify({ kind: "company", workspaceId: args.workspaceId, userId: args.user.id, channel: "todo" })]
  );
  if (rows.length) return { ok: true as const };
  const [current] = await db.query(
    `SELECT status FROM public.company_agent_schedules
    WHERE id=$1::uuid AND company_workspace_id=$2::uuid AND role_id=$3::uuid
      AND NOT coalesce(target_refs,'{}'::jsonb) ? 'introductionRootId'`,
    scope
  );
  if (!current) throw new OrgHttpError(404, "예약을 찾지 못했어요.");
  throw new OrgHttpError(409, current.status === "cancelled" ? "이미 취소된 예약이에요." : "이미 끝난 예약이에요.");
}
