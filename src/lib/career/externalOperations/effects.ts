import { createOperation, readOperation, type ExternalToolContext, type ExternalOperation } from "./store";
import { resourceDb, databaseError } from "../resources/types";
import { readWork } from "../work/store";
import { readOpportunity } from "../opportunities/store";

export const effectReferenceProperties={
  responsibility_ref:{type:"object",properties:{id:{type:"string"},revision:{type:"integer"}},required:["id","revision"],additionalProperties:false,
    description:"Existing responsibility and observed revision. Current work is executed only by its origin conversation; another conversation updates that work."},
  opportunity_id:{type:"string",description:"Owned stable opportunity identity for reuse of this effect across conversations and transports."},
  effect_ref:{type:"string",description:"Exact existing work_effect receipt to inspect/reuse; never replace an unresolved dispatch with a new identity."},
};

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
  if (!context.workId && !context.claimId) return undefined;
  if (!key?.trim()) throw new Error("An external effect requires a stable effect_key for this purpose and target. Reuse it across retries, replies and route changes.");
  const responsibilityId=context.responsibilityId??context.workId;
  if(responsibilityId){
    const work=await readWork(context,responsibilityId);
    if(work.revision!==(context.responsibilityRevision??context.workRevision)||["completed","cancelled"].includes(work.status))throw new Error("Responsibility changed before external action.");
    if(work.conversation_id!==context.conversationId || (work.request.execution_route!=="origin"&&context.workId!==work.id))
      throw new Error("Update this responsibility in its original execution; this conversation does not own its effects.");
  }
  if(context.opportunityId)context.opportunityId=(await readOpportunity(context,context.opportunityId)).id;
  let effect:ExternalOperation;
  if(context.effectRef){
    const existing=await readOperation(context,context.effectRef);
    if(!existing||existing.kind!=="work_effect")throw new Error("Effect receipt unavailable.");
    if(!existing.result.operation_id && existing.request.effect_key!==key)throw new Error("Effect purpose does not match this request.");
    effect=existing;
  }else{
    const prior=context.opportunityId?await resourceDb(context.admin).rpc("career_find_opportunity_effect_v1",{p_user:context.userId,p_opportunity:context.opportunityId,p_key:key}):null;
    if(prior)databaseError(prior.error);
    effect=prior?.data ? (await readOperation(context,String(prior.data)))! : await createOperation(context, { kind: "work_effect", parentId: responsibilityId,
      idempotencyKey: `${context.opportunityId??responsibilityId??context.conversationId}:${key}`, request: { snapshot,effect_key:key,
        responsibility_id:responsibilityId??null,opportunity_id:context.opportunityId??null } });
  }
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
  const currentResponsibility=context.responsibilityId&&!context.workId;
  const { data, error } = await resourceDb(context.admin).rpc(currentResponsibility?"bind_career_origin_effect_v1":context.workId ? "bind_career_work_effect" : "bind_career_conversation_effect", {
    p_user_id: context.userId, p_conversation_id: context.conversationId,
    p_effect_id: effect.id, p_effect_revision: effect.revision, p_operation_id: operation.id,
    ...(currentResponsibility?{p_work_id:context.responsibilityId,p_work_revision:context.responsibilityRevision,p_reply_id:context.replyId,p_source_message_id:context.userMessageId??null}:context.workId
      ? { p_work_id: context.workId, p_work_revision: context.workRevision }
      : { p_reply_id: context.replyId, p_source_message_id: context.userMessageId ?? null }),
    p_claim_id: context.claimId,
  });
  if (error) throw new Error(error.message);
  if (data?.waiting) throw new CareerEffectWaiting(data.waiting);
}
