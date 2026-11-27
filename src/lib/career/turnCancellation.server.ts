import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { TOOL_RUNTIME_CONTROL } from "@/lib/llm/toolError";
import { isCareerTurnStopped } from "./turnCancellation";
import { internalEvaluationBackend } from "./matching/internalScoring/backend";
import { EXECUTOR } from "./matching/internalScoring/repository";

/**
 * Why a request's execution ends. "stopped": the user pressed Stop, the work was cancelled or the account deleted.
 * "revised": the delegated work it serves got a newer instruction, which a newer execution carries out.
 */
export type CareerTurnStop = "stopped" | "revised";

export class CareerTurnCancelled extends Error {
  readonly [TOOL_RUNTIME_CONTROL] = true;
  constructor(readonly reason: CareerTurnStop = "stopped") {
    super(reason === "revised" ? "This work was revised; its newer instruction continues it." : "The user stopped this request.");
    this.name = "AbortError";
  }
}

type TurnScope = {
  admin: TalentAdminClient;
  userId: string;
  conversationId: string;
  sourceMessageId?: number | null;
  replyId?: string;
  workId?: string;
  workRevision?: number;
};

export async function careerTurnIsStopped(scope: TurnScope): Promise<boolean> {
  return (await careerTurnStopReason(scope)) !== null;
}

/** Why this request must end, or null while it may continue. A user Stop outranks a revision. */
export async function careerTurnStopReason(scope: TurnScope): Promise<CareerTurnStop | null> {
  // All reads are scoped observations. Start them together, while retaining
  // the same account/work/Stop precedence and checking afresh at each boundary.
  const sourceRead = scope.sourceMessageId ? Promise.resolve(scope.admin.from("talent_messages").select("payload")
    .eq("id", scope.sourceMessageId).eq("user_id", scope.userId)
    .eq("conversation_id", scope.conversationId).eq("role", "user").maybeSingle()) : undefined;
  const workRead = scope.workId ? Promise.resolve((scope.admin.from as any)("talent_external_operations").select("status,revision")
    .eq("id", scope.workId).eq("user_id", scope.userId).eq("kind", "delegated_work").maybeSingle()) : undefined;
  void sourceRead?.catch(() => undefined);
  void workRead?.catch(() => undefined);
  const account = await scope.admin.from("talent_users").select("deleted_at").eq("user_id", scope.userId).maybeSingle();
  if (account.error) throw account.error;
  if (account.data?.deleted_at) return "stopped";
  let revised = false;
  if (workRead) {
    const { data, error } = await workRead;
    if (error) throw error;
    if (!data || data.status === "cancelled") return "stopped";
    revised = scope.workRevision !== undefined && data.revision !== scope.workRevision && data.status !== "waiting" && data.status !== "completed";
  }
  const revision = revised ? "revised" as const : null;
  if (!scope.sourceMessageId) {
    if (!scope.replyId || scope.workId) return revision;
    const { data, error } = await (scope.admin.from as any)("talent_agent_runtime").select("state")
      .eq("user_id", scope.userId).eq("conversation_id", scope.conversationId).maybeSingle();
    if (error) throw error;
    return data?.state?.completedReplyIds?.[scope.replyId] !== undefined ? "stopped" : revision;
  }
  const { data, error } = await sourceRead!;
  if (error) throw error;
  return !data || isCareerTurnStopped(data.payload) ? "stopped" : revision;
}

export async function assertCareerTurnActive(scope: TurnScope & { signal?: AbortSignal }) {
  scope.signal?.throwIfAborted();
  const reason = await careerTurnStopReason(scope);
  if (reason) throw new CareerTurnCancelled(reason);
  scope.signal?.throwIfAborted();
}

/** The DB flag survives queue delivery and server changes. Poll only while a
 * request owns execution; execution boundaries also check it immediately.
 * A Stop aborts what is in flight. A revision ends the execution at its next step
 * (check) instead: an external action already under way, such as a browser
 * submitting an application, finishes and leaves its receipt for the newer
 * execution rather than being cut off with an unknown outcome. */
export function watchCareerTurnCancellation(scope: TurnScope, signal?: AbortSignal) {
  const controller = new AbortController();
  const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const check = async () => {
    try { await assertCareerTurnActive({ ...scope, signal: combined }); }
    catch (error) {
      if (error instanceof CareerTurnCancelled && error.reason === "stopped") controller.abort(error);
      throw error;
    }
  };
  const poll = async () => {
    if (combined.aborted) return;
    try {
      const reason = await careerTurnStopReason(scope);
      if (reason === "stopped") controller.abort(new CareerTurnCancelled(reason));
    } catch {
      if (combined.aborted) return;
      // A failed observation is not a user Stop. Immediate execution checks
      // still surface the database error before any subsequent action.
      console.warn("[career-stop] Cancellation observation unavailable", { sourceMessageId: scope.sourceMessageId });
    }
    if (!disposed && !combined.aborted) timer = setTimeout(poll, 2000);
  };
  if (scope.sourceMessageId || scope.replyId) timer = setTimeout(poll, 2000);
  const dispose = () => { disposed = true; clearTimeout(timer); };
  combined.addEventListener("abort", dispose, { once: true });
  return { signal: combined, check, dispose: () => {
    dispose(); combined.removeEventListener("abort", dispose);
  } };
}

/** Reuse the executors' existing cancellation contracts. Completed results and
 * previously created schedules/settings are deliberately untouched. */
export async function cancelCareerTurnWork(scope: TurnScope) {
  if (!scope.sourceMessageId && !scope.replyId) return;
  const replyId = scope.replyId ?? `message:${scope.sourceMessageId}`;
  const [external, internal] = await Promise.all([
    scope.admin.from("external_recommendation_runs").update({
      cancelled_at: new Date().toISOString(), status: "cancelled",
    }).eq("talent_id", scope.userId).eq("conversation_id", scope.conversationId)
      .eq("variant", "career_agent").eq("request->>replyId", replyId)
      .in("status", ["queued", "running"]),
    scope.admin.from("opportunity_discovery_run").select("id,trigger_payload")
      .eq("talent_id", scope.userId).eq("conversation_id", scope.conversationId)
      .eq("trigger", "career_internal_evaluation").eq("trigger_payload->>parentReplyId", replyId)
      .in("status", ["queued", "running", "handed_off"]),
  ]);
  if (external.error) throw external.error;
  if (internal.error) throw internal.error;
  for (const run of internal.data ?? []) {
    if ((run.trigger_payload as { executor?: string } | null)?.executor === EXECUTOR) {
      await internalEvaluationBackend.control(scope.userId, run.id, "cancel");
      continue;
    }
    const { error } = await scope.admin.rpc("control_career_internal_evaluation" as never,
      { p_talent: scope.userId, p_run: run.id, p_action: "cancel" } as never);
    if (error) throw error;
  }
}
