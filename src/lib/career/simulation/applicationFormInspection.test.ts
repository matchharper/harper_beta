import test from "node:test";
import assert from "node:assert/strict";
import { inspectApplicationForm } from "./applicationFormInspection";
import type { agentsRequest } from "./agentsApi";

const observed = {status:"partial",url:"https://jobs.ashbyhq.com/team/job/application",limitations:["Conditional questions require answers."],fields:[{label:"Why this company?",type:"textarea",required:true,options:[],instructions:"In English",fileTypes:[],maxLength:500}]};
test("read-only inspection uses Ashby application URL, carries no user files and cleans up", async () => {
  const calls: {path:string;body:any;method?:string}[]=[];
  const request = (async (path:string,body?:any,method?:string) => {
    calls.push({path,body,method});
    if(path==="sessions") return {id:"inspect-1"};
    return {required_actions:[{type:"function_call",name:"report_application_form",arguments:observed}]};
  }) as typeof agentsRequest;
  const result = await inspectApplicationForm("https://jobs.ashbyhq.com/team/job",undefined,{request,fetch:async()=>new Response("",{status:503})});
  assert.equal(result.status,"partial");
  assert.equal(result.fields[0].maxLength,500);
  assert.equal(calls[0].body.agent.tools.length,1);
  assert.ok(calls[0].body.environment.files.every((f:any)=>f.path.startsWith("/workspace/harper-browser/")));
  assert.match(JSON.stringify(calls[1].body),/job\/application/);
  assert.equal(calls.at(-1)?.method,"DELETE");
});
test("unreadable or blocked form remains unknown without failing JD analysis", async () => {
  const request=(async(path:string)=>path==="sessions"?{id:"x"}:{required_actions:[{type:"computer_use_approval_request"}]}) as typeof agentsRequest;
  assert.equal((await inspectApplicationForm("https://example.com/job",undefined,{request,fetch:async()=>new Response("",{status:503})})).status,"unavailable");
  assert.equal((await inspectApplicationForm(null,undefined,{request,fetch:async()=>new Response("",{status:503})})).status,"unavailable");
});
test("deadline aborts the provider request and deletes the inspection session",async()=>{
  let cleaned=false;
  const request=(async(path:string,_body:unknown,method:string,signal:AbortSignal)=>{
    if(method==="DELETE"){cleaned=true;return {};}
    if(path==="sessions")return{id:"x"};
    await new Promise((_,reject)=>{signal.addEventListener("abort",()=>reject(signal.reason),{once:true});});
  }) as typeof agentsRequest;
  const keepAlive=setInterval(()=>{},1000);
  const result=await inspectApplicationForm("https://example.com/job",undefined,{request,timeoutMs:20}).finally(()=>clearInterval(keepAlive));
  assert.equal(result.status,"unavailable");
  assert.match(result.limitations.join(" "),/timed out/);
  assert.ok(cleaned);
});
