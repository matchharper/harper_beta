/** Frozen actual-data history evaluation. Product services are canonical;
 * queue transport and authentication are explicitly local substitutes. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { config } from 'dotenv';
import { startCompanySearchSandbox } from './companyAgenticSearchSandbox.mjs';

const root=path.resolve(__dirname,'..');
const task=path.join(root,'docs/evaluation/company-agentic-role-search');
const option=(name:string)=>process.argv.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3);
const run=option('run'), caseId=option('only'), mode=option('mode')??'prepare';
if(!run||!/^[-a-zA-Z0-9_.]+$/.test(run)||!caseId||!['prepare','run','consume'].includes(mode))throw Error('Fresh run, one frozen case and mode required');
process.umask(0o077);
const directory=path.join(task,'runs',run);mkdirSync(directory,{mode:0o700});
const read=(file:string)=>JSON.parse(readFileSync(file,'utf8'));
const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const save=(file:string,value:unknown)=>writeFileSync(path.join(directory,file),JSON.stringify(value,null,2)+'\n',{mode:0o600});
const datasetFile=path.join(task,'brief-history-manifest-v1.json'),dataset=read(datasetFile);
for(const [file,expected] of Object.entries(dataset.files))if(hash(readFileSync(path.join(task,file)))!==expected)throw Error('Frozen history dataset changed');
const example=read(path.join(task,dataset.casesFile)).cases.find((item:any)=>item.id===caseId);
if(!example)throw Error('Unknown frozen case');
const baselineFile=path.join(task,'runs',option('baseline')??'bootstrap-v3','baseline.json');
const baseline=read(baselineFile);
if(baseline.status!=='frozen'||!baseline.modelWrittenBaseline)throw Error('Actual frozen model-written baseline required');
for(const [file,expected] of Object.entries(baseline.files))if(hash(readFileSync(path.join(path.dirname(baselineFile),file)))!==expected)throw Error('Frozen baseline changed');
const captureDirectory=path.resolve(baseline.sourceCapture);
if(!captureDirectory.startsWith(path.join(task,'private')+path.sep))throw Error('Private actual capture required');
const capture=read(path.join(captureDirectory,'manifest.json')),tables=read(path.join(captureDirectory,'tables.json'));
if(mode!=='prepare'&&!capture.paidSlotRequirementSatisfied&&option('acknowledge-source-condition')!=='legacy-approved-by-user')throw Error('Explicit source-condition approval required');
const person=tables.company_users.find((row:any)=>row.user_id===capture.actorId);
const user:any={id:capture.actorId,aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{name:person?.name},created_at:capture.capturedAt};
const workspaceId=capture.selected.company_workspace_id,roleId=capture.selected.role_id;
const conversation=tables.company_conversations.find((row:any)=>row.role_id===roleId);
if(!conversation)throw Error('Actual Role conversation required');
const migrations=(option('local-migrations')??'').split(',').filter(Boolean);
if(!migrations.length&&mode!=='consume')throw Error('Explicit local schema migrations required');
config({path:path.join(root,'.env.local'),quiet:true});
const files=[...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard','src/lib/org','src/lib/llm','src/lib/companyFirstSearch','src/lib/career/llm.ts','src/app/api/org/role','src/app/api/internal/company-first/result-notice','scripts/evalCompanyHiringBriefHistory.ts','scripts/companyAgenticSearchSandbox.mjs'],{cwd:root,encoding:'utf8'}).trim().split('\n').concat(migrations))].filter(file=>existsSync(path.join(root,file))).sort();
const sourceHashes=Object.fromEntries(files.map(file=>[file,hash(readFileSync(path.join(root,file)))]));
save('source-snapshot.json',files.map(file=>({file,content:readFileSync(path.join(root,file),'utf8')})));
const manifest:any={task:'company-agentic-role-search',dataset,datasetHash:hash(readFileSync(datasetFile)),caseId,mode,
  baseline:baselineFile,baselineHash:hash(readFileSync(baselineFile)),sourceHashes,startedAt:new Date().toISOString(),
  command:process.argv.slice(1),sourceFingerprint:hash(JSON.stringify(sourceHashes)),datasetManifest:dataset,
  requestClockPolicy:'actual_turn_start',
  hostAwakeGuard:process.env.COMPANY_EVAL_HOST_AWAKE_GUARD??null,
  sourceConditionAcknowledgment:option('acknowledge-source-condition')??null,productionWrites:0,externalDelivery:false,
  coverage:{productionRoleSaveService:true,productionWebHttp:false,productionAuth:false,
    actualSummaryProcessor:true,actualCompanyWebActionProcessor:true,queueTransport:'Local direct consumption of the actual durable job; no remote queue',
    matchingWorker:false,slack:'Actual common loop source=slack and save provenance; external Slack transport is blocked'},quality:'pending_semantic_review'};
save('manifest.json',manifest);save('frozen-input.json',example);

async function main(){
  const nativeFetch=globalThis.fetch,providers:Promise<unknown>[]=[],blocked:any[]=[],mutations:any[]=[];
  let sequence=0;
  globalThis.fetch=(async(input:any,init?:any)=>{
    const url=new URL(typeof input==='string'?input:input.url??String(input));
    const provider=mode!=='prepare'&&['api.openai.com','api.anthropic.com','openrouter.ai'].includes(url.hostname);
    if(!['127.0.0.1','localhost'].includes(url.hostname)&&!provider){blocked.push({origin:url.origin,path:url.pathname});throw Error(`Evaluation network blocked: ${url.origin}${url.pathname}`);}
    const index=++sequence,startedAt=new Date().toISOString(),started=Date.now();
    let request:any=null;try{request=typeof init?.body==='string'?JSON.parse(init.body):null;}catch{request=String(init?.body);}
    try{
      const response=await nativeFetch(input,init);
      if(provider)providers.push(response.clone().text().then(raw=>save(`provider-${index}.json`,{endpoint:url.origin+url.pathname,request,status:response.status,startedAt,elapsedMs:Date.now()-started,response:raw})));
      if(!provider&&['POST','PATCH','DELETE'].includes(init?.method??''))mutations.push({path:url.pathname,method:init.method,body:request,status:response.status,startedAt});
      return response;
    }catch(error){if(provider)save(`provider-${index}.json`,{endpoint:url.origin+url.pathname,request,startedAt,elapsedMs:Date.now()-started,error:String(error)});throw error;}
  }) as typeof fetch;
  const existingSandbox=option('existing-sandbox');
  if((mode==='consume')!==Boolean(existingSandbox))throw Error('Consumption-only mode requires an existing browser sandbox');
  let sandbox:any;
  if(existingSandbox){
    const file=path.resolve(task,'runs',existingSandbox,'sandbox.json');
    if(!file.startsWith(path.join(task,'runs')+path.sep))throw Error('Local browser artifact required');
    const metadata=read(file),url=new URL(metadata.url),db=new URL(metadata.databaseUrl);
    if(url.hostname!=='127.0.0.1'||db.hostname!=='127.0.0.1'||db.port!=='55461'||!/^\/harper_agentic_run_[a-f0-9]+$/.test(db.pathname))throw Error('Only a dedicated existing local browser clone may be consumed');
    sandbox={...metadata,stop:async()=>{}};save('sandbox.json',metadata);
    manifest.companionOnly={existingSandbox,historyIds:(option('history-ids')??'').split(',').filter(Boolean),isolatedFrozenCaseExecuted:false};
  }else sandbox=await startCompanySearchSandbox({root,runDirectory:directory,baseline:baseline.database,pgPort:baseline.pgPort,authUser:user,migrations,preserveDatabase:option('preserve')==='true'});
  process.env.NEXT_PUBLIC_SUPABASE_URL=sandbox.url;process.env.SUPABASE_SERVICE_ROLE_KEY='local-evaluation-only';process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='local-evaluation-only';process.env.HARPER_LOCAL_E2E='1';
  let state:()=>Promise<any>;
  try{
    const {createClient}=await import('@supabase/supabase-js');
    const admin:any=createClient(sandbox.url,'local-evaluation-only',{auth:{persistSession:false,autoRefreshToken:false}});
    const {updateOrgRole}=await import('../src/lib/org/server');
    const {processHiringBriefSummary,enqueueHiringBriefReview,readHiringBriefHistory}=await import('../src/lib/org/hiringBriefHistory.server');
    const {processCompanyAgentWebActionJob}=await import('../src/lib/org/agent/webActionProcessor.server');
    const {resolveOrgAgentModel}=await import('../src/lib/org/agent/modelConfig');manifest.model=resolveOrgAgentModel().model;
    const stateTables=['company_internal_roles','company_roles','company_role_hiring_brief_history','company_agent_web_action_jobs','company_messages','company_first_search_runs','company_role_candidate_evaluations','company_memory_entries','company_intro_candidates','company_talent_requests','company_talent_relays','meeting_schedules','talent_progress','talent_opportunity_recommendation','talent_opportunity_fit','company_workspace_credit_periods','company_workspace_slots'];
    state=async()=>{const result:any={};for(const table of stateTables){const rows=[];for(let offset=0;;offset+=1000){const q=await admin.from(table).select('*').order(['company_roles','company_internal_roles'].includes(table)?'role_id':'id').range(offset,offset+999);if(q.error)throw q.error;rows.push(...q.data);if(q.data.length<1000)break;}result[table]=rows;}return result;};
    const before=await state();save('state-before.json',before);
    if(mode==='prepare'){save('initial-history.json',await readHiringBriefHistory({admin,user,workspaceId,roleId}));manifest.executionStatus='prepared';return;}
    if(mode==='consume'){
      const ids=(option('history-ids')??'').split(',').filter(Boolean);
      if(!ids.length)throw Error('Exact observed history IDs required for browser companion consumption');
      const receipts=[];
      for(const id of ids){
        const row=before.company_role_hiring_brief_history.find((item:any)=>item.id===id&&item.role_id===roleId&&item.company_workspace_id===workspaceId);
        if(!row)throw Error('Observed history must belong to the actual captured Role');
        const summary=await processHiringBriefSummary({historyId:id},{admin});
        const jobId=await enqueueHiringBriefReview({admin,historyId:id,user});
        if(jobId)await processCompanyAgentWebActionJob({jobId,kind:'web_action_job',version:1},{messageId:`evaluation-browser:${jobId}`});
        receipts.push({historyId:id,summary,jobId});save('consumption-results.json',receipts);
      }
      manifest.executionStatus='consumption_companion_review_pending';return;
    }
    const internal=before.company_internal_roles.find((row:any)=>row.role_id===roleId);
    const criteria=structuredClone(internal.criteria);
    let webResult:any;
    if(['ARSB01','ARSB06'].includes(caseId!)){
      if(!criteria.length)throw Error('Actual criterion required');
      criteria[0].criteria+=' 프로필에 근거가 없는 내용은 확인이 필요한 사항으로 구분한다.';
      webResult=await updateOrgRole({user,workspaceId,roleId,criteria,expectedCriteria:internal.criteria,source:'website',requestReview:true});
    }else if(caseId==='ARSB02'){
      webResult=await updateOrgRole({user,workspaceId,roleId,request:internal.request+'\n\n후보 프로필에서 확인되지 않은 사실과 확인된 근거를 구분해 검토한다.',expectedRequest:internal.request,source:'website',requestReview:true});
    }else if(caseId==='ARSB05'){
      const receipts=[];for(let attempt=1;attempt<=2;attempt++)receipts.push(await updateOrgRole({user,workspaceId,roleId,request:internal.request,expectedRequest:internal.request,criteria:internal.criteria,expectedCriteria:internal.criteria,source:'website',requestReview:true}));
      save('identical-save-receipts.json',receipts);
    }
    if(webResult){
      save('web-save-service-result.json',webResult);save('state-immediately-after-save.json',await state());
      if(!webResult.hiringBriefHistoryId)throw Error('Actual changed save returned no history');
      const historyId=webResult.hiringBriefHistoryId;
      const summary=await processHiringBriefSummary({historyId},{admin});save('summary-result.json',summary);
      const jobId=await enqueueHiringBriefReview({admin,historyId,user});save('review-enqueue.json',{jobId});
      if(!jobId)throw Error('Actual web history did not enqueue its user turn');
      await processCompanyAgentWebActionJob({jobId,kind:'web_action_job',version:1},{messageId:`evaluation:${jobId}`});
      save('state-after-web-turn.json',await state());
      save('summary-replay.json',await processHiringBriefSummary({historyId},{admin}));
      save('review-enqueue-replay.json',{jobId:await enqueueHiringBriefReview({admin,historyId,user})});
      await processCompanyAgentWebActionJob({jobId,kind:'web_action_job',version:1},{messageId:`evaluation-replay:${jobId}`});
      save('state-after-replay.json',await state());
    }
    if(example.turns?.length){
      const {buildOrgAgentPromptContext}=await import('../src/lib/org/agent/context');
      const {runOrgAgentToolLoop,runOrgAgentCompletion,buildAssistantMetadata}=await import('../src/lib/org/agent/chat');
      const {insertOrgAgentMessage}=await import('../src/lib/org/agent/store');
      const {executeOrgAgentTool}=await import('../src/lib/org/agent/toolExecution');
      const {resolveOrgAgentModel}=await import('../src/lib/org/agent/modelConfig');
      const model=resolveOrgAgentModel().model;const completions:any[]=[],trace:any[]=[],outputs:any[]=[];
      for(const prompt of example.turns){
        const message=await insertOrgAgentMessage({admin,conversation,content:prompt,role:'user',roleId,userId:user.id});
        const context=await buildOrgAgentPromptContext({admin,user,conversation,currentUserMessageId:message.id,includeSharedConversation:true,readAudience:'company_safe',scopeKey:`eval-history:${run}`});
        const source=example.surface==='slack_local_transport'?'slack':'chat';
        const result=await runOrgAgentToolLoop({actorId:user.id,actorLabel:person?.name??'팀원',admin,context,conversation,currentUserMessageId:message.id,mentions:[],model,readAudience:'company_safe',scopeKey:`eval-history:${run}`,source,slackThreadId:null,user,userMessage:prompt,responseLocale:'ko',capabilityMode:'progressive'},{requestTime:new Date(),complete:async args=>{
          const {signal:_signal,...request}=args;const started=Date.now();const entry:any={request,startedAt:new Date().toISOString()};completions.push(entry);try{const result=await runOrgAgentCompletion({...args,candidateEmailWorkspaceId:undefined});entry.response=result.response;entry.actualModel=result.model;return result;}finally{entry.elapsedMs=Date.now()-started;save('completions.json',completions);}
        },executeTool:async args=>{const entry:any={name:args.name,input:args.input,callId:args.callId};trace.push(entry);try{const result=await executeOrgAgentTool(args);entry.result=result;return result;}catch(error){entry.error=String(error);throw error;}finally{save('tool-trace.json',trace);}}});
        outputs.push({input:prompt,reply:result.reply,source,toolResults:result.state.toolResults});save('outputs.json',outputs);save('tool-transcript.json',(result as any).toolTranscript);
        if('completionError'in result&&result.completionError)throw Error(String(result.completionError));
        if(result.reply)await insertOrgAgentMessage({admin,conversation,content:result.reply,role:'assistant',roleId,model:result.model,metadata:buildAssistantMetadata(result)});
      }
    }
    const pending=await admin.from('company_role_hiring_brief_history').select('id').eq('role_id',roleId).eq('summary_status','pending');if(pending.error)throw pending.error;
    const summaryReceipts=[];for(const row of pending.data)summaryReceipts.push({id:row.id,result:await processHiringBriefSummary({historyId:row.id},{admin})});save('remaining-summary-results.json',summaryReceipts);
    save('history-list.json',await readHiringBriefHistory({admin,user,workspaceId,roleId}));
    manifest.executionStatus='executed_review_pending';
  }catch(error){manifest.executionStatus='error';save('error.json',{error:error instanceof Error?error.stack:String(error)});process.exitCode=1;}
  finally{
    if(state!){try{save('state-after.json',await state());}catch(error){save('state-capture-error.json',{error:String(error)});}}
    await Promise.all(providers);save('local-mutation-transcript.json',mutations);save('network-boundary.json',{blocked,productionWrites:0,externalDelivery:false});
    manifest.finishedAt=new Date().toISOString();manifest.sourceChangedDuringRun=files.some(file=>hash(readFileSync(path.join(root,file)))!==sourceHashes[file]);save('manifest.json',manifest);await sandbox.stop();
    console.log(JSON.stringify({run,caseId,status:manifest.executionStatus}));
  }
}
main().catch(error=>{save('fatal-error.json',{error:String(error)});process.exitCode=1;});
