import { config } from "dotenv";
import { readFileSync,writeFileSync,mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
config({path:".env.local",quiet:true});
const actualFetch=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
 const u=new URL(typeof input==="string"?input:input instanceof URL?input:input.url);
 if(!["openrouter.ai","api.openai.com","api.anthropic.com"].includes(u.hostname))throw Error(`Network denied: ${u.hostname}`);
 return actualFetch(input,{...init,signal:AbortSignal.timeout(90000)});
};
process.env.NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:1";process.env.SUPABASE_SERVICE_ROLE_KEY="synthetic-no-db";process.env.RESEND_API_KEY="synthetic-no-send";
async function main(){
 const {runOrgAgentCompletion}=await import("../src/lib/org/agent/chat");
 const {resolveCompanyCapabilities}=await import("../src/lib/org/agent/capabilities/resolver");
 const {buildOrgAgentSystemPrompt}=await import("../src/lib/org/agent/prompts");
 const {resolveOrgAgentModel,getOrgAgentReasoningEffort}=await import("../src/lib/org/agent/modelConfig");
 const root="docs/evaluation/company-email-connection";
 const raw=readFileSync(`${root}/reply-cases-v1.json`,"utf8"); const fixture=JSON.parse(raw);
 const runId=process.argv[2];if(!runId || !/^[a-z0-9_-]+$/.test(runId))throw Error("Fresh run ID required");
 const path=`${root}/runs/${runId}`;mkdirSync(path,{mode:0o700});
 const {model}=resolveOrgAgentModel(undefined);
 const caps=resolveCompanyCapabilities({surface:"chat",emailReply:true,mode:"progressive",loaded:new Set(),allowedToolNames:new Set(["update_email_preferences"])});
 const system=buildOrgAgentSystemPrompt({surface:"email",responseLocale:"ko",capabilityCatalogText:caps.catalogText,capabilityPolicyText:caps.policyText});
 const results=[];
 for(const c of fixture.cases){
  const completion=await runOrgAgentCompletion({allowTools:true,tools:caps.tools,model,reasoningEffort:getOrgAgentReasoningEffort(model),strictModel:true,maxTokens:2000,signal:AbortSignal.timeout(90000),
   messages:[{role:"system",content:system},{role:"user",content:c.message}]});
  const calls=completion.response.choices[0].message.tool_calls??[];
  const result={id:c.id,calls,usage:completion.response.usage};results.push(result);
  writeFileSync(`${path}/results.json`,JSON.stringify({model,inputSha256:createHash("sha256").update(raw).digest("hex"),promptSha256:createHash("sha256").update(system).digest("hex"),results,noSend:true},null,2),{mode:0o600});
  assert.equal(calls.length,1);assert.equal(calls[0].function.name,"update_email_preferences");assert.deepEqual(JSON.parse(calls[0].function.arguments),c.expected);
  console.log(`${c.id}: correct scope, default tool used without loading; execution disabled`);
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
