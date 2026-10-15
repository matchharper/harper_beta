import type { SessionRecord } from "./sessionStore";
import { pendingApplicationBatch, finishApplicationAnswer } from "./applicationInput";
import { respondToPreparation, type PreparationResponse } from "./preparation";
export type LocalQuestionAnswers = {batchId: string; responses: Record<string, PreparationResponse>; clearedItemIds?: string[]; currentItemId?: string; showInputs?: boolean; requestId: string};
export function projectLocalAnswers(record: SessionRecord, local: LocalQuestionAnswers | null): SessionRecord {
  if (!local || pendingApplicationBatch(record.state)?.id !== local.batchId) return record;
  const state=structuredClone(record.state);
  const batch=pendingApplicationBatch(state)!;
  for (const id of batch.itemIds) {
    if (local.clearedItemIds?.includes(id)) {
      delete state.preparation!.responses[id];
      const action=state.actions.find(a=>a.id===id);
      if(action) {action.status="pending";action.evidenceMessageId=null;}
    }
    if (local.responses[id]) state.preparation=respondToPreparation(state.preparation!,state.actions,id,local.responses[id]);
  }
  const next=finishApplicationAnswer(state);
  if (next.preparation && batch.itemIds.includes(local.currentItemId ?? "")) next.preparation.currentItemId=local.currentItemId!;
  if (next.preparation && pendingApplicationBatch(next)?.id === local.batchId && local.showInputs !== undefined) next.preparation.showInputs=local.showInputs;
  return {...record,state:next};
}
