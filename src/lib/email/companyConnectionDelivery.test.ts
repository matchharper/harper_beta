import { test } from "node:test";
import assert from "node:assert/strict";
import { deliverCompanyConnectionJob, selectReminderWorkspace, reminderWindow, type CompanyEmailJob, type DeliveryDependencies } from "./companyConnectionDelivery";
const job: CompanyEmailJob = { id:"job-1",recipient_id:"person",ordinal:1,attempted_at:null,delivery:null,
 snapshot:{id:"person",email:"fixture@example.invalid",name:null,locale:"ko",verifiedEmail:true,suppressed:false,
 workspaces:[{id:"workspace-1",name:"Fixture",internal:true,membership:"owner",setupUrl:"",
 roles:[{name:"Role",active:true,testOnly:false,canDeliverToSlack:false,setupNeeded:"Connect channel",pendingConnectionCount:0,readyCandidateCount:0,previouslyPresentedReadyCount:0}]}]} };
const args = {job,owner:"lease",history:[],priorMessages:[],baseUrl:"https://example.invalid",now:new Date("2026-10-16T01:00:00Z")};
function dependencies() {
 const calls:string[]=[];
 const deps:DeliveryDependencies={
  compose:async()=>{calls.push("compose");return {subject:"Synthetic",body:"Synthetic body",model:"test",usage:{},messages:[]};},
  saveDraft:async()=>{calls.push("saveDraft");},
  prepare:async(j,email)=>{calls.push("prepare");return {to:j.snapshot.email,from:"harper@example.invalid",subject:email.subject,text:email.body,html:email.body,replyTo:"reply@example.invalid",idempotencyKey:`company-notice/${j.id}`};},
  begin:async(j,_,delivery)=>{calls.push("begin");return {...j,delivery};},
  send:async()=>{calls.push("send");return {id:"provider-1"};},
  finish:async()=>{calls.push("finish");},
 };
 return {calls,deps};
}
test("real orchestration freezes a draft and authorizes immediately before transport",async()=>{
 const {calls,deps}=dependencies();assert.equal(await deliverCompanyConnectionJob(args,deps),"sent");
 assert.deepEqual(calls,["compose","saveDraft","prepare","begin","send","finish"]);
});
test("opt-out/connected/revoked pre-send authorization prevents ANY provider call",async()=>{
 const {calls,deps}=dependencies();deps.begin=async()=>null;
 assert.equal(await deliverCompanyConnectionJob(args,deps),"cancelled");assert(!calls.includes("send"));
});
test("provider accepted but receipt save failed: retry uses exact frozen payload without another model call",async()=>{
 const {deps}=dependencies();let frozen:any;let providerCalls=0;const accepted=new Map<string,string>();
 deps.begin=async(j,_,delivery)=>{frozen=structuredClone(delivery);return {...j,delivery};};
 deps.send=async delivery=>{providerCalls++;const key=delivery.idempotencyKey!;accepted.set(key,"same-receipt");return {id:accepted.get(key)};};
 deps.finish=async()=>{throw Error("database unavailable after acceptance");};
 await assert.rejects(deliverCompanyConnectionJob(args,deps),/database unavailable/);
 deps.compose=async()=>{throw Error("must not regenerate");};deps.prepare=async()=>{throw Error("must not rebuild payload");};deps.finish=async()=>{};
 assert.equal(await deliverCompanyConnectionJob({...args,job:{...job,delivery:frozen,attempted_at:args.now.toISOString()}},deps),"sent");
 assert.equal(providerCalls,2);assert.equal(accepted.size,1);
});
test("draft survives crash before alias/send; one workspace per reply scope with recipient-wide ordinal",async()=>{
 const {deps}=dependencies();deps.compose=async()=>{throw Error("must reuse draft");};
 assert.equal(await deliverCompanyConnectionJob({...args,job:{...job,draft:{subject:"Saved",body:"Saved body"}}},deps),"sent");
 const snapshot={...job.snapshot,workspaces:[...job.snapshot.workspaces,{...job.snapshot.workspaces[0]!,id:"workspace-2"}]};
 const selected=selectReminderWorkspace(snapshot,2,args.baseUrl);
 assert.equal(selected.workspaces.length,1);assert.equal(selected.workspaces[0]!.id,"workspace-2");
 assert(selected.workspaces[0]!.setupUrl.includes("workspace-2"));
});
test("missing provider receipt is never recorded as delivered",async()=>{
 const {calls,deps}=dependencies();deps.send=async()=>({});
 await assert.rejects(deliverCompanyConnectionJob(args,deps),/receipt missing/);assert(!calls.includes("finish"));
});
test("KST window and candidate-free reminders",()=>{
 assert(reminderWindow(args.now));assert(!reminderWindow(new Date("2026-10-16T00:59:00Z")));
 assert(!reminderWindow(new Date("2026-10-16T09:00:00Z")));assert(!reminderWindow(new Date("2026-10-17T01:00:00Z")));
});
