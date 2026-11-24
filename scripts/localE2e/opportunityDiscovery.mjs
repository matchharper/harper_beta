// Full local product-path evaluation; no production DB or external business effects.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { root, stackEnv, readJson, writeJson } from './env.mjs';

const task=path.join(root,'docs/evaluation/career-opportunity-discovery');
const dataset=process.env.HARPER_DISCOVERY_DATASET||'v1';
if(!/^v\d+$/.test(dataset))throw Error('Dataset version required');
const cases=readJson(path.join(task,`cases-${dataset}.json`));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const origin='http://localhost:3025';
const stateFile=path.join(task,'runs/app.json');
const {env}=stackEnv();
const sql=postgres(env.DATABASE_URL,{max:2});
if(new URL(env.DATABASE_URL).hostname!=='127.0.0.1'||(await sql`select id from local_e2e.environment`)[0]?.id!=='harper-local-e2e')throw Error('Marked local DB required');
const admin=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const cmd=process.argv[2];
async function capture(run){
  const userIds=run.accounts.map(a=>a.userId);
  const result={
    messages:await sql`select id,conversation_id,user_id,role,message_type,content,payload,created_at from talent_messages where user_id in ${sql(userIds)} order by id`,
    operations:await sql`select * from talent_external_operations where user_id in ${sql(userIds)} order by created_at`,
    opportunities:await sql`select * from career_opportunities where talent_id in ${sql(userIds)} order by display_order,id`,
    recommendations:await sql`select * from talent_opportunity_recommendation where talent_id in ${sql(userIds)} order by created_at`,
    views:await sql`select * from career_views where talent_id in ${sql(userIds)}`,
    context:await sql`select * from talent_contexts where talent_id in ${sql(userIds)} order by ref`,
    modelCosts:await sql`select id,user_id,estimated_cost_usd,cost_status,meta->>'costKind' as cost_kind from llm_logs where user_id in ${sql(userIds)} order by id`,
    logs:await sql`select * from logs where user_id in ${sql(userIds)} order by created_at`,
    sharedCounts:(await sql`select (select count(*) from company_db)::int companies,(select count(*) from company_roles)::int roles,(select count(*) from career_public_observations)::int observations`)[0]
  };
  writeJson(path.join(run.dir,'durable.json'),result);return result;
}
try{
  if(cmd==='app'){
    const dir=path.join(task,'runs',new Date().toISOString().replace(/[:.]/g,'-')+'-app');fs.mkdirSync(dir,{recursive:true,mode:0o700});
    const providers=dotenv.parse(fs.readFileSync(path.join(root,'.env.local')));
    for(const key of ['EXA_API_KEY','EXA_SERVICE_API_KEY'])if(!env[key]&&providers[key])env[key]=providers[key];
    for(const key of ['APP_BASE_URL','NEXT_PUBLIC_APP_URL','NEXT_PUBLIC_SITE_URL','HARPER_LOCAL_APP_ORIGIN'])env[key]=origin;
    env.HARPER_E2E_DIST_DIR='.local/full-stack/next-opportunity-discovery';
    env.HARPER_APPLICATION_MEMORY_TRACE_DIR=dir;
    env.NODE_OPTIONS=`--import=${path.join(root,'scripts/localE2e/applicationMemoryTrace.mjs')}`;
    writeJson(stateFile,{dir,origin,startedAt:new Date().toISOString()});
    const fd=fs.openSync(path.join(dir,'app.log'),'a',0o600);
    const child=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port','3025'],{cwd:root,env,detached:true,stdio:['ignore',fd,fd]});child.unref();fs.closeSync(fd);
    writeJson(stateFile,{dir,origin,pid:child.pid,startedAt:new Date().toISOString()});console.log(JSON.stringify({origin,traceDir:dir,pid:child.pid}));
  }else if(cmd==='run'){
    const frozen=readJson(path.join(task,`manifest-${dataset}.json`));if(!frozen)throw Error('Freeze manifest before generation');
    for(const [name,digest]of Object.entries(frozen.hashes))if(sha(fs.readFileSync(path.join(task,name)))!==digest)throw Error('Frozen input changed');
    const label=process.argv[3];if(!label||!/^[-a-z0-9]+$/.test(label))throw Error('Explicit run label required');
    const selected=process.argv[4]?.split(',');const targets=cases.cases.filter(c=>!selected||selected.includes(c.id));if(!targets.length)throw Error('No cases');
    const dir=path.join(task,'runs',new Date().toISOString().replace(/[:.]/g,'-')+'-'+label);fs.mkdirSync(dir,{recursive:true,mode:0o700});
    const helpers=await sql`select proname from pg_proc where pronamespace='public'::regnamespace and proname in ('external_role_index_vector','external_role_has_type','external_role_salary_satisfaction')`;
    if(helpers.length!==3)throw Error('Local Role retrieval helpers are missing. Inspect schema drift before treating this as a product run. See task README.');
    const sources=['src/lib/career/prompts/main.md','src/lib/career/handbooks/opportunitySearch.ts','src/lib/career/handbooks/methods/index.ts','src/lib/career/handbooks/registry.ts','src/lib/llm/toolDescriptions.ts','src/lib/career/capabilities/registry.ts','src/lib/career/chatTurn.ts','src/lib/career/resources/search.ts','src/lib/career/resources/tools.ts','src/lib/career/opportunities/tool.ts','src/lib/career/matching/searchPlan.ts','src/lib/career/textChatModelConfig.ts'];
    sources.push('src/lib/tools/documentCache.ts','src/lib/tools/webSearch.ts','src/lib/agentTools/web.ts','src/lib/talentOnboarding/tools.ts','src/lib/career/resources/webResult.ts');
    sources.push('src/lib/career/prompts/conversationPlan.ts','src/lib/career/prompts/postOnboardingGuide.ts','src/lib/career/saveJobPosting.ts','src/lib/career/jobLinkImport.ts','src/lib/career/jobLinkImportServer.ts','src/lib/career/background/scheduledModel.ts');
    writeJson(path.join(dir,'sources.json'),Object.fromEntries(sources.map(f=>[f,fs.readFileSync(path.join(root,f),'utf8')])));
    const run={dir,label,startedAt:new Date().toISOString(),fixtureHashes:frozen.hashes,app:readJson(stateFile),sourceRevision:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),accounts:[],results:[]};
    for(const c of targets){
      const email=`discovery-${c.id}-${crypto.randomUUID()}@local.invalid`,password=crypto.randomBytes(24).toString('base64url');
      const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{localE2e:true,full_name:c.name}});if(created.error)throw created.error;
      const userId=created.data.user.id,conversationId=crypto.randomUUID();
      await sql.begin(async tx=>{
        await tx`insert into talent_users(user_id,email,name,headline,bio,resume_text) values(${userId},${email},${c.name},${c.headline},${c.background},${c.background}) on conflict(user_id) do nothing`;
        await tx`insert into talent_setting(user_id,is_onboarding_done,profile_visibility,get_internal_recommendation,get_external_recommendation,status,preferred_locale) values(${userId},true,'dont_share',false,false,'stopped','ko') on conflict(user_id) do nothing`;
        await tx`insert into talent_conversations(id,user_id,stage) values(${conversationId},${userId},'completed')`;
      });
      const auth=await admin.auth.signInWithPassword({email,password});if(auth.error)throw auth.error;
      writeJson(path.join(dir,`${c.id}-session.json`),auth.data.session);
      run.accounts.push({caseId:c.id,userId,conversationId,email});
    }
    writeJson(path.join(dir,'run.json'),run);await capture(run);console.log('Run directory: '+dir);
    let cursor=0;await Promise.all(Array.from({length:Math.min(2,targets.length)},async()=>{
      while(cursor<targets.length){const c=targets[cursor++],a=run.accounts.find(a=>a.caseId===c.id),session=readJson(path.join(dir,`${c.id}-session.json`));
        const began=Date.now();let status,error;
        try{for(const [index,message] of [c.message,...(c.followups??[])].entries()){
          const response=await fetch(origin+'/api/talent/chat',{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json',Accept:'text/event-stream'},body:JSON.stringify({conversationId:a.conversationId,message,clientRequestId:crypto.randomUUID()}),signal:AbortSignal.timeout(850000)});status=response.status;const stream=await response.text();fs.writeFileSync(path.join(dir,`${c.id}-turn-${index+1}-stream.txt`),stream,{mode:0o600});
          if(status!==200)throw Error(`Turn ${index+1}: HTTP ${status}`);
          await capture(run);
        }}
        catch(e){error=String(e);}
        const item={caseId:c.id,startedAt:new Date(began).toISOString(),endedAt:new Date().toISOString(),elapsedMs:Date.now()-began,status,error};run.results.push(item);writeJson(path.join(dir,'run.json'),run);await capture(run);console.log(JSON.stringify(item));
      }
    }));run.finishedAt=new Date().toISOString();writeJson(path.join(dir,'run.json'),run);await capture(run);
  }else if(cmd==='inspect'){
    const dir=path.resolve(process.argv[3]);if(!dir.startsWith(path.join(task,'runs')+path.sep))throw Error('Task run required');const run=readJson(path.join(dir,'run.json'));const data=await capture(run);console.log(JSON.stringify({dir,messages:data.messages.length,opportunities:data.opportunities.length,operations:data.operations.map(o=>({kind:o.kind,status:o.status})),sharedCounts:data.sharedCounts}));
  }else throw Error('Use app | run <label> <case-ids> | inspect <run-directory>');
}finally{await sql.end();}
