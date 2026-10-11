import test from "node:test";
import assert from "node:assert/strict";
import { createSimulationSession } from "./session";
import { createPreparation } from "./preparation";
import { askApplicationInput } from "./applicationInput";
import { projectLocalAnswers, type LocalQuestionAnswers } from "./localQuestionAnswers";
import { executePreparationRequest } from "./preparationService";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
function fixture(){
 let state=createSimulationSession({roleRef:"job:test",roleName:"Role",documentId:"cv",documentName:"CV"});
 state.analysisStatus="completed";state.preparation=createPreparation();state.activity={version:1,offerId:1,outputs:{},batches:[]};
 state=askApplicationInput(state,{purpose:"Writing",items:[{kind:"question",title:"What did you build?"},{kind:"question",title:"What changed?"}]},"test");
 return {messageId:10,state};
}
test("local answers move immediately, survive refresh projection and complete without changing server state",()=>{
 const record=fixture(), batch=record.state.activity!.batches[0];
 const local:LocalQuestionAnswers={batchId:batch.id,requestId:"one",responses:{[batch.itemIds[0]]:{decision:"answer",text:"Built APIs"}}};
 let projected=projectLocalAnswers(record,local);
 assert.equal(projected.state.preparation!.currentItemId,batch.itemIds[1]);
 assert.deepEqual(record.state.preparation!.responses,{});
 assert.equal(projectLocalAnswers(record,JSON.parse(JSON.stringify(local))).state.preparation!.responses[batch.itemIds[0]].text,"Built APIs");
 local.currentItemId=batch.itemIds[0];
 assert.equal(projectLocalAnswers(record,local).state.preparation!.currentItemId,batch.itemIds[0]);
 local.responses[batch.itemIds[1]]={decision:"skip"};local.currentItemId=undefined;local.showInputs=true;
 projected=projectLocalAnswers(record,local);
 assert.equal(projected.state.activity!.batches[0].status,"submitted");
 assert.equal(projected.state.preparation!.showInputs,false);
 assert.equal(record.state.activity!.batches[0].status,"waiting");
});
test("batch submit validates all answers and saves atomically once; retry cannot duplicate",async()=>{
 const record=fixture(), batch=record.state.activity!.batches[0];let state=record.state, writes=0;
 const admin={rpc:async(_name:string,args:any)=>{
  if(args.p_operation!=="read") {writes++;state={...args.p_payload,revision:state.revision+1};}
  return {data:{id:state.sessionId,message_id:10,user_id:"u",conversation_id:"c",payload:state,created_at:state.startedAt},error:null};
 }} as unknown as TalentAdminClient;
 const input={operation:"submit_answers" as const,conversationId:"c",sessionMessageId:10,expectedRevision:state.revision,requestId:"one",batchId:batch.id,responses:{[batch.itemIds[0]]:{decision:"answer" as const,text:"Built APIs"},[batch.itemIds[1]]:{decision:"skip" as const}}};
 const store={admin,userId:"u",conversationId:"c"};
 await assert.rejects(()=>executePreparationRequest(store,{...input,responses:{}}));assert.equal(writes,0);
 await executePreparationRequest(store,input);assert.equal(writes,1);assert.equal(state.activity!.batches[0].status,"submitted");
 await assert.rejects(()=>executePreparationRequest(store,input));assert.equal(writes,1);
});
