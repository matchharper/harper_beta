/** Real frozen data + production company tool loop/executors + isolated PostgreSQL. */
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, openSync } from 'node:fs';
import path from 'node:path';
import { config } from 'dotenv';
import ts from 'typescript';
import { formatToolError } from '../src/lib/llm/toolError';
import { startCompanySearchSandbox } from './companyAgenticSearchSandbox.mjs';

const root=path.resolve(__dirname,'..');
const task=path.join(root,'docs/evaluation/company-agentic-role-search');
const option=(name:string)=>process.argv.find(v=>v.startsWith(`--${name}=`))?.slice(name.length+3);
const mode=option('mode')??'prepare';
const source=path.resolve(task,'private',option('source')??'legacy-source-v1');
const runId=option('run')??new Date().toISOString().replaceAll(':','-');
if(!['prepare','run'].includes(mode)||!/^[-a-zA-Z0-9_.]+$/.test(runId)||!source.startsWith(path.join(task,'private')+path.sep)) throw Error('Invalid command or source/run path');
process.umask(0o077);
mkdirSync(path.join(task,'runs'),{recursive:true,mode:0o700});
const directory=path.join(task,'runs',runId);mkdirSync(directory,{recursive:false,mode:0o700});
const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
const read=(file:string)=>JSON.parse(readFileSync(file,'utf8'));
const save=(file:string,value:unknown)=>writeFileSync(path.join(directory,file),JSON.stringify(value,null,2)+'\n',{mode:0o600});
const datasetManifestFile=option('dataset-manifest')??'manifest-v1.json';
const datasetPath=(file:string)=>{const resolved=path.resolve(task,file);if(!resolved.startsWith(task+path.sep))throw Error('Dataset files must belong to the evaluation registry');return resolved;};
const datasetManifest=read(datasetPath(datasetManifestFile));
for(const [file,hash] of Object.entries(datasetManifest.files)) if(sha(readFileSync(datasetPath(file)))!==hash) throw Error(`Frozen dataset changed: ${file}`);
const casesFile=datasetManifest.casesFile??'cases-v1.json';
if(!datasetManifest.files[casesFile])throw Error('Cases must be hash-frozen by the selected dataset manifest');
const capture=read(path.join(source,'manifest.json'));
const baselinePath=option('baseline')?path.resolve(task,'runs',option('baseline')!,'baseline.json'):null;
const scoringBaseline=baselinePath?read(baselinePath):null;
const baselineClock=scoringBaseline?.frozenAt??scoringBaseline?.finishedAt??capture.capturedAt;
const requestClockPolicy='actual_wall_clock_per_turn';
if(scoringBaseline){if(path.resolve(scoringBaseline.sourceCapture)!==source)throw Error('Scoring baseline and captured source differ');if(scoringBaseline.status!=='frozen'||!scoringBaseline.modelWrittenBaseline)throw Error('A completed actual model-written baseline is required');for(const [file,hash] of Object.entries(scoringBaseline.files))if(sha(readFileSync(path.join(path.dirname(baselinePath!),file)))!==hash)throw Error('Frozen scoring baseline changed');}
for(const [file,hash] of Object.entries(capture.files)) if(sha(readFileSync(path.join(source,file)))!==hash) throw Error(`Frozen source changed: ${file}`);
if(mode==='run'&&!capture.paidSlotRequirementSatisfied&&option('acknowledge-source-condition')!=='legacy-approved-by-user'){save('precondition-failure.json',{paidSlotRequirementSatisfied:false,providerCalls:0,reason:'Actual paid Slot requirement is unmet; explicit user source-condition resolution required'});throw Error('Actual paid Slot requirement is unmet. Only explicit user authorization can change the source condition.');}
if(mode==='run'&&!scoringBaseline)throw Error('Freeze an actual Worker bootstrap with prepare_baseline.py before conversation model evaluation');
const tables=read(path.join(source,'tables.json'));
const roleId=capture.selected.role_id,workspaceId=capture.selected.company_workspace_id,actorId=capture.actorId;
const role=tables.company_roles.find((r:any)=>r.role_id===roleId);
const internal=tables.company_internal_roles.find((r:any)=>r.role_id===roleId);
const user={id:actorId,user_metadata:{name:tables.company_users.find((r:any)=>r.user_id===actorId)?.name},app_metadata:{}};
const conversation=tables.company_conversations.find((r:any)=>r.role_id===roleId);
if(!actorId||!conversation) throw Error('Actual owner and Role conversation are required; no fabricated identity/context');
const presented=new Set([...tables.company_intro_candidates,...tables.talent_opportunity_recommendation].filter((r:any)=>r.role_id===roleId).map((r:any)=>r.talent_id));
const permitted=new Set(tables.talent_setting.filter((r:any)=>r.profile_visibility==='open_to_matches'&&r.get_internal_recommendation!==false).map((r:any)=>r.user_id));
const pool=tables.talent_users.filter((r:any)=>!r.deleted_at&&permitted.has(r.user_id)&&!presented.has(r.user_id)).sort((a:any,b:any)=>sha(a.user_id).localeCompare(sha(b.user_id)));
if(pool.length<2) throw Error('Two actual unpresented share-eligible candidates are required');
const sourceBindings=scoringBaseline?.bindings??{primaryRole:roleId,candidateA:pool[0].user_id,candidateB:pool[1].user_id,criterionLabel:internal.criteria[0]?.name};
const bindings={...sourceBindings,candidateAName:tables.talent_users.find((r:any)=>r.user_id===sourceBindings.candidateA)?.name,candidateBName:tables.talent_users.find((r:any)=>r.user_id===sourceBindings.candidateB)?.name};
if(!bindings.criterionLabel) throw Error('Actual criterion required');
const cases=read(datasetPath(casesFile)).cases.filter((c:any)=>!option('only')||option('only')!.split(',').includes(c.id));
if(!cases.length)throw Error('No cases selected');
for(const example of cases)if(!Array.isArray(example.turns)||example.actions||example.surface&&!['company_chat','company_chat_with_completion_notice'].includes(example.surface))throw Error('This runner requires conversational inputs; web or Slack actions need their actual transport adapter');
const localMigrations=(option('local-migrations')??'').split(',').filter(Boolean);
for(const file of localMigrations)if(!path.resolve(root,file).startsWith(path.join(root,'supabase/migrations')+path.sep)||!file.endsWith('.sql'))throw Error('Explicit repository migration required');
const stateTables=[...new Set(['company_first_search_runs','company_role_candidate_evaluations','company_memory_entries','company_intro_candidates','company_internal_roles','company_roles','company_messages','company_talent_requests','company_talent_relays','meeting_schedules','talent_progress','talent_opportunity_recommendation','talent_opportunity_fit','company_workspace_credit_periods','company_workspace_slots',...(option('state-tables')??'').split(',').filter(Boolean)])];
for(const table of stateTables)if(!/^[a-z][a-z0-9_]*$/.test(table))throw Error('Valid local state table identifier required');
const bind=(text:string)=>text.replace(/\{\{([^}]+)\}\}/g,(_,key)=>String((bindings as any)[key]??(()=>{throw Error(`Unknown binding ${key}`)})()));
// Freeze executable dependencies, while preserving unrelated UI/tests as an
// auxiliary snapshot. A diagnostic script edit is not a model runtime change.
const inventory=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','src/lib/org','src/lib/companyFirstSearch','src/lib/llm','src/lib/career/llm.ts','scripts/evalCompanyAgenticRoleSearch.ts','scripts/companyAgenticSearchSandbox.mjs','supabase/migrations/20261022041333_company_agentic_role_search.sql','package.json','pnpm-lock.yaml'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(file=>existsSync(path.join(root,file))).sort();
const configSource=ts.readConfigFile(path.join(root,'tsconfig.json'),ts.sys.readFile);
const compilerOptions=ts.parseJsonConfigFileContent(configSource.config,ts.sys,root).options;
const reachable=new Set<string>();const unresolvedDynamicImports:{file:string;expression:string}[]=[];
const pending=[path.join(root,'scripts/evalCompanyAgenticRoleSearch.ts'),path.join(root,'src/app/api/org/agent/chat/route.ts')];
while(pending.length){
  const file=pending.pop()!;if(reachable.has(file))continue;reachable.add(file);
  if(!/\.[cm]?[jt]sx?$/.test(file))continue;
  const parsed=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
  const modules=new Set<string>();
  const visit=(node:ts.Node)=>{
    if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))modules.add(node.moduleSpecifier.text);
    if(ts.isCallExpression(node)&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||(ts.isIdentifier(node.expression)&&node.expression.text==='require'))){
      if(node.arguments[0]&&ts.isStringLiteral(node.arguments[0]))modules.add(node.arguments[0].text);
      else unresolvedDynamicImports.push({file:path.relative(root,file),expression:node.getText(parsed)});
    }
    ts.forEachChild(node,visit);
  };visit(parsed);
  for(const specifier of modules){const resolved=ts.resolveModuleName(specifier,file,compilerOptions,ts.sys).resolvedModule?.resolvedFileName;
    if(resolved&&resolved.startsWith(root+path.sep)&&!resolved.includes(`${path.sep}node_modules${path.sep}`)&&existsSync(resolved))pending.push(resolved);}
}
const sources=[...new Set([...reachable].map(file=>path.relative(root,file)).concat(['package.json','pnpm-lock.yaml','tsconfig.json','scripts/tsconfig.json','supabase/migrations/20261022041333_company_agentic_role_search.sql',...localMigrations]))].sort();
const auxiliarySources=inventory.filter(file=>!sources.includes(file));
const sourceHashes=Object.fromEntries(sources.map(file=>[file,sha(readFileSync(path.join(root,file)))]));
const workerRoot=path.resolve(root,'../harper_worker');
const workerInventory=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','opp','scripts/run_company_matching_local.py','llm_evals/company_agentic_role_search','requirements.txt','pyproject.toml'],{cwd:workerRoot,encoding:'utf8'}).trim().split('\n').filter(file=>existsSync(path.join(workerRoot,file))).sort();
const workerHarness=new Set(['llm_evals/company_agentic_role_search/run_scoring.py','llm_evals/company_agentic_role_search/local_database.py','llm_evals/company_agentic_role_search/capture.py','scripts/run_company_matching_local.py','requirements.txt','pyproject.toml']);
const workerSources=workerInventory.filter(file=>(file.startsWith('opp/')&&file.endsWith('.py'))||workerHarness.has(file));
const workerAuxiliarySources=workerInventory.filter(file=>!workerSources.includes(file));
const workerSourceHashes=Object.fromEntries(workerSources.map(file=>[file,sha(readFileSync(path.join(workerRoot,file)))]));
const sourceInputFiles=['manifest.json','tables.json','schema.json','database-schema.json','supplemental-tables.json','supplemental-schema.json'].filter(file=>existsSync(path.join(source,file)));
const manifest:any={task:'company-agentic-role-search',runId,mode,source:path.basename(source),scoringBaseline:baselinePath?{file:baselinePath,hash:sha(readFileSync(baselinePath)),database:scoringBaseline.database}:null,sourceFiles:Object.fromEntries(sourceInputFiles.map(file=>[file,sha(readFileSync(path.join(source,file)))])),datasetManifest,bindings,sourceHashes,sourceFingerprint:sha(JSON.stringify(sourceHashes)),paidSlotRequirementSatisfied:capture.paidSlotRequirementSatisfied,sourceConditionAcknowledgment:option('acknowledge-source-condition')??null,results:[],executionStatus:'preparing',quality:'pending_semantic_review',coverage:{productionModelLoop:true,productionToolSchemas:true,productionToolExecutor:true,actualPostgreSQL:true,actualPostgREST:true,actualWorker:true,workerCompletionBarrier:'synchronous local scheduling; original queued tool response is preserved; production async waiting and automatic completion notification are not reproduced',productionAsyncCompletionNotification:false,productionAuth:false,externalDelivery:false,vectorRetrieval:false}};
manifest.workerSourceHashes=workerSourceHashes;manifest.sourceConditionApprovalDate=option('acknowledge-source-condition')?'2026-10-22':null;manifest.evaluationClock=null;manifest.baselineClock=baselineClock;manifest.requestClockPolicy=requestClockPolicy;manifest.captureClock=capture.capturedAt;
manifest.datasetManifestFile=datasetManifestFile;manifest.datasetManifestHash=sha(readFileSync(datasetPath(datasetManifestFile)));manifest.selectedCaseIds=cases.map((example:any)=>example.id);
if(cases.some((example:any)=>example.deliverCompletionNotices)) {
  manifest.coverage.productionCompletionHandler=true;
  manifest.coverage.productionCompanyUpdateLoop=true;
  manifest.coverage.completionTransport='Local direct call of the real result-notice route after Worker completion; production queue transport and external delivery are not covered';
}
manifest.localMigrations=localMigrations.map(file=>({file,sha256:sourceHashes[file]}));manifest.stateTables=stateTables;
manifest.hostAwakeGuard=process.env.COMPANY_EVAL_HOST_AWAKE_GUARD??null;
manifest.coverage.productionWebChatHttpTransport=false;
manifest.sourceInventoryPolicy={beta:'Static local imports reachable from the actual runner and the production web chat route, plus package/lock/tsconfig/migration. The route is preserved for the transport contract but is not executed by this model-loop harness.',worker:'Production opp Python files and actual scoring/capture/environment harness dependencies',auxiliary:'Unused UI helpers, tests, docs and diagnostic runners are preserved separately; they do not define runtime drift',unresolvedDynamicImports};
manifest.auxiliarySourceHashes=Object.fromEntries(auxiliarySources.map(file=>[file,sha(readFileSync(path.join(root,file)))]));manifest.workerAuxiliarySourceHashes=Object.fromEntries(workerAuxiliarySources.map(file=>[file,sha(readFileSync(path.join(workerRoot,file)))]));
manifest.repositories=Object.fromEntries([['beta',root],['worker',workerRoot]].map(([name,cwd])=>[name,{head:execFileSync('git',['rev-parse','HEAD'],{cwd,encoding:'utf8'}).trim(),trackedDiffSha256:sha(execFileSync('git',['diff','--binary','HEAD'],{cwd,maxBuffer:32*1024*1024}))}]));
save('manifest.json',manifest);save('source-snapshot.json',sources.map(file=>({file,content:readFileSync(path.join(root,file),'utf8')})));save('worker-source-snapshot.json',workerSources.map(file=>({file,content:readFileSync(path.join(workerRoot,file),'utf8')})));save('frozen-inputs.json',{baselineClock,requestClockPolicy,captureClock:capture.capturedAt,bindings,cases:cases.map((c:any)=>({...c,turns:c.turns.map(bind)}))});
save('auxiliary-source-snapshot.json',auxiliarySources.map(file=>({file,content:readFileSync(path.join(root,file),'utf8')})));save('worker-auxiliary-source-snapshot.json',workerAuxiliarySources.map(file=>({file,content:readFileSync(path.join(workerRoot,file),'utf8')})));
config({path:path.join(root,'.env.local'),quiet:true});
const realFetch=globalThis.fetch;
let activeDirectory=directory,providerSequence=0,providers:Promise<unknown>[]=[];
const blockedNetwork:any[]=[];
globalThis.fetch=(async(input:any,init?:any)=>{
  const url=new URL(typeof input==='string'?input:input.url??String(input));
  const loopback=['127.0.0.1','localhost'].includes(url.hostname);
  const provider=mode==='run'&&['api.openai.com','api.anthropic.com','openrouter.ai'].includes(url.hostname);
  if(!loopback&&!provider) {blockedNetwork.push({origin:url.origin,path:url.pathname});throw Error(`Evaluation network blocked: ${url.origin}${url.pathname}`);}
  const sequence=++providerSequence,start=Date.now();
  const response=await realFetch(input,init);
  if(provider) {
    const file=path.join(activeDirectory,`provider-${sequence}.json`);
    providers.push(response.clone().text().then(raw=>writeFileSync(file,JSON.stringify({endpoint:url.origin+url.pathname,request:typeof init?.body==='string'?JSON.parse(init.body):null,status:response.status,elapsedMs:Date.now()-start,response:raw}),{mode:0o600})));
  }
  return response;
}) as typeof fetch;
async function runWorker(databaseUrl:string,runId:string,output:string) {
  mkdirSync(output,{mode:0o700});const log=openSync(path.join(output,'process.log'),'a',0o600);
  const worker=path.resolve(root,'../harper_worker');
  await new Promise<void>((resolve,reject)=>{
    const child=spawn(path.join(worker,'venv/bin/python'),['llm_evals/company_agentic_role_search/run_scoring.py','--database-url',databaseUrl,'--run-id',runId,'--output',output],{cwd:worker,stdio:['ignore',log,log]});
    child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(`Actual Worker exited ${code}; inspect ${output}`)));
  });
}
async function main(){
  // Imports occur only after all environment and egress boundaries are installed.
  const {createClient}=await import('@supabase/supabase-js');
  const {buildOrgAgentPromptContext}=await import('../src/lib/org/agent/context');
  const {runOrgAgentToolLoop,runOrgAgentCompletion,buildAssistantMetadata}=await import('../src/lib/org/agent/chat');
  const {insertOrgAgentMessage}=await import('../src/lib/org/agent/store');
  const {executeOrgAgentTool}=await import('../src/lib/org/agent/toolExecution');
  const {resolveOrgAgentModel}=await import('../src/lib/org/agent/modelConfig');
  const {readOrgCandidateDetail}=await import('../src/lib/org/candidatePreview.server');
  const modelResolution=resolveOrgAgentModel(option('model'));const model=modelResolution.model;manifest.model=model;manifest.modelResolution=modelResolution;
  const selected=mode==='prepare'?[{id:'preflight',turns:[]}]:cases;
  for(const example of selected){
    const unit=path.join(directory,example.id);mkdirSync(unit,{mode:0o700});activeDirectory=unit;
    if(example.requires==='existing_team_for_primary_role'&&!internal.team_id){manifest.results.push({id:example.id,status:'not_observed',reason:'Actual selected Role has no team; no fabricated team is added'});continue;}
    const sandbox=await startCompanySearchSandbox({root,runDirectory:unit,authUser:user,preserveDatabase:(option('preserve-cases')??'').split(',').includes(example.id),migrations:localMigrations,...(scoringBaseline?{baseline:scoringBaseline.database,pgPort:scoringBaseline.pgPort}:{})});
    process.env.NEXT_PUBLIC_SUPABASE_URL=sandbox.url;process.env.SUPABASE_SERVICE_ROLE_KEY='local-evaluation-only';process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='local-evaluation-only';
    const admin:any=createClient(sandbox.url,'local-evaluation-only',{auth:{persistSession:false,autoRefreshToken:false}});
    const write=(file:string,value:unknown)=>writeFileSync(path.join(unit,file),JSON.stringify(value,null,2)+'\n',{mode:0o600});
    const readState=async()=>{const state:any={};for(const table of stateTables){const rows:any[]=[];for(let offset=0;;offset+=1000){const q=await admin.from(table).select('*').order(['company_internal_roles','company_roles'].includes(table)?'role_id':'id').range(offset,offset+999);if(q.error)throw q.error;rows.push(...(q.data??[]));if((q.data??[]).length<1000)break;}state[table]=rows;}return state;};
    const trace:any[]=[],outputs:any[]=[],completions:any[]=[],harnessErrors:string[]=[];let error:string|null=null;const started=Date.now();
    let anchor=Math.max(...tables.company_messages.map((m:any)=>Number(m.id)))+1000;
    try {
      write('state-before.json',await readState());
      let context=await buildOrgAgentPromptContext({admin,user:user as any,conversation,currentUserMessageId:anchor,includeSharedConversation:true,readAudience:'company_safe',scopeKey:`eval:${runId}:${example.id}`});
      write('initial-context.json',context);
      if(mode==='prepare'){
        const preview=await readOrgCandidateDetail({admin,user:user as any,workspaceId,roleId,talentId:bindings.candidateA});
        write('unpresented-profile.json',preview);
        const existingId=[...presented][0];
        if(existingId) write('existing-profile.json',await readOrgCandidateDetail({admin,user:user as any,workspaceId,roleId,talentId:existingId as string}));
      }
      for(const [turnIndex,raw] of example.turns.entries()){
        const prompt=bind(raw);
        const message=await insertOrgAgentMessage({admin,conversation,content:prompt,role:'user',roleId,userId:actorId});anchor=message.id;
        const requestTime=new Date();
        write(`turn-${turnIndex+1}-clock.json`,{requestTime:requestTime.toISOString(),policy:requestClockPolicy,baselineClock,userMessageId:anchor});
        context=await buildOrgAgentPromptContext({admin,user:user as any,conversation,currentUserMessageId:anchor,includeSharedConversation:true,readAudience:'company_safe',scopeKey:`eval:${runId}:${example.id}`});
        write(`turn-${turnIndex+1}-context.json`,context);
        const result=await runOrgAgentToolLoop({actorId,actorLabel:user.user_metadata.name??'팀원',admin,context,conversation,currentUserMessageId:anchor,mentions:[],model,readAudience:'company_safe',scopeKey:`eval:${runId}:${example.id}`,source:'chat',slackThreadId:null,user:user as any,userMessage:prompt,responseLocale:'ko',capabilityMode:'progressive'},
          {requestTime,complete:async args=>{
            const {signal:_signal,...request}=args;const call:any={index:completions.length+1,request,startedAt:new Date().toISOString()};completions.push(call);const t=Date.now();
            try{const result=await runOrgAgentCompletion({...args,candidateEmailWorkspaceId:undefined});call.response=result.response;call.actualModel=result.model;return result;}
            catch(error){call.error=formatToolError(error);throw error;}finally{call.elapsedMs=Date.now()-t;write('completions.json',completions);}
          },executeTool:async args=>{
            const toolStarted=Date.now();const entry:any={name:args.name,input:args.input,callId:args.callId,startedAt:new Date().toISOString()};trace.push(entry);
            try{const result=await executeOrgAgentTool(args);entry.result=result;entry.toolReturnedAt=new Date().toISOString();entry.toolElapsedMs=Date.now()-toolStarted;
              if(args.name==='request_matching_search'||args.name==='publish_role_recommendations'){
                // The tool has already committed its queued receipt. Worker
                // completion is a local scheduling barrier, never its result.
                try{
                  const {data,error}=await admin.from('company_first_search_runs').select('id').eq('contract_version','company_agentic_role_search_v1').eq('status','queued').eq('company_workspace_id',workspaceId);
                  if(error)throw error;
                  entry.workerExecutions=[];
                  for(const run of data??[]){
                    const execution:any={runId:run.id,startedAt:new Date().toISOString()};entry.workerExecutions.push(execution);const workerStarted=Date.now();
                    try{await runWorker(sandbox.databaseUrl,run.id,path.join(unit,`worker-${run.id}`));execution.status='completed';}
                    catch(workerError){
                      execution.status='failed';execution.error=formatToolError(workerError);entry.workerExecutionError=execution.error;
                      const durable=await admin.from('company_first_search_runs').select('status,error_code,error_message').eq('id',run.id).single();execution.durableState=durable.data;
                      if(durable.error||durable.data?.status!=='failed')harnessErrors.push(`Worker failure was not durably finalized for ${run.id}: ${execution.error}`);
                    }finally{execution.finishedAt=new Date().toISOString();execution.elapsedMs=Date.now()-workerStarted;}
                  }
                }catch(barrierError){entry.workerExecutionError=formatToolError(barrierError);harnessErrors.push(entry.workerExecutionError);}
              }
              return result;
            }catch(error){entry.error=formatToolError(error);throw error;}finally{entry.finishedAt=new Date().toISOString();entry.elapsedMs=Date.now()-toolStarted;write('tool-trace.json',trace);}
          }});
        outputs.push({turn:turnIndex+1,requestTime:requestTime.toISOString(),input:prompt,reply:result.reply,usage:result.usage,toolResults:result.state.toolResults,completionError:'completionError'in result?result.completionError:null});write('outputs.json',outputs);write(`turn-${turnIndex+1}-tool-transcript.json`,(result as any).toolTranscript??{unavailable:true});
        if('completionError' in result&&result.completionError){error=String(result.completionError);break;}
        if(result.reply)await insertOrgAgentMessage({admin,conversation,content:result.reply,role:'assistant',roleId,model:result.model,metadata:buildAssistantMetadata(result)});
        if(example.deliverCompletionNotices) {
          // Exercise the production completion handler and company-update tool
          // loop, replacing only queue transport with local direct dispatch.
          process.env.INTERNAL_WORKER_API_SECRET='local-evaluation-only';
          const {POST}=await import('../src/app/api/internal/company-first/result-notice/route');
          const {NextRequest}=await import('next/server');
          const delivered=new Set<string>();
          const events:any[]=[];
          for(let cycle=0;cycle<8;cycle++) {
            const {data:jobs,error:jobsError}=await admin.from('company_first_search_runs').select('id,status,result').eq('company_workspace_id',workspaceId).eq('contract_version','company_agentic_role_search_v1');
            if(jobsError)throw jobsError;
            const queued=(jobs??[]).filter((row:any)=>row.status==='queued');
            for(const row of queued)await runWorker(sandbox.databaseUrl,row.id,path.join(unit,`worker-${row.id}`));
            const pending=(jobs??[]).filter((row:any)=>['succeeded','failed'].includes(row.status)
              && !delivered.has(row.id) && !row.result?.companyNotice
              && row.id!==(scoringBaseline as any)?.sourceRunId);
            // Only events belonging to this scenario; frozen historical runs
            // are not replayed as new notices.
            const before=JSON.parse(readFileSync(path.join(unit,'state-before.json'),'utf8'));
            const oldIds=new Set(before.company_first_search_runs.map((row:any)=>row.id));
            const fresh=pending.filter((row:any)=>!oldIds.has(row.id));
            for(const row of fresh) {
              const response=await POST(new NextRequest('http://127.0.0.1/api/internal/company-first/result-notice',{
                method:'POST',headers:{authorization:'Bearer local-evaluation-only','content-type':'application/json'},body:JSON.stringify({runId:row.id})}));
              const body=await response.json();events.push({runId:row.id,status:response.status,body});delivered.add(row.id);
              write(`turn-${turnIndex+1}-completion-events.json`,events);
              if(!response.ok)throw Error(`Local completion handler failed: ${JSON.stringify(body)}`);
            }
            if(!queued.length&&!fresh.length)break;
            if(cycle===7)throw Error('Evaluation completion dispatcher did not reach idle; inspect recorded events');
          }
        }
        write(`turn-${turnIndex+1}-state-after.json`,await readState());
      }
      if(harnessErrors.length){write('harness-errors.json',harnessErrors);error=`invalid_harness: ${harnessErrors.join('; ')}`;}
      write('state-after.json',await readState());
    }catch(e){error=formatToolError(e);write('error.json',{error});try{write('state-after.json',await readState());}catch(stateError){write('state-capture-error.json',{error:formatToolError(stateError)});}}
    finally{await sandbox.stop();}
    const summary={id:example.id,status:error?'error':mode==='prepare'?'preflight_passed':'executed',error,turns:outputs.length,expectedTurns:example.turns.length,toolCalls:trace.length,completionCount:completions.length,elapsedMs:Date.now()-started,quality:'pending_semantic_review'};manifest.results.push(summary);save('manifest.json',manifest);console.log(JSON.stringify(summary));
  }
  await Promise.all(providers);save('network-boundary.json',{blockedNetwork,productionWrites:0,externalDelivery:false});
  const changed=(base:string,files:string[],hashes:Record<string,string>)=>files.flatMap(file=>{
    const current=existsSync(path.join(base,file))?readFileSync(path.join(base,file),'utf8'):null;
    const currentHash=current===null?null:sha(current);return currentHash===hashes[file]?[]:[{file,originalHash:hashes[file],currentHash,currentContent:current}];
  });
  const drift={runtime:changed(root,sources,sourceHashes),workerRuntime:changed(workerRoot,workerSources,workerSourceHashes),auxiliary:changed(root,auxiliarySources,manifest.auxiliarySourceHashes),workerAuxiliary:changed(workerRoot,workerAuxiliarySources,manifest.workerAuxiliarySourceHashes)};
  save('source-drift.json',drift);manifest.sourceChangedDuringRun=drift.runtime.length>0;manifest.workerSourceChangedDuringRun=drift.workerRuntime.length>0;
  manifest.auxiliarySourceChangedDuringRun=drift.auxiliary.length>0||drift.workerAuxiliary.length>0;
  manifest.executionStatus=manifest.results.some((r:any)=>r.status==='error')?'failed_or_incomplete':mode==='prepare'?'prepared':'executed_review_pending';save('manifest.json',manifest);
  if(manifest.executionStatus==='failed_or_incomplete')process.exitCode=1;
}
main().catch(error=>{save('fatal-error.json',{error:formatToolError(error)});console.error(formatToolError(error));process.exitCode=1;});
