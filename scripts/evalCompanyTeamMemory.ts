/** Real team snapshot, original company tool loop, isolated PostgreSQL only. */
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {config} from 'dotenv';
import ts from 'typescript';
import {startCompanySearchSandbox} from './companyAgenticSearchSandbox.mjs';

const root=path.resolve(__dirname,'..'),task=path.join(root,'docs/evaluation/company-agentic-role-search');
const option=(name:string)=>process.argv.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3);
const run=option('run'),mode=option('mode')??'prepare';
if(!run||!/^[-\w.]+$/.test(run)||!['prepare','run'].includes(mode))throw Error('Fresh run ID and prepare/run required');
process.umask(0o077);
const directory=path.join(task,'runs',run);mkdirSync(directory,{mode:0o700});
const read=(file:string)=>JSON.parse(readFileSync(file,'utf8'));
const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const save=(file:string,value:unknown)=>writeFileSync(path.join(directory,file),JSON.stringify(value,null,2)+'\n',{mode:0o600});
const dataset=read(path.join(task,'team-memory-manifest-v1.json'));
for(const [file,digest] of Object.entries(dataset.files))if(hash(readFileSync(path.join(task,file)))!==digest)throw Error('Frozen dataset changed');
const source=path.join(task,'private','team-memory-source-v1'),capture=read(path.join(source,'manifest.json'));
for(const [file,digest] of Object.entries(capture.files))if(hash(readFileSync(path.join(source,file)))!==digest)throw Error('Frozen real source changed');
const tables=read(path.join(source,'tables.json'));
const conversation=tables.company_conversations.find((row:any)=>row.id===capture.conversationId);
const person=tables.company_users.find((row:any)=>row.user_id===capture.actorId);
const team=tables.company_workspace_teams.find((row:any)=>row.id===capture.teamId);
if(!conversation||!person||!team)throw Error('Exact captured team/actor/conversation required');
const user:any={id:person.user_id,app_metadata:{},user_metadata:{name:person.name}};
const example=read(path.join(task,dataset.casesFile)).cases[0];
const turns=example.turns.map((value:string)=>value.replaceAll('{{teamName}}',team.name));
const baselineFile=path.join(task,'runs','bootstrap-v3','baseline.json'),baseline=read(baselineFile);
const migrations=['supabase/migrations/20261022094500_company_hiring_brief_history.sql','supabase/migrations/20261022131500_company_search_inventory_provenance.sql'];
const cfg=ts.readConfigFile(path.join(root,'tsconfig.json'),ts.sys.readFile),opts=ts.parseJsonConfigFileContent(cfg.config,ts.sys,root).options;
const reachable=new Set<string>(),pending=[path.join(root,'scripts/evalCompanyTeamMemory.ts')];
while(pending.length){const file=pending.pop()!;if(reachable.has(file))continue;reachable.add(file);if(!/\.[cm]?[jt]sx?$/.test(file))continue;
  const tree=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true),modules=new Set<string>();
  const visit=(node:ts.Node)=>{if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))modules.add(node.moduleSpecifier.text);
    if(ts.isCallExpression(node)&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||(ts.isIdentifier(node.expression)&&node.expression.text==='require'))&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0]))modules.add(node.arguments[0].text);ts.forEachChild(node,visit);};visit(tree);
  for(const module of modules){const resolved=ts.resolveModuleName(module,file,opts,ts.sys).resolvedModule?.resolvedFileName;if(resolved?.startsWith(root+path.sep)&&!resolved.includes('/node_modules/')&&existsSync(resolved))pending.push(resolved);}
}
const files=[...new Set([...reachable].map(file=>path.relative(root,file)).concat(migrations,['scripts/captureCompanyTeamMemory.py','package.json','pnpm-lock.yaml','tsconfig.json']))].sort();
const sourceHashes=Object.fromEntries(files.map(file=>[file,hash(readFileSync(path.join(root,file)))]));
save('source-snapshot.json',files.map(file=>({file,content:readFileSync(path.join(root,file),'utf8')})));
const manifest:any={runId:run,mode,startedAt:new Date().toISOString(),dataset,captureManifestHash:hash(readFileSync(path.join(source,'manifest.json'))),baselineSchemaAndCommonData:baselineFile,baselineHash:hash(readFileSync(baselineFile)),sourceHashes,sourceFingerprint:hash(JSON.stringify(sourceHashes)),frozenInput:turns,
  provenance:'Fresh clone of immutable model baseline plus exact real team/company capture rows restored before initial-state hash. No membership or team is fabricated. Different source from original16.',
  productionWrites:0,externalDelivery:false,requestClockPolicy:'actual_turn_start',hostAwakeGuard:process.env.COMPANY_EVAL_HOST_AWAKE_GUARD??null,
  coverage:{actualCompanyModel:true,actualToolExecutor:true,actualPostgreSQL:true,actualPostgREST:true,teamRestrictedActor:false,productionAuth:false,paidRoleMatching:false},quality:'pending_semantic_review'};
save('manifest.json',manifest);config({path:path.join(root,'.env.local'),quiet:true});

async function main(){
  const realFetch=globalThis.fetch,providers:Promise<unknown>[]=[],blocked:any[]=[],mutations:any[]=[];let sequence=0;
  globalThis.fetch=(async(input:any,init?:any)=>{const url=new URL(typeof input==='string'?input:input.url??String(input));const provider=mode==='run'&&['api.openai.com','api.anthropic.com','openrouter.ai'].includes(url.hostname);
    if(!['127.0.0.1','localhost'].includes(url.hostname)&&!provider){blocked.push({origin:url.origin,path:url.pathname});throw Error(`Evaluation network blocked: ${url.origin}${url.pathname}`);}
    const index=++sequence,start=Date.now(),startedAt=new Date().toISOString();let request:any=null;try{request=typeof init?.body==='string'?JSON.parse(init.body):null;}catch{request=String(init?.body);}
    try{const response=await realFetch(input,init);if(provider)providers.push(response.clone().text().then(raw=>save(`provider-${index}.json`,{endpoint:url.origin+url.pathname,request,status:response.status,startedAt,elapsedMs:Date.now()-start,response:raw})));
      else if(['POST','PATCH','DELETE'].includes(init?.method??''))mutations.push({path:url.pathname,method:init.method,body:request,status:response.status});return response;
    }catch(error){if(provider)save(`provider-${index}.json`,{endpoint:url.origin+url.pathname,request,startedAt,elapsedMs:Date.now()-start,error:String(error)});throw error;}}) as typeof fetch;
  const sandbox=await startCompanySearchSandbox({root,runDirectory:directory,baseline:baseline.database,pgPort:baseline.pgPort,migrations});
  let state:(()=>Promise<any>)|undefined;
  try{
    const restoration=execFileSync(path.join(root,'../harper_worker/venv/bin/python'),[path.join(root,'scripts/captureCompanyTeamMemory.py'),'restore',`--directory=${source}`,`--database-url=${sandbox.databaseUrl}`],{cwd:root,encoding:'utf8'});save('restoration.json',{result:JSON.parse(restoration)});
    process.env.NEXT_PUBLIC_SUPABASE_URL=sandbox.url;process.env.SUPABASE_SERVICE_ROLE_KEY='local-evaluation-only';process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='local-evaluation-only';process.env.HARPER_LOCAL_E2E='1';
    const {createClient}=await import('@supabase/supabase-js');const admin:any=createClient(sandbox.url,'local-evaluation-only',{auth:{persistSession:false,autoRefreshToken:false}});
    const {buildOrgAgentPromptContext}=await import('../src/lib/org/agent/context');
    const {runOrgAgentToolLoop,runOrgAgentCompletion,buildAssistantMetadata}=await import('../src/lib/org/agent/chat');
    const {insertOrgAgentMessage}=await import('../src/lib/org/agent/store');
    const {executeOrgAgentTool}=await import('../src/lib/org/agent/toolExecution');
    const {resolveOrgAgentModel}=await import('../src/lib/org/agent/modelConfig');
    const {readCompanyMemory}=await import('../src/lib/org/agent/companyMemory');
    const {readOrgRoleAccess}=await import('../src/lib/org/teamAccess');
    const model=resolveOrgAgentModel().model;manifest.model=model;
    const stateTables=[...new Set(Object.keys(tables).concat(['company_memory_operations','company_first_search_runs','company_role_candidate_evaluations','company_intro_candidates','company_talent_requests','company_talent_relays','meeting_schedules','talent_progress','talent_opportunity_recommendation','talent_opportunity_fit','company_role_hiring_brief_history','company_agent_web_action_jobs']))];
    state=async()=>{const result:any={};for(const table of stateTables){const rows:any[]=[];for(let offset=0;;offset+=1000){const response=await admin.from(table).select('*').range(offset,offset+999);if(response.error)throw response.error;rows.push(...response.data);if(response.data.length<1000)break;}result[table]=rows;}return result;};
    const before=await state();save('state-before.json',before);manifest.initialStateHash=hash(JSON.stringify(before));
    save('access.json',await readOrgRoleAccess({admin,user,workspaceId:capture.workspaceId}));
    save('initial-memory.json',await readCompanyMemory({admin,user,workspaceId:capture.workspaceId,input:{scope:'team',teamId:capture.teamId}}));
    if(mode==='prepare'){manifest.executionStatus='prepared';return;}
    const trace:any[]=[],completions:any[]=[],outputs:any[]=[];
    for(const [index,input] of turns.entries()){
      const message=await insertOrgAgentMessage({admin,conversation,content:input,role:'user',roleId:null,userId:user.id});
      const requestTime=new Date();const context=await buildOrgAgentPromptContext({admin,user,conversation,currentUserMessageId:message.id,includeSharedConversation:true,readAudience:'company_safe',scopeKey:`eval:${run}:ARSTM01`});save(`turn-${index+1}-context.json`,context);
      const result=await runOrgAgentToolLoop({actorId:user.id,actorLabel:person.name??'팀원',admin,context,conversation,currentUserMessageId:message.id,mentions:[],model,readAudience:'company_safe',scopeKey:`eval:${run}:ARSTM01`,source:'chat',slackThreadId:null,user,userMessage:input,responseLocale:'ko',capabilityMode:'progressive'},
        {requestTime,complete:async args=>{const {signal:_signal,...request}=args;const call:any={index:completions.length+1,request,startedAt:new Date().toISOString()};completions.push(call);const start=Date.now();try{const value=await runOrgAgentCompletion({...args,candidateEmailWorkspaceId:undefined});call.response=value.response;call.actualModel=value.model;return value;}catch(error){call.error=String(error);throw error;}finally{call.elapsedMs=Date.now()-start;save('completions.json',completions);}},
          executeTool:async args=>{const entry:any={name:args.name,input:args.input,callId:args.callId,turn:index+1,startedAt:new Date().toISOString()};trace.push(entry);const start=Date.now();try{const value=await executeOrgAgentTool(args);entry.result=value;return value;}catch(error){entry.error=String(error);throw error;}finally{entry.elapsedMs=Date.now()-start;save('tool-trace.json',trace);}}});
      outputs.push({turn:index+1,input,requestTime:requestTime.toISOString(),reply:result.reply,usage:result.usage,toolResults:result.state.toolResults,completionError:'completionError'in result?result.completionError:null});save('outputs.json',outputs);save(`turn-${index+1}-tool-transcript.json`,(result as any).toolTranscript??null);
      if('completionError'in result&&result.completionError)throw Error(String(result.completionError));
      if(result.reply)await insertOrgAgentMessage({admin,conversation,content:result.reply,role:'assistant',roleId:null,model:result.model,metadata:buildAssistantMetadata(result)});
      save(`turn-${index+1}-memory.json`,await readCompanyMemory({admin,user,workspaceId:capture.workspaceId,input:{scope:'team',teamId:capture.teamId}}));
    }
    manifest.executionStatus='executed_review_pending';
  }catch(error){save('error.json',{error:String(error)});manifest.executionStatus='execution_error';process.exitCode=1;}
  finally{if(state)try{save('state-after.json',await state());}catch(error){save('state-capture-error.json',{error:String(error)});}await Promise.all(providers);save('network-boundary.json',{blocked,mutations,productionWrites:0,externalDelivery:false});await sandbox.stop();
    const drift=files.flatMap(file=>{const current=existsSync(path.join(root,file))?readFileSync(path.join(root,file),'utf8'):null;return current!==null&&hash(current)===sourceHashes[file]?[]:[{file,originalHash:sourceHashes[file],currentHash:current===null?null:hash(current),currentContent:current}];});save('source-drift.json',drift);manifest.sourceChangedDuringRun=drift.length>0;manifest.finishedAt=new Date().toISOString();save('manifest.json',manifest);console.log(JSON.stringify({run,status:manifest.executionStatus,sourceDrift:drift.length}));}
}
main().catch(error=>{save('fatal-error.json',{error:String(error)});console.error(String(error));process.exitCode=1;});
