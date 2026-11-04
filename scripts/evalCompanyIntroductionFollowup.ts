import {config} from "dotenv";
import {createHash} from "node:crypto";
import {mkdirSync,readFileSync,readdirSync,writeFileSync} from "node:fs";
import path from "node:path";

config({path:".env.local",quiet:true});
process.env.NEXT_PUBLIC_SUPABASE_URL="https://evaluation.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="synthetic";
process.env.SUPABASE_SERVICE_ROLE_KEY="synthetic";
const task="docs/evaluation/career-internal-introduction";
const fixtureName=process.argv[2]??"company-followup-replay-v1.json";
if(!/^company-followup-replay-v[1-9][0-9]*\.json$/.test(fixtureName))throw Error("Expected a registered replay fixture filename");
const fixturePath=path.join(task,fixtureName);
const fixture=JSON.parse(readFileSync(fixturePath,"utf8"));
const source=path.join(task,fixture.sourceDirectory);
const initial=JSON.parse(readFileSync(path.join(source,fixture.initialRequest),"utf8")).request;
const receipts=JSON.parse(readFileSync(path.join(source,"database-receipts.json"),"utf8"));
const f=receipts.fixture;
const target=f.roles.button;
const dir=path.join(task,"runs",`company-followup-${new Date().toISOString().replace(/[:.]/g,"-")}`);
mkdirSync(dir,{recursive:true,mode:0o700});
const save=(name:string,value:unknown)=>writeFileSync(path.join(dir,name+".json"),JSON.stringify(value,null,2),{mode:0o600});
const hash=(value:string|Buffer)=>createHash("sha256").update(value).digest("hex");
const stable=(value:any):string=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const reads=new Set(["read_talent","read_role","get_talents","get_more_data","read_conversation_history"]);
const recorded=new Map<string,string>();
for(const file of readdirSync(source).filter(n=>n.endsWith("-request.json")).sort()){
  const request=JSON.parse(readFileSync(path.join(source,file),"utf8")).request;
  const messages=request.messages??[];
  if(!messages.some((m:any)=>m.role==="user"&&typeof m.content==="string"&&m.content.endsWith(fixture.input)))continue;
  const calls=new Map<string,any>();
  for(const message of messages){
    for(const call of message.tool_calls??[])calls.set(call.id,call.function);
    if(message.role!=="tool")continue;
    const call=calls.get(message.tool_call_id);
    if(!call||!reads.has(call.name))continue;
    recorded.set(call.name+":"+stable(JSON.parse(call.arguments)),message.content);
  }
}
const originalFetch=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
  const url=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);
  if(!["api.openai.com","api.anthropic.com","openrouter.ai"].includes(url.hostname))throw Error("Replay blocks non-provider network");
  return originalFetch(input,init);
};
async function main(){
  const {runOrgAgentToolLoop,runOrgAgentCompletion}=await import("../src/lib/org/agent/chat");
  const {resolveOrgAgentModel}=await import("../src/lib/org/agent/modelConfig");
  const model=resolveOrgAgentModel(undefined).model;
  const runtimeSources=["scripts/evalCompanyIntroductionFollowup.ts","src/lib/org/agent/chat.ts","src/lib/org/agent/prompts.ts","src/lib/org/agent/tools.ts","src/lib/org/agent/capabilities/policies.ts","src/lib/org/agent/promptFormat.ts"];
  save("manifest",{dataset:fixture.version,datasetSha256:hash(readFileSync(fixturePath)),originalRequestSha256:hash(readFileSync(path.join(source,fixture.initialRequest))),sourceHashes:Object.fromEntries(runtimeSources.map(file=>[file,hash(readFileSync(file))])),recordedReads:recorded.size,model,modelOverride:false,timeoutMs:240000,boundary:fixture.boundary});
  const context={accessText:"",companyText:"",workspace:{workspaceId:f.workspaceId,companyName:"Harper"},roles:[],rolesText:"",completeRoleRequestIds:[],recentRecommendationsText:"",recentContactsText:"",conversationMessages:[],conversationText:"",summariesText:"",contextNotesText:"",defaultLongTextObservations:[],inProgressRoleCreationsText:"",pendingUpdateText:"",recentToolContextText:""} as any;
  const completions:any[]=[],calls:any[]=[];
  let baseCount=0;
  let fixtureFailure:Error|undefined;
  const started=Date.now();
  try{
    const result=await runOrgAgentToolLoop({admin:{} as any,user:{id:f.companyUserId} as any,actorId:f.companyUserId,actorLabel:"이서연",conversation:{id:receipts.companyMessages.find((m:any)=>m.role_id===target).conversation_id,company_workspace_id:f.workspaceId,role_id:target} as any,context,currentUserMessageId:244,model,responseLocale:"en",source:"chat",readAudience:"caller",scopeKey:"recorded-company-followup",slackThreadId:null,mentions:[],userMessage:fixture.input,onTextDelta:()=>{},signal:AbortSignal.timeout(240000)}, {
      requestTime:new Date("2026-11-03T15:13:56.725Z"),
      complete:async args=>{
        // A missing recording is a replay boundary, not a simulated product
        // error for the model to recover from. Stop before another completion.
        if(fixtureFailure)throw fixtureFailure;
        if(!baseCount)baseCount=args.messages.length;
        // Use the captured initial evidence, followed by this real loop's new
        // tool transcript. Current core/policies/schemas remain runtime-owned.
        const messages=[args.messages[0],...initial.messages.slice(1),...args.messages.slice(baseCount)];
        const entry:any={input:{...args,messages,signal:undefined}};completions.push(entry);save("completions",completions);
        const response=await runOrgAgentCompletion({...args,messages,candidateEmailWorkspaceId:undefined});
        entry.output=response;save("completions",completions);return response;
      },
      executeTool:async args=>{
        const key=args.name+":"+stable(args.input);
        const modelOutput=recorded.get(key);
        calls.push({name:args.name,input:args.input,recorded:modelOutput!==undefined});save("calls",calls);
        if(!reads.has(args.name)||modelOutput===undefined){
          fixtureFailure=Error("Read is not present in this frozen fixture; no effect occurred");
          throw fixtureFailure;
        }
        args.state.toolResults.push({callId:args.callId,name:args.name,status:"success",summary:"Recorded authorized read result"});
        return {modelOutput};
      },
    });
    save("result",{reply:result.reply,calls,elapsedMs:Date.now()-started,semanticReview:"pending"});
    console.log(JSON.stringify({reply:result.reply,tools:calls.map(c=>c.name),elapsedMs:Date.now()-started,artifacts:dir}));
    if(calls.some(c=>!c.recorded)||!result.reply)process.exitCode=1;
  }catch(error){save("failure",{error:String(error),calls,elapsedMs:Date.now()-started});console.error(String(error));process.exitCode=1;}
}
main().finally(()=>{globalThis.fetch=originalFetch;}).catch(error=>{console.error(String(error));process.exitCode=1;});
