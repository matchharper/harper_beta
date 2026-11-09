import { readCareerTurnEvents, type CareerTurnEvent } from "../turnDisplay";
import type { CareerReplyCheckpoint } from "../capabilities/runtime";
import type { WorkScope } from "./store";

export type CareerWorkActivity = { id: string; ownerReplyId?: string; logs: string[]; events?: CareerTurnEvent[]; createdAt?: string; startedAt?: string };

/** Only public tool labels used by chat SSE; never the saved model transcript. */
export function projectCareerWorkActivity(row: {
  id: string;
  created_at?: string;
  request?: { cleanup?: boolean; cleanup_browser_session?: string };
  result?: { activity?: { logs?: unknown; events?: unknown; startedAt?: string; waitingForReply?: boolean } };
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
      events: row.result?.activity?.events === undefined ? undefined : readCareerTurnEvents(row.result.activity.events),
      ...(row.created_at ? { createdAt: row.created_at } : {}),
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
  invocationId: string,
  browserControlReturns: Array<{ session_id: string; revision: number }> = [],
) {
  let attemptId: string | undefined;
  let logs: string[] = [];
  let events: CareerTurnEvent[] = [];
  let startedAt: string;
  let writes = Promise.resolve();
  const save = (waitingForReply: boolean) => {
    if (!attemptId) return writes;
    const activity = { attemptId, startedAt, logs: [...logs], events: [...events], waitingForReply,
      ...(browserControlReturns.length ? { browserControlReturns } : {}) };
    writes = writes
      .then(async () => {
        const { error } = await (scope.admin.rpc as any)("record_career_invocation_progress", {
          p_user_id: scope.userId, p_conversation_id: scope.conversationId,
          p_invocation_id: invocationId, p_claim_id: activity.attemptId, p_patch: { activity },
        });
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
      return save(false);
    },
    record(nextLogs: string[]) {
      events = nextLogs.map((text, index) => events[index]?.text === text ? events[index] : {
        id: `delegate:${invocationId}:${index}`, kind: "tool", text, createdAt: new Date().toISOString(),
      });
      logs = [...nextLogs];
      void save(false);
    },
    checkpoint(checkpoint: CareerReplyCheckpoint) {
      return save(
        Boolean(
          checkpoint.waitFor?.some((wait) => ["career_input", "browser_control"].includes(wait.kind))
        )
      );
    },
    flush() {
      return writes;
    },
  };
}
