import assert from "node:assert/strict";
import Module from "node:module";
import { readFileSync } from "node:fs";
import ts from "typescript";
import path from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { companyAgentCorrespondenceTools, withCompanyAgentScope } from "./companyScope";
let saved: any[] = [], reply = "Candidate introduction for the hiring team.", config: any;
let modelCalls = 0, sharedReservations = 0, notifyCompany = false;
let counterpartReplies = 0, explicitCompanySends = 0;
const db: any = { query: async (sql: string) => {
  if (sql.includes("SELECT id,metadata FROM public.company_messages")) return saved;
  if (sql.includes("SELECT id FROM public.company_messages")) return saved;
  if (sql.includes("SELECT m.*,root.cancelled_at")) return [{ role_id: "role", talent_id: "talent" }];
  if (sql.includes("SELECT metadata FROM public.company_messages")) return [];
  return [];
}};
const admin: any = { from: () => { const q: any = {select:()=>q,eq:()=>q,single:async()=>({data:{id:"conversation",company_workspace_id:"workspace",role_id:"role"},error:null})};return q;} };
let run: typeof import("./companyReceiver.server").runCompanyAgentEvent;
let original: any;
before(async () => {
  const mod = Module as any; original = mod._load;
  const mocks: Record<string, any> = {
    "server-only": {},
    "@/lib/server/candidateAccess": {getSupabaseAdmin:()=>admin},
    "@/lib/org/agent/context": {buildOrgAgentPromptContext:async()=>({contextNotesText:"",rolesText:"Role context"}),formatOrgAgentCurrentRoleContext:()=>"Current Role"},
    "@/lib/org/agent/chat": {runOrgAgentToolLoop:async(args:any)=>{
      config=args;modelCalls++;
      if (notifyCompany) { explicitCompanySends++; saved=[{id:9}]; }
      else counterpartReplies++;
      return {reply,usage:{}};
    }},
    "@/lib/org/agent/modelConfig": {resolveOrgAgentModel:()=>({model:"original-company-model"})},
    "./companyScope": { withCompanyAgentScope, companyAgentCorrespondenceTools },
    "./store": {agentContactDatabase:()=>db,assertAgentContactSource:async()=>{},assertAgentContactPair:async()=>{},AgentContactSupersededError:class extends Error{}},
    "./companyTools": {executeCompanyCorrespondence:async()=>{throw Error("Receiver must not force a company send");}},
    "./read": {readAgentCorrespondence:async()=>({modelOutput:"Candidate approved this introduction."})},
    "./scheduleRun": {},
    "@/lib/org/roleNotifications": {fetchOrgRoleNotificationSettings:async()=>({})},
    "@/lib/org/roleNotificationDestinations": {formatRoleNotificationDestinations:()=>"Configured Slack audience"},
    "@/lib/org/requestScope.server": {withOrgReadScope:(f:any)=>f()},
    "@/lib/org/agent/decisionEvidence.server": {},
    "../org/workspaceLocale.server": {getOrgWorkspaceLocale:async()=>"ko"},
    "@/lib/org/workspaceLocale.server": {getOrgWorkspaceLocale:async()=>"ko"},
    "./executionBudget": {remainingRunSeconds:()=>1500,reserveAgentExecution:async()=>{sharedReservations++;return 1500},settleAgentExecution:async()=>{}},
    "@/lib/org/agent/companyMessageDelivery.server": {deliverCompanyMessageBatch:async()=>{}},
  };
  mod._load=function(name:string,parent:any,isMain:boolean){
    return name in mocks ? mocks[name] : original.call(this,name,parent,isMain);
  };
  // Compile dynamic imports to CJS requires so they share the isolated fake
  // boundaries; no provider, database or Slack connection is used in this test.
  const filename = new URL("./companyReceiver.server.ts", import.meta.url).pathname;
  const compiled = new mod(filename);
  compiled.filename = filename;
  compiled.paths = mod._nodeModulePaths(path.dirname(filename));
  compiled._compile(ts.transpileModule(readFileSync(filename,"utf8"), {
    compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
  }).outputText, filename);
  run = compiled.exports.runCompanyAgentEvent;
});
after(()=>{(Module as any)._load=original});
beforeEach(()=>{saved=[];reply="";modelCalls=0;sharedReservations=0;notifyCompany=false;counterpartReplies=0;explicitCompanySends=0;});
const job={id:"incoming",action_name:"agent_contact_received",role_id:"role",company_workspace_id:"workspace",locked_by:"lease",attempt_count:1,conversation_id:"conversation",anchor_message_id:1,action_context:{messageId:"message",introductionRootId:"root",agentContactBudgetAnchor:"shared-chain"}};
test("incoming contact starts without a shared-chain reservation and can reply only to the candidate's agent",async()=>{
  assert.equal((await run(job)).outcome,"completed_silent");
  assert.equal(modelCalls,1);assert.equal(sharedReservations,0);
  assert.equal(config.allowedToolNames.has("contact_user"),true);
  assert.equal(config.allowedToolNames.has("contact_talent"),true);
  assert.match(config.userMessage,/ordinary final text is not delivered/);
  assert.equal(counterpartReplies,1);assert.equal(explicitCompanySends,0);
});
test("the company LLM can explicitly notify the company and finish with an empty final reply",async()=>{
  notifyCompany=true;
  const result=await run(job);
  assert.equal(result.outcome,"completed_message");
  assert.equal(result.terminalMessageId,9);
  assert.equal(explicitCompanySends,1);assert.equal(modelCalls,1);
});
test("ordinary final text is not automatically sent to the company",async()=>{
  reply="Internal completion after replying to the candidate's agent.";
  assert.equal((await run(job)).outcome,"completed_silent");
  assert.equal(explicitCompanySends,0);
  assert.deepEqual(saved,[]);
});
