import type { CareerReplyCheckpoint } from "../capabilities/runtime";
import type { WorkScope } from "./store";

export type CareerWorkActivity = { id: string; logs: string[]; startedAt?: string };

/** Only public tool labels used by chat SSE; never the saved model transcript. */
export function projectCareerWorkActivity(row: {
  id: string;
  request?: { cleanup?: boolean; cleanup_browser_session?: string };
  result?: { activity?: { logs?: unknown; startedAt?: string; waitingForReply?: boolean } };
}): CareerWorkActivity[] {
  if (
    row.request?.cleanup ||
    row.request?.cleanup_browser_session ||
    row.result?.activity?.waitingForReply
  )
    return [];
  const logs = row.result?.activity?.logs;
  return [
    {
      id: row.id,
      ...(row.result?.activity?.startedAt ? { startedAt: row.result.activity.startedAt } : {}),
      logs: Array.isArray(logs)
        ? logs.filter((log): log is string => typeof log === "string")
        : [],
    },
  ];
}

/** Serialize progress writes and fence late callbacks from a previous execution attempt. */
export function createCareerInvocationActivity(
  scope: WorkScope,
  invocationId: string
) {
  let attemptId: string | undefined;
  let logs: string[] = [];
  let startedAt: string;
  let writes = Promise.resolve();
  const save = (waitingForReply: boolean, starting = false) => {
    if (!attemptId) return writes;
    const activity = { attemptId, startedAt, logs: [...logs], waitingForReply };
    writes = writes
      .then(async () => {
        let query = (scope.admin.from as any)("talent_external_operations")
          .update({ result: { activity } })
          .eq("id", invocationId)
          .eq("user_id", scope.userId)
          .eq("conversation_id", scope.conversationId)
          .neq("status", "completed");
        if (!starting)
          query = query.eq("result->activity->>attemptId", activity.attemptId);
        const { error } = await query;
        if (error) throw error;
      })
      .catch((error) => {
        // A display failure must not replay model work or an external effect.
        console.warn(
          "[career] Could not save invocation activity",
          invocationId,
          error
        );
      });
    return writes;
  };
  return {
    start(claimId: string) {
      attemptId = claimId;
      startedAt = new Date().toISOString();
      return save(false, true);
    },
    record(nextLogs: string[]) {
      logs = nextLogs;
      void save(false);
    },
    checkpoint(checkpoint: CareerReplyCheckpoint) {
      return save(
        Boolean(
          checkpoint.waitFor?.some((wait) => wait.kind === "career_input")
        )
      );
    },
    flush() {
      return writes;
    },
  };
}
