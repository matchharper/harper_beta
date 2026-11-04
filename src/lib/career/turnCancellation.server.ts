import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { TOOL_RUNTIME_CONTROL } from "@/lib/llm/toolError";
import { isCareerTurnStopped } from "./turnCancellation";
import { internalEvaluationBackend } from "./matching/internalScoring/backend";
import { EXECUTOR } from "./matching/internalScoring/repository";

export class CareerTurnCancelled extends Error {
  readonly [TOOL_RUNTIME_CONTROL] = true;
  constructor() { super("The user stopped this request."); this.name = "AbortError"; }
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
  const account = await scope.admin.from("talent_users").select("deleted_at").eq("user_id", scope.userId).maybeSingle();
  if (account.error) throw account.error;
  if (account.data?.deleted_at) return true;
  if (scope.workId) {
    const { data, error } = await (scope.admin.from as any)("talent_external_operations").select("status,revision")
      .eq("id", scope.workId).eq("user_id", scope.userId).eq("kind", "delegated_work").maybeSingle();
    if (error) throw error;
    if (!data || data.status === "cancelled" || (scope.workRevision !== undefined && data.revision !== scope.workRevision && data.status !== "waiting" && data.status !== "completed")) return true;
  }
  if (!scope.sourceMessageId) return false;
  const { data, error } = await scope.admin.from("talent_messages").select("payload")
    .eq("id", scope.sourceMessageId).eq("user_id", scope.userId)
    .eq("conversation_id", scope.conversationId).eq("role", "user").maybeSingle();
  if (error) throw error;
  return isCareerTurnStopped(data?.payload);
}

export async function assertCareerTurnActive(scope: TurnScope & { signal?: AbortSignal }) {
  scope.signal?.throwIfAborted();
  if (await careerTurnIsStopped(scope)) throw new CareerTurnCancelled();
  scope.signal?.throwIfAborted();
}

/** The DB flag survives queue delivery and server changes. Poll only while a
 * request owns execution; execution boundaries also check it immediately. */
export function watchCareerTurnCancellation(scope: TurnScope, signal?: AbortSignal) {
  const controller = new AbortController();
  const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const check = async () => {
    try { await assertCareerTurnActive({ ...scope, signal: combined }); }
    catch (error) {
      if (error instanceof CareerTurnCancelled) controller.abort(error);
      throw error;
    }
  };
  const poll = async () => {
    try { await check(); }
    catch {
      if (combined.aborted) return;
      // A failed observation is not a user Stop. Immediate execution checks
      // still surface the database error before any subsequent action.
      console.warn("[career-stop] Cancellation observation unavailable", { sourceMessageId: scope.sourceMessageId });
    }
    if (!disposed && !combined.aborted) timer = setTimeout(poll, 2000);
  };
  if (scope.sourceMessageId) timer = setTimeout(poll, 2000);
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
