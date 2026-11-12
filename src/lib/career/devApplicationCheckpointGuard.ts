import { canonicalRows } from "./devCheckpointData";
export const APPLICATION_CHECKPOINT_GUARDS = {
  contact_queue: "user_id",
  career_email_messages: "talent_id",
  email_reply_jobs: "talent_id",
  talent_opportunity_delivery: "talent_id",
  org_intro_email_threads: "talent_id",
  meeting_schedules: "talent_id",
  talent_agent_schedules: "talent_id",
  career_daily_sources: "talent_id",
};

const equal = (a: Record<string, unknown>[], b: Record<string, unknown>[]) =>
  JSON.stringify(canonicalRows(a)) === JSON.stringify(canonicalRows(b));
/** These kinds have no irreversible effect of their own. Execute-mode browser
 * and send tools reserve a work_effect or their own delivery operation first. */
export function assertApplicationOperationsQuiescent(
  current: Record<string, any>[],
  baseline: Record<string, any>[]
) {
  for (const row of current) {
    if (row.kind === "browser_session" && row.status !== "closed")
      throw new Error("지원 브라우저를 종료한 뒤 복원해 주세요.");
    if (
      [
        "career_invocation",
        "career_dependency",
        "career_event",
        "delegated_work",
        "browser_run",
      ].includes(row.kind) &&
      !["completed", "cancelled", "failed"].includes(row.status)
    )
      throw new Error("진행 중인 작업이 있어 복원할 수 없습니다.");
    if (
      equal(
        [row],
        baseline.filter((old) => old.id === row.id)
      )
    )
      continue;
    // Immutable PDF exports and pinned attachment bytes are preparation caches,
    // not deliveries. Their send/submit receipts live in separate operations.
    if (["pdf_artifact", "attachment_snapshot"].includes(row.kind) && row.status === "ready")
      continue;
    // write_career_company_follow changes only the owned follow row and its
    // idempotency receipt, both restored in the same checkpoint transaction.
    // Any later delivery/schedule is still protected by its separate guard.
    if (row.kind === "career_follow_mutation" && row.status === "completed")
      continue;
    if (
      ![
        "career_invocation",
        "career_dependency",
        "career_event",
        "delegated_work",
        "browser_session",
        "browser_run",
      ].includes(row.kind)
    )
      throw new Error(
        `외부 실행 또는 별도 작업 기록이 바뀌어 복원하지 않았습니다 (${row.kind}).`
      );
    if (row.kind === "browser_session" && row.result?.control_source === "user")
      throw new Error(
        "사용자가 직접 조작한 외부 브라우저 기록은 되돌릴 수 없습니다."
      );
  }
  for (const row of baseline)
    if (!current.some((item) => item.id === row.id))
      throw new Error("기준 실행 기록이 없어 복원을 중단했습니다.");
}

export function assertCheckpointRuntimeIdle(
  runtime: Record<string, unknown>[],
  workRuntime: Record<string, unknown>[]
) {
  if ([...runtime, ...workRuntime].some((row) => {
    const state = row.state as Record<string, unknown> | undefined;
    return state?.activeReply ||
      Object.keys(state?.checkpoints ?? {}).length ||
      state?.checkpoint;
  })) {
    throw new Error("대화 작업이 진행 중이거나 재개 대기 중입니다. 먼저 종료해 주세요.");
  }
}
