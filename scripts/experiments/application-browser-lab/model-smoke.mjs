import fs from 'node:fs';
import {generateText,tool} from 'ai';
import {z} from 'zod';
import {getAISDKLanguageModel} from '@browserbasehq/stagehand/lib/v3/llm/LLMProvider.js';
import {preflightModel} from './lib/preflight-model.js';
const env=Object.fromEntries(fs.readFileSync(new URL('../../../.env.local',import.meta.url),'utf8').split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).replace(/^['"]|['"]$/g,'')]}));
const evidence={kind:'provider-transport-smoke',createdAt:new Date().toISOString(),llmCalls:[],providerCalls:[]};
const {middleware,modelName,...options}=preflightModel('openai/gpt-6-luna',evidence,env);
const model=getAISDKLanguageModel('openai','gpt-6-luna',options,middleware);
try{
  const result=await generateText({model,prompt:'Call the ping tool with value "browser-lab-smoke".',tools:{ping:tool({description:'Harmless transport check; no external effect.',inputSchema:z.object({value:z.string()}),execute:async({value})=>({value})})},toolChoice:{type:'tool',toolName:'ping'},maxRetries:0});
  evidence.toolCalls=result.toolCalls;evidence.pass=result.toolCalls.some(t=>t.toolName==='ping'&&t.input.value==='browser-lab-smoke');
}catch(e){evidence.error=e.message;evidence.pass=false;}
const output=new URL('../../../docs/evaluation/application-browser-server/runs/luna-transport-smoke.json',import.meta.url);
fs.writeFileSync(output,JSON.stringify(evidence,null,2),{mode:0o600});
console.log(JSON.stringify({pass:evidence.pass,error:evidence.error,providerCalls:evidence.providerCalls}));
if(!evidence.pass)process.exitCode=1;
