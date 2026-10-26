/** Frozen real-input comparison of the Hiring Brief summary output contract.
 * No DB writes, business delivery, semantic output filters or synthetic data. */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { config } from 'dotenv';

const root=path.resolve(__dirname,'..');
const task=path.join(root,'docs/evaluation/company-agentic-role-search');
const option=(name:string)=>process.argv.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3);
const run=option('run'),format=option('format')??'structured';
if(!run||!/^[-a-zA-Z0-9_.]+$/.test(run)||!['structured','text'].includes(format))throw Error('Fresh run and supported transport format required');
process.umask(0o077);
const directory=path.join(task,'runs',run);mkdirSync(directory,{mode:0o700});
const read=(file:string)=>JSON.parse(readFileSync(file,'utf8'));
const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const save=(file:string,value:unknown)=>writeFileSync(path.join(directory,file),JSON.stringify(value,null,2)+'\n',{mode:0o600});
const datasetFile=path.resolve(task,option('dataset-manifest')??'hiring-brief-summary-structure-manifest-v1.json'),dataset=read(datasetFile);
const systemPromptFile=option('system-prompt-file')?path.resolve(root,option('system-prompt-file')!):null;
const systemPrompt=systemPromptFile?readFileSync(systemPromptFile,'utf8').trim():null;
for(const [file,expected] of Object.entries(dataset.files))if(hash(readFileSync(path.join(task,file)))!==expected)throw Error('Frozen gold changed');
const inputsFile=path.resolve(task,dataset.privateInputs);
if(!inputsFile.startsWith(path.join(task,'private')+path.sep)||hash(readFileSync(inputsFile))!==dataset.privateInputsSha256)throw Error('Frozen actual input mismatch');
const examples=read(inputsFile).examples;
const sourceFiles=['scripts/evalCompanyHiringBriefSummary.ts','src/lib/llm/llm.ts','src/lib/llm/modelConfig.ts','src/lib/llm/responsesChatAdapter.ts'];
const sources=Object.fromEntries(sourceFiles.map(file=>[file,hash(readFileSync(path.join(root,file)))]));
const manifest:any={task:dataset.task,datasetVersion:dataset.datasetVersion,datasetHash:hash(readFileSync(datasetFile)),
  privateInputsSha256:dataset.privateInputsSha256,run,format,sources,startedAt:new Date().toISOString(),
  model:'gpt-6-luna',reasoning:'low',maxOutputTokens:128000,productionWrites:0,externalDelivery:false,
  quality:'pending_manual_review',change:systemPrompt?'Explicit system-prompt comparison; original user changes and model preserved':'Only output transport format; exact original system/user messages',
  systemPromptFile,systemPromptSha256:systemPrompt?hash(systemPrompt):null,results:[]};
save('manifest.json',manifest);
config({path:path.join(root,'.env.local'),quiet:true});

async function main(){
  const nativeFetch=globalThis.fetch,pending:Promise<unknown>[]=[],blocked:string[]=[];
  let sequence=0;
  globalThis.fetch=(async(input:any,init?:any)=>{
    const url=new URL(typeof input==='string'?input:input.url??String(input));
    if(url.hostname!=='api.openai.com'){blocked.push(url.origin+url.pathname);throw Error('Summary diagnostic allows only the actual OpenAI provider');}
    const index=++sequence,startedAt=new Date().toISOString(),started=Date.now();
    const request=typeof init?.body==='string'?JSON.parse(init.body):null;
    try{
      const response=await nativeFetch(input,init);
      pending.push(response.clone().text().then(raw=>save(`provider-${index}.json`,{endpoint:url.origin+url.pathname,request,status:response.status,startedAt,elapsedMs:Date.now()-started,response:raw})));
      return response;
    }catch(error){save(`provider-${index}.json`,{endpoint:url.origin+url.pathname,request,startedAt,error:String(error)});throw error;}
  }) as typeof fetch;
  try{
    const {createChatCompletionWithFallback}=await import('../src/lib/llm/llm');
    const results=await Promise.allSettled(examples.map(async(example:any)=>{
      const request=example.request;
      if(request.model!=='gpt-6-luna'||request.reasoning?.effort!=='low'||request.max_output_tokens!==128000)throw Error('Frozen configuration mismatch');
      const started=Date.now();
      const response=await createChatCompletionWithFallback({
        model:request.model,openAIResponses:{reasoningEffort:request.reasoning.effort},
        ...(format==='structured'?{structuredOutput:{name:'hiring_brief_change_summary',schema:{type:'object',properties:{summary:{type:'string'}},required:['summary'],additionalProperties:false}}}:{}),
        buildRequest:model=>({model,max_completion_tokens:request.max_output_tokens,messages:request.input.map((message:any)=>systemPrompt&&message.role==='system'?{...message,content:systemPrompt}:message)}),
      });
      const raw=response.response.choices?.[0]?.message?.content;
      const parsed=format==='structured'?JSON.parse(raw):{summary:raw};
      if(!parsed||typeof parsed.summary!=='string'||!parsed.summary.trim())throw Error('Missing summary string');
      const result={id:example.id,status:'executed_review_pending',elapsedMs:Date.now()-started,summary:parsed.summary,
        model:response.model,sourceArtifact:example.sourceArtifact,originalRequestHash:hash(JSON.stringify(request)),usage:response.response.usage};
      save(`${example.id}.json`,result);return result;
    }));
    manifest.results=results.map((result,index)=>result.status==='fulfilled'?result.value:{id:examples[index].id,status:'execution_error',error:String(result.reason)});
    manifest.executionStatus=results.some(result=>result.status==='rejected')?'execution_error':'executed_review_pending';
  }finally{
    await Promise.all(pending);globalThis.fetch=nativeFetch;
    manifest.finishedAt=new Date().toISOString();manifest.blocked=blocked;
    manifest.sourceChangedDuringRun=sourceFiles.some(file=>hash(readFileSync(path.join(root,file)))!==sources[file]);
    save('manifest.json',manifest);
  }
  console.log(JSON.stringify({run,status:manifest.executionStatus,examples:manifest.results.length}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
