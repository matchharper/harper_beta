// Actual local product + real providers + an isolated five-posting receiver.
// This script never replaces the Career agent or its tools.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { root, privateDir, stackEnv, sourceEnv, readJson, writeJson } from './env.mjs';

const dir = path.join(privateDir, 'concurrent-applications-v1');
fs.mkdirSync(dir, {recursive:true,mode:0o700});
const file = path.join(dir,'fixture.json');
let f = readJson(file);
const roles = [
  ['a','Luma Systems','Backend Engineer','API와 결제 서비스 개발'],
  ['b','Cedar Labs','Platform Engineer','개발자 플랫폼과 배포 자동화'],
  ['c','Orbit Data','Backend Engineer','데이터 파이프라인과 API 개발'],
  ['d','Moss Studio','Fullstack Engineer','B2B SaaS 제품 개발'],
  ['e','Pine Cloud','Platform Engineer','클라우드 서비스와 PostgreSQL 운영'],
];
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
if(!f){
  f={fixture:'career-concurrent-applications-v1',round:1,pathToken:crypto.randomBytes(18).toString('hex'),password:crypto.randomBytes(24).toString('base64url'),userId:crypto.randomUUID(),conversationId:crypto.randomUUID(),documentId:crypto.randomUUID(),email:'alex.concurrent@harper-local.test',name:'Alex Example',phone:'01000001234',startDate:'2026-12-01',roles:roles.map(([slug,company,title,description])=>({slug,company,title,description,id:crypto.randomUUID(),workspaceId:crypto.randomUUID()}))};
  writeJson(file,f);
}
const resumePath = path.join(dir,'alex-example-resume.pdf');
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const html=body=>`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>채용 지원</title><style>body{font:16px system-ui;color:#1b1b1a;background:#f5f4f3;margin:0}main{max-width:680px;margin:40px auto;background:white;padding:30px;border-radius:16px}label{display:block;margin:18px 0 6px}input:not([type=checkbox]),textarea{box-sizing:border-box;width:100%;padding:12px;border:1px solid #aaa;border-radius:6px}textarea{min-height:100px}button,a.button{display:inline-block;background:#242424;color:white;padding:14px 24px;border:0;border-radius:8px;text-decoration:none;margin-top:20px}small{color:#555}</style></head><body><main>${body}</main></body></html>`;
async function database(){const {env}=stackEnv();const sql=postgres(env.DATABASE_URL,{max:2});if(new URL(env.DATABASE_URL).hostname!=='127.0.0.1'||(await sql`select id from local_e2e.environment`)[0]?.id!=='harper-local-e2e')throw Error('Isolated local database required');return {env,sql,admin:createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})};}
const command=process.argv[2];
if(command==='server'){
 http.createServer(async(req,res)=>{
  f=readJson(file);const prefix=`/fixture/${f.pathToken}/round-${f.round}`;
  const url=new URL(req.url,'http://127.0.0.1:8785');const match=url.pathname.match(new RegExp(`^${prefix}/([a-e])(/apply|/submit)?$`));
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
  if(!match){res.writeHead(404);res.end('Not found');return;}
  const [,slug,action='']=match,role=f.roles.find(r=>r.slug===slug);
  if(req.method==='GET'){
   res.setHeader('Content-Type','text/html; charset=utf-8');
   res.end(html(action==='/apply'?`<h1>${role.company} · ${role.title} 지원</h1><p>독립 검증 환경입니다. 외부 채용사에 전달되지 않습니다.</p><form action="${prefix}/${slug}/submit" method="post" enctype="multipart/form-data"><label>이름<input name="name" autocomplete="name" required></label><label>이메일<input name="email" type="email" required></label><label>휴대폰 번호<input name="phone" type="tel" required></label>${['c','e'].includes(slug)?'<label>입사 가능일<input name="startDate" type="date" required></label>':''}<label>지원 동기<textarea name="motivation" required></textarea></label><label>이력서<input name="resume" type="file" accept=".pdf" required></label><label><input name="consent" type="checkbox" value="yes" required> 이 지원서 처리 목적의 개인정보 제공에 동의합니다</label><small>입력 자료는 이 검증 환경에만 저장됩니다.</small><br><button type="submit">지원서 제출</button></form>`:`<h1>${role.title}</h1><h2>${role.company}</h2><p>${role.description}. Python, TypeScript, PostgreSQL로 안정적인 B2B SaaS 서비스를 개발합니다. 관련 개발 경력 3년 이상.</p><p>서울 · 정규직 · 하이브리드</p><h2>지원 방법</h2><p>아래 지원서에서 연락처, 지원 동기, PDF 이력서를 제출해주세요.${['c','e'].includes(slug)?' 입사 가능일을 함께 입력해주세요.':''}</p><p>독립 검증용 채용 페이지입니다. 실제 회사로 전달되지 않습니다.</p><a class="button" href="${prefix}/${slug}/apply">지원하기</a>`));return;
  }
  if(req.method!=='POST'||action!=='/submit'){res.writeHead(405);res.end();return;}
  try{
   const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>3*1024*1024)throw Error('The fixture accepts up to 3 MiB');chunks.push(c);}
   const form=await new Request('http://localhost/submit',{method:'POST',headers:{'content-type':req.headers['content-type']},body:Buffer.concat(chunks)}).formData();
   const fields=Object.fromEntries(['name','email','phone','startDate','motivation','consent'].map(k=>[k,String(form.get(k)??'')]));
   if(fields.name!==f.name||fields.email!==f.email||fields.phone.replace(/[^0-9]/g,'')!==f.phone||fields.consent!=='yes')throw Error('Only the designated synthetic applicant and consent are accepted');
   if(['c','e'].includes(slug)&&fields.startDate!==f.startDate)throw Error('The confirmed start date is required');
   if(!fields.motivation.trim())throw Error('A motivation is required');
   const attachment=form.get('resume');if(!attachment||typeof attachment.arrayBuffer!=='function')throw Error('PDF resume required');
   const bytes=Buffer.from(await attachment.arrayBuffer());if(sha(bytes)!==sha(fs.readFileSync(resumePath)))throw Error('Original synthetic resume required');
   const receipt={id:crypto.randomUUID(),round:f.round,role:slug,receivedAt:new Date().toISOString(),fields,resume:{name:attachment.name,bytes:bytes.length,sha256:sha(bytes)}};
   const target=path.join(dir,`round-${f.round}`);fs.mkdirSync(target,{recursive:true,mode:0o700});
   // Every POST remains visible, including duplicates; don't mask agent failures.
   fs.appendFileSync(path.join(target,'submissions.jsonl'),JSON.stringify(receipt)+'\n',{mode:0o600});
   writeJson(path.join(target,`receipt-${slug}.json`),receipt);
   res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html(`<h1>지원서 접수 완료</h1><p>${role.company} · ${role.title}</p><p>지원자: ${escape(fields.name)}</p><p>접수 번호: ${receipt.id}</p><p>이력서와 지원서를 수신했습니다.</p>`));
  }catch(error){res.writeHead(400,{'Content-Type':'text/plain; charset=utf-8'});res.end(error.message);}
 }).listen(8785,'127.0.0.1',()=>console.log('Five-posting receiver: 127.0.0.1:8785'));
}else if(command==='app'){
 const {env}=stackEnv();for(const k of ['BROWSER_USE_API_KEY','EXA_API_KEY'])env[k]=sourceEnv[k]||'';
 for(const k of ['APP_BASE_URL','NEXT_PUBLIC_APP_URL','NEXT_PUBLIC_SITE_URL','HARPER_LOCAL_APP_ORIGIN'])env[k]='http://localhost:3020';
 env.HARPER_E2E_DIST_DIR='.local/full-stack/next-concurrent-applications';env.HARPER_APPLICATION_MEMORY_TRACE_DIR=path.join(dir,`round-${f.round}`);
 fs.mkdirSync(env.HARPER_APPLICATION_MEMORY_TRACE_DIR,{recursive:true,mode:0o700});env.NODE_OPTIONS=`--import=${path.join(root,'scripts/localE2e/applicationMemoryTrace.mjs')}`;
 const child=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port','3020'],{cwd:root,env,stdio:'inherit'});
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
}else if(command==='seed'){
 const origin=process.argv[3]??f.origin;if(!origin||!new URL(origin).hostname.endsWith('.trycloudflare.com'))throw Error('Temporary receiver tunnel URL required');
 const {env,sql,admin}=await database();try{
  const user=await admin.auth.admin.getUserById(f.userId);if(!user.data.user){const created=await admin.auth.admin.createUser({id:f.userId,email:f.email,password:f.password,email_confirm:true,user_metadata:{localE2e:true,full_name:f.name}});if(created.error)throw created.error;}
  f.origin=origin;f.roles=f.roles.map(r=>({...r,url:`${origin}/fixture/${f.pathToken}/round-${f.round}/${r.slug}`}));
  const bytes=fs.readFileSync(resumePath),storagePath=`${f.userId}/${f.documentId}/alex-example-resume.pdf`;
  const uploaded=await admin.storage.from('talent-resumes').upload(storagePath,bytes,{contentType:'application/pdf',upsert:true});if(uploaded.error)throw uploaded.error;
  await sql.begin(async tx=>{
   await tx`insert into talent_users(user_id,email,name,phone_number,headline,bio,resume_text) values(${f.userId},${f.email},${f.name},${f.phone},'Backend Engineer · Python / TypeScript','Python과 TypeScript로 B2B SaaS API를 개발하는 백엔드 엔지니어입니다.','Alex Example. Five years of TypeScript and Python experience building B2B SaaS APIs with PostgreSQL.') on conflict(user_id) do update set deleted_at=null,phone_number=excluded.phone_number`;
   await tx`insert into talent_setting(user_id,is_onboarding_done,profile_visibility,get_internal_recommendation,get_external_recommendation,status,preferred_locale) values(${f.userId},true,'exceptional_only',false,false,'stopped','ko') on conflict(user_id) do nothing`;
   for(const r of f.roles){
    await tx`insert into company_workspace(company_workspace_id,company_name,published_name,is_internal,company_description,external_roles_enabled) values(${r.workspaceId},${r.company},${r.company},true,${r.description},false) on conflict do nothing`;
    const info={testOnly:true,testFixture:f.fixture,testTalentIds:[f.userId]};
    await tx`insert into company_roles(role_id,company_workspace_id,name,source_type,source_provider,source_job_id,status,information,description,external_jd_url,location_text,work_mode) values(${r.id},${r.workspaceId},${r.title},'external','local-e2e',${f.fixture+'-'+r.slug},'active',${tx.json(info)},${r.description+' — Python, TypeScript, PostgreSQL 개발 경험 3년 이상. 독립 검증용 공고.'},${r.url},'서울','hybrid') on conflict(role_id) do update set external_jd_url=excluded.external_jd_url`;
    await tx`insert into talent_opportunity_recommendation(talent_id,role_id,opportunity_type,fit_summary,model_version,feedback,saved_stage) select ${f.userId},${r.id},'external_jd','백엔드 API 개발 경험과 관련된 공고입니다.','manual-test-fixture','like','saved' where not exists(select 1 from talent_opportunity_recommendation where talent_id=${f.userId} and role_id=${r.id})`;
   }
   await tx`insert into talent_conversations(id,user_id,stage) values(${f.conversationId},${f.userId},'completed') on conflict do nothing`;
   await tx`insert into talent_documents(id,talent_id,kind,file_name,storage_path,content_type,size_bytes,extracted_text,is_primary,content_sha256) values(${f.documentId},${f.userId},'resume','alex-example-resume.pdf',${storagePath},'application/pdf',${bytes.length},'Alex Example. Software Engineer. Five years of TypeScript and Python experience. Builds B2B SaaS APIs and data-processing services with PostgreSQL.',true,${sha(bytes)}) on conflict do nothing`;
  });
  const auth=await admin.auth.signInWithPassword({email:f.email,password:f.password});if(auth.error)throw auth.error;
  writeJson(path.join(dir,'session.json'),auth.data.session);writeJson(file,f);
  console.log(JSON.stringify({round:f.round,userId:f.userId,urls:f.roles.map(r=>r.url),app:'http://localhost:3020/career'}));
 }finally{await sql.end();}
}else if(command==='reset'){
 // Stop this runner's app first: no in-flight invocation may write across rounds.
 const running=await fetch('http://127.0.0.1:3020/api/talent/session',{signal:AbortSignal.timeout(2000)}).then(()=>true,()=>false);
 if(running)throw Error('Stop the fixture app on 3020 before resetting');
 const {sql}=await database();try{
  const owner=await sql`select user_id,email from talent_users where user_id=${f.userId}`;
  if(owner[0]?.email!==f.email||f.fixture!=='career-concurrent-applications-v1')throw Error('Fixture ownership mismatch');
  const operations=await sql`select * from talent_external_operations where user_id=${f.userId}`;
  const archive={at:new Date().toISOString(),fixture:f.fixture,round:f.round,operations,
   messages:await sql`select * from talent_messages where user_id=${f.userId} order by id`,
   contexts:await sql`select * from talent_contexts where talent_id=${f.userId}`,
   logs:await sql`select * from llm_logs where user_id=${f.userId}`,
   recommendations:await sql`select * from talent_opportunity_recommendation where talent_id=${f.userId}`};
  writeJson(path.join(dir,`round-${f.round}`,'before-reset.json'),archive);
  process.env.BROWSER_USE_API_KEY=sourceEnv.BROWSER_USE_API_KEY;
  const {browserUseAgents}=await import('../../src/lib/career/simulation/browserUseAgents.ts');
  for(const session of operations.filter(o=>o.kind==='browser_session')){
   const run=operations.find(o=>o.id===session.provider_refs.current_execution_id);
   await browserUseAgents.stop({sessionId:session.provider_refs.session_id,workspaceId:session.provider_refs.workspace_id,runId:run?.provider_refs.run_id});
  }
  await sql.begin(async tx=>{
   if((await tx`select id from meeting_schedules where talent_id=${f.userId}`).length)throw Error('Unexpected meeting in application-only fixture');
   await tx`delete from llm_logs where user_id=${f.userId}`;
   await tx`delete from talent_users where user_id=${f.userId} and email=${f.email}`;
  });
  writeJson(path.join(dir,`round-${f.round}`,'reset.json'),{at:new Date().toISOString(),remoteSessionsStopped:operations.filter(o=>o.kind==='browser_session').length});
  f.round+=1;writeJson(file,f);console.log(JSON.stringify({reset:true,nextRound:f.round}));
 }finally{await sql.end();}
}else if(command==='inspect'){
 const {sql}=await database();try{
  const capture={at:new Date().toISOString(),round:f.round,messages:await sql`select id,created_at,role,message_type,content,payload from talent_messages where user_id=${f.userId} order by id`,operations:await sql`select * from talent_external_operations where user_id=${f.userId}`,contexts:await sql`select ref,content,source_refs from talent_contexts where talent_id=${f.userId} and deleted_at is null`};
  writeJson(path.join(dir,`round-${f.round}`,`capture-${Date.now()}.json`),capture);
  console.log(JSON.stringify({round:f.round,messages:capture.messages.map(m=>({id:m.id,role:m.role,type:m.message_type,text:m.content,form:m.payload?.formId})),operations:capture.operations.map(o=>({id:o.id,kind:o.kind,status:o.status,note:o.result?.note,error:o.result?.last_error}))}));
 }finally{await sql.end();}
}else if(command==='info'){console.log(JSON.stringify({round:f.round,userId:f.userId,conversationId:f.conversationId,roles:f.roles,dir}));}
else throw Error('Use server|app|seed <tunnel-origin>|inspect|info, or node --import tsx for reset');
