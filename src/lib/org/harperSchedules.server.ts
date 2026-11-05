import "server-only";
import type { User } from "@supabase/supabase-js";
import { agentContactDatabase } from "@/lib/agentContacts/store";
import type { Database } from "@/lib/career/matching/internalScoring/database";
import { OrgHttpError } from "./httpError";

/**
 * A company member cancels Harper's scheduled work from the To-do. The
 * database records it as a company decision (agent_schedule cancel, channel
 * todo). Schedules tied to an introduction are managed in that correspondence.
 */
export async function cancelHarperScheduleFromTodo(
  args: {
    user: Pick<User, "id">;
    workspaceId: string;
    roleId: string;
    scheduleId: string;
    expectedRevision: number;
  },
  db: Database = agentContactDatabase()
) {
  const rows = await db.query(
    `UPDATE public.company_agent_schedules
    SET status='cancelled', next_run_at=NULL, revision=revision+1, directive_revision=directive_revision+1,
      source=$5::jsonb, updated_at=now()
    WHERE id=$1::uuid AND company_workspace_id=$2::uuid AND role_id=$3::uuid AND revision=$4
      AND status IN ('active','paused') AND NOT coalesce(target_refs,'{}'::jsonb) ? 'introductionRootId'
    RETURNING id`,
    [
      args.scheduleId,
      args.workspaceId,
      args.roleId,
      args.expectedRevision,
      JSON.stringify({ kind: "company", workspaceId: args.workspaceId, userId: args.user.id, channel: "todo" }),
    ]
  );
  if (!rows.length) throw new OrgHttpError(409, "그사이 예약이 바뀌었어요. 다시 확인해 주세요.");
  return { ok: true as const };
}
