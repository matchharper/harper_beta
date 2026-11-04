// Natural-input E2E fixture/inspection. Local database only; no production fallback.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import postgres from 'postgres';
import {createClient} from '@supabase/supabase-js';
import {stackEnv,privateDir,readJson,writeJson} from './env.mjs';
import {assertLocalStack} from './isolation.mjs';

export const origin='http://127.0.0.1:3041';
export function introductionEnv(){
  const {env}=stackEnv();
  for(const key of ['APP_BASE_URL','NEXT_PUBLIC_APP_URL','NEXT_PUBLIC_SITE_URL','HARPER_LOCAL_APP_ORIGIN'])env[key]=origin;
  env.HARPER_E2E_DIST_DIR='.local/full-stack/introduction-next';
  env.HARPER_LOCAL_MAIL_URL='http://127.0.0.1:3211';
  assertLocalStack(env);return env;
}
const env=introductionEnv();
const sql=postgres(env.DATABASE_URL,{max:1,prepare:false});
const admin=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const file=path.join(privateDir,'introduction-conversation.json');
const command=process.argv[2]??'inspect';
const read=(name)=>fs.readFileSync(`supabase/migrations/${name}`,'utf8');
const fixtureName='agent-introduction-natural-v1';
try {
  if(command==='prepare'){
    await sql.begin(async tx=>{
      if(!(await tx`select id from local_e2e.environment where id='harper-local-e2e'`).length)throw Error('Local DB marker missing');
      for(const [table,name]of [['company_users','20260930120009_company_user_locale.sql'],['company_workspace','20261017041500_company_workspace_locale.sql']])
        if(!(await tx`select 1 from information_schema.columns where table_schema='public' and table_name=${table} and column_name='locale'`).length)await tx.unsafe(read(name));
      if(!(await tx`select to_regclass('public.company_role_hiring_brief_history') as name`)[0].name)
        await tx.unsafe(read('20261022094500_company_hiring_brief_history.sql').split('create function public.capture_company_hiring_brief_history_v1')[0]);
      if(!(await tx`select 1 from information_schema.columns where table_schema='public' and table_name='company_internal_roles' and column_name='promotion_demand'`).length)
        await tx.unsafe(read('20261015002600_company_proactive_recruiting.sql').split('create unique index')[0]);
      if(!(await tx`select to_regclass('public.company_role_start_sessions') as name`)[0].name){
        const roleStart=read('20261025091944_role_start_existing_brief_history.sql');
        await tx.unsafe(roleStart.slice(roleStart.indexOf('create table if not exists public.company_role_start_sessions'),roleStart.indexOf('-- One vector per distinct')));
        await tx.unsafe(roleStart.slice(roleStart.indexOf('create table if not exists public.company_role_start_pools'),roleStart.indexOf('-- Where a person says')));
        await tx.unsafe('alter table public.company_role_start_sessions add column if not exists brief_source text');
      }
      if(!(await tx`select 1 from information_schema.columns where table_schema='public' and table_name='company_role_candidate_evaluations' and column_name='discovery_run_id'`).length)
        await tx.unsafe(read('20261026051109_shared_worker_role_evaluations.sql').split('-- A Role-search selection')[0]);
      if(!(await tx`select to_regprocedure('public.accepted_role_pair_is_available_v1(uuid)') as name`)[0].name){
        const original=read('20261023102919_scheduled_agentic_matching.sql');
        await tx.unsafe(original.slice(0,original.indexOf('-- A Role-slot root')));
        await tx.unsafe(original.slice(original.indexOf('create or replace function public.scheduled_talent_source_fingerprint_v1'),original.indexOf('-- The exact queued delivery')));
      }
      if(!(await tx`select to_regclass('public.company_email_outbox') as name`)[0].name){
        const email=read('20261015130959_company_connection_email_delivery.sql');
        await tx.unsafe(email.slice(0,email.indexOf('create or replace function')));
      }
      if(!(await tx`select to_regprocedure('public.company_role_email_recipients_v1(uuid)') as name`)[0].name){
        const email=read('20261023133155_company_candidate_email.sql');
        await tx.unsafe(email.slice(0,email.indexOf('-- 5. Company mail table')).replace(/^begin;/im,''));
      }
      if(!(await tx`select to_regprocedure('public.read_talent_contact_history_v1(uuid,integer,uuid,text,uuid[])') as name`)[0].name)
        await tx.unsafe(read('20261007125000_talent_contact_history.sql').replace(/^begin;/im,'').replace(/commit;\s*$/im,''));
      if(!(await tx`select to_regprocedure('public.enqueue_company_update_v1(uuid,uuid,text,text,jsonb)') as name`)[0].name)
        await tx.unsafe(read('20261013111553_preserve_presented_candidates_and_intro_decisions.sql').split('-- Existing company introductions')[0]);
      for(const [name,exists] of [
        ['20261103125705_internal_role_agent_introductions.sql',Boolean((await tx`select to_regclass('public.agent_contact_messages') as name`)[0].name)],
        ['20261103125930_career_concurrent_work.sql',Boolean((await tx`select to_regclass('public.talent_agent_work_runtime') as name`)[0].name)],
      ]) if(!exists){
        await tx.unsafe(read(name).replace(/^begin;/im,'').replace(/commit;\s*$/im,''));
        await tx`insert into local_e2e.migrations(name,sha256) values(${name},${crypto.createHash('sha256').update(read(name)).digest('hex')}) on conflict do nothing`;
      }
      await tx`notify pgrst,'reload schema'`;
    });
    let f=readJson(file);
    if(!f){f={fixture:fixtureName,workspaceId:crypto.randomUUID(),candidateId:crypto.randomUUID(),companyUserId:crypto.randomUUID(),roles:{},password:crypto.randomBytes(24).toString('base64url')};for(const key of ['active','paused','prepare','button','english'])f.roles[key]=crypto.randomUUID();writeJson(file,f);}
    for(const [key,email] of [['candidateId','candidate-introduction@harper-local.test'],['companyUserId','team-introduction@harper-local.test']]){
      const found=await admin.auth.admin.getUserById(f[key]);
      if(!found.data.user){const result=await admin.auth.admin.createUser({id:f[key],email,password:f.password,email_confirm:true,app_metadata:{localFixture:fixtureName}});if(result.error)throw result.error;f[key]=result.data.user.id;writeJson(file,f);}
    }
    await sql.begin(async tx=>{
      await tx`insert into company_workspace(company_workspace_id,company_name,published_name,is_internal,company_db_id,company_description,brief) values(${f.workspaceId},'Harper','Harper',true,900001,'채용 담당자와 후보자의 소통을 돕는 소프트웨어를 만듭니다.','제품 팀은 채용 과정에서 필요한 정보를 연결하고 반복 작업을 줄이는 제품을 개발합니다.') on conflict do nothing`;
      await tx`insert into company_users(user_id,email,name,is_authenticated,onboarding_completed_at) values(${f.companyUserId},'team-introduction@harper-local.test','이서연',true,now()) on conflict do nothing`;
      await tx`insert into company_user_workspace(company_user_id,company_workspace_id,authority) values(${f.companyUserId},${f.workspaceId},'owner') on conflict do nothing`;
      await tx`insert into talent_users(user_id,email,name,headline,bio,location) values(${f.candidateId},'candidate-introduction@harper-local.test','김민서','플랫폼 엔지니어','플랫폼 엔지니어로 6년 동안 Kubernetes 운영과 Terraform 배포 자동화를 담당했습니다. 주문 서비스 SLO와 온콜 runbook을 설계했습니다.','서울') on conflict do nothing`;
      await tx`insert into talent_setting(user_id,is_onboarding_done,profile_visibility,get_internal_recommendation,get_external_recommendation,status,preferred_locale) values(${f.candidateId},true,'open_to_matches',false,false,'stopped','ko') on conflict do nothing`;
      if(!(await tx`select 1 from talent_experiences where talent_id=${f.candidateId}`).length)
        await tx`insert into talent_experiences(talent_id,company_name,role,start_date,description) values(${f.candidateId},'오빗 소프트웨어','플랫폼 엔지니어','2020-03-01','Kubernetes 클러스터 운영과 Terraform 기반 배포 자동화를 맡았습니다. 주문 서비스의 SLO와 오류 예산 알림, 온콜 runbook을 구축했습니다.')`;
      for(const [key,id] of Object.entries(f.roles)){
        const name={active:'플랫폼 엔지니어',paused:'서비스 안정성 엔지니어',prepare:'인프라 엔지니어',button:'백엔드 플랫폼 엔지니어',english:'Platform Engineer'}[key];
        await tx`insert into company_roles(role_id,company_workspace_id,name,description,source_type,status,location_text,work_mode,information) values(${id},${f.workspaceId},${name},'Kubernetes 인프라와 SLO를 운영하고 장애 대응 체계를 개선합니다. Terraform 기반 배포 자동화와 온콜 운영 경험을 찾습니다. 팀 관리 경력은 필수가 아닙니다.','internal',${key==='paused'?'paused':'active'},'서울','hybrid',${tx.json({testOnly:true,testFixture:fixtureName,testTalentIds:[f.candidateId]})}) on conflict do nothing`;
        await tx`insert into company_internal_roles(role_id,request,is_company_first_search,is_promote,is_anonymous,email_notifications_enabled) values(${id},'## Hard constraints\n- Kubernetes 운영과 배포 자동화 경험을 확인합니다.\n\n## Preferred criteria\n- SLO와 온콜 운영을 개선한 구체적인 경험을 높게 평가합니다.',false,false,false,false) on conflict(role_id) do update set request=coalesce(company_internal_roles.request,excluded.request),is_company_first_search=false,is_promote=false,is_anonymous=false,email_notifications_enabled=false`;
      }
    });
    console.log({prepared:true,origin,fixture:fixtureName,workspaceId:f.workspaceId,candidateId:f.candidateId,roles:f.roles,remoteWrites:false});
  } else if(command==='career-queue'){
    const f=readJson(file);if(!f)throw Error('Run prepare first');
    const runs=await sql`select id from opportunity_discovery_run where talent_id=${f.candidateId} and trigger='agent_contact_received' and status='queued' and not_before<=now() order by created_at`;
    for(const run of runs){
      const result=spawnSync('.local/full-stack/venv/bin/python',['-c',`import os,sys,psycopg\nfrom psycopg.rows import dict_row\nfrom opp.worker import claim_opportunity_discovery_run\nfrom opp.career_agent import handoff_career_agent\nwith psycopg.connect(os.environ['DATABASE_URL'],row_factory=dict_row) as conn:\n run=claim_opportunity_discovery_run(conn,run_id=sys.argv[1])\n print(handoff_career_agent(conn,run) if run else {'claimed':False})`,run.id],{env,encoding:'utf8'});
      if(result.stdout)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);if(result.status)throw Error(`Career worker exited ${result.status}`);
    }
  } else if(command==='company-queue'){
    const f=readJson(file);if(!f)throw Error('Run prepare first');
    const jobs=await sql`select id from company_agent_web_action_jobs where company_workspace_id=${f.workspaceId} and status in ('queued','retry') and next_attempt_at<=now() order by created_at`;
    for(const job of jobs){
      const response=await fetch(`${origin}/api/queues/process-company-agent-web-action`,{method:'POST',headers:{authorization:`Bearer ${env.INTERNAL_WORKER_API_SECRET}`,'content-type':'application/json'},body:JSON.stringify({kind:'web_action_job',version:1,jobId:job.id})});
      console.log({jobId:job.id,status:response.status,body:await response.text()});
    }
  } else if(command==='inspect'){
    const f=readJson(file);if(!f)throw Error('Run prepare first');
    console.log(JSON.stringify({
      messages:await sql`select id,role,message_type,content,created_at from talent_messages where user_id=${f.candidateId} order by id`,
      recommendations:await sql`select id,role_id,feedback,shared_material_id,agent_introduction_root_id from talent_opportunity_recommendation where talent_id=${f.candidateId}`,
      agentMessages:await sql`select id,root_id,role_id,direction,body,receiver_job_id from agent_contact_messages where talent_id=${f.candidateId} order by created_at`,
      jobs:await sql`select id,status,action_name,last_error from company_agent_web_action_jobs where company_workspace_id=${f.workspaceId} order by created_at`,
    },null,2));
  } else throw Error('Use prepare or inspect');
}finally{await sql.end();}
