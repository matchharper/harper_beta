import { createOperation, readOperation, type ExternalToolContext, type ExternalOperation } from "./store";

export class CareerEffectWaiting extends Error {
  constructor(readonly invocationId: string) { super("A newer user instruction is being handled before this external action."); }
}

export async function withEffectWaiting<T>(execute: () => Promise<T>) {
  try { return await execute(); }
  catch (error) {
    if (!(error instanceof CareerEffectWaiting)) throw error;
    return { ok: false, careerContinuation: { kind: "career_input", id: error.invocationId }, modelOutput: error.message };
  }
}

/** One responsibility/effect identity spans source messages, revisions and transports. */
export async function reserveWorkEffect(context: ExternalToolContext, key: string | undefined, snapshot: Record<string, unknown>) {
  if (!context.workId) return undefined;
  if (!key?.trim()) throw new Error("An external effect requires a stable effect_key within this work. Reuse it across retries and route changes.");
  let effect = await createOperation(context, { kind: "work_effect", parentId: context.workId,
    idempotencyKey: `${context.workId}:${key}`, request: { snapshot } });
  const bound = await readBoundEffect(context, effect);
  if (bound?.kind === "browser_run" && bound.status === "capacity_wait" && bound.result.dispatch_rejected_http === 429) {
    const { error } = await (context.admin.rpc as any)("release_rejected_career_effect", {
      p_user_id: context.userId, p_effect_id: effect.id, p_operation_id: bound.id,
    });
    if (error) throw error;
    effect = (await readOperation(context, effect.id))!;
  }
  return effect;
}

export async function readBoundEffect(context: ExternalToolContext, effect?: ExternalOperation) {
  const id = effect?.result.operation_id;
  if (typeof id !== "string") return undefined;
  const operation = await readOperation(context, id);
  if (!operation) throw new Error("External effect receipt unavailable; do not dispatch again.");
  return operation;
}

export async function bindWorkEffect(context: ExternalToolContext, effect: ExternalOperation | undefined, operation: ExternalOperation) {
  if (!effect) return;
  // The revision CAS is the cross-channel dispatch fence. Losing it must stop
  // before either provider receives an irreversible request.
  const { data, error } = await (context.admin.rpc as any)("bind_career_work_effect", {
    p_user_id: context.userId, p_conversation_id: context.conversationId, p_work_id: context.workId,
    p_effect_id: effect.id, p_effect_revision: effect.revision, p_operation_id: operation.id,
    p_work_revision: context.workRevision, p_claim_id: context.claimId,
  });
  if (error) throw new Error(error.message);
  if (data?.waiting) throw new CareerEffectWaiting(data.waiting);
}
