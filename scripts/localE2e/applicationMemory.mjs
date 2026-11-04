import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { root, privateDir, stackEnv, sourceEnv, readJson, writeJson } from './env.mjs';
import { documents } from '../experiments/application-browser-lab/lib/fixture.js';

const version = Number(process.env.HARPER_APPLICATION_MEMORY_VERSION || '1');
if (![1, 2, 3, 4].includes(version)) throw Error('Unknown frozen fixture version');
const dir = path.join(privateDir, `application-memory-v${version}`);
const receiverPort = 8776 + version;
const appPort = 3010 + version;
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
const fixturePath = path.join(dir, 'fixture.json');
const command = process.argv[2];
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const expected = { name: 'Alex Example', email: version === 1 ? 'application-memory@harper-local.test' : version === 2 ? 'alex.example@harper-local.test' : version === 3 ? 'alex.reuse@harper-local.test' : 'alex.reuse.v4@harper-local.test', birthDate: '1994-06-15', phone: '01000001234', military: 'true', veteran: 'false', consent: 'true' };
const resume = version === 1 ? documents.resume : { name: 'alex-example-resume.pdf', buffer: fs.readFileSync(path.join(dir, 'alex-example-resume.pdf')) };
const resumeText = version === 1 ? 'Alex Example. Software engineer. Five years of TypeScript and Python experience.' : 'Alex Example\nSoftware Engineer\nFive years of TypeScript and Python experience.\nBuilds B2B SaaS APIs and data-processing services with PostgreSQL.';
const companyName = version === 1 ? 'Example Test Labs' : 'Example Labs';
const isolationNotice = version === 1 ? '가상 지원자만 사용하는 테스트입니다. 실제 회사로 전달되지 않습니다.' : '독립 검증 환경입니다. 입력 내용은 이 환경에만 보관되며 외부 채용사로 전송되지 않습니다.';
const consentNotice = version === 1 ? '이 테스트 회사의 채용 지원 처리 목적으로 위 정보와 이력서를 공유합니다. 실제 회사에는 전달되지 않습니다.' : '이 지원서 처리 목적으로 위 정보와 이력서를 공유합니다. 정보는 이 환경에만 보관됩니다.';
const escape = value => String(value).replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
let fixture = readJson(fixturePath);
if (!fixture) {
  fixture = { version, fixture: `application-memory-reuse-v${version}`, pathToken: crypto.randomBytes(18).toString('hex'), password: crypto.randomBytes(24).toString('base64url'), expected };
  for (const key of ['userId','workspaceId','roleA','roleB','conversationA','conversationB','documentId']) fixture[key] = crypto.randomUUID();
  writeJson(fixturePath, fixture);
}
const html = body => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${version === 1 ? "테스트 채용 지원" : "채용 지원"}</title><style>body{font:16px system-ui;margin:0;background:#f5f4f3;color:#1b1b1a}main{max-width:680px;margin:48px auto;padding:32px;background:white;border-radius:16px}label{display:block;margin:20px 0 6px}input:not([type=checkbox]),select{box-sizing:border-box;width:100%;padding:12px;border:1px solid #aaa;border-radius:6px}button,a.button{display:inline-block;background:#242424;color:white;padding:14px 24px;border:0;border-radius:8px;text-decoration:none;margin-top:24px}small{color:#555}pre{white-space:pre-wrap}</style></head><body><main>${body}</main></body></html>`;
if (command === 'server') {
  const prefix = `/fixture/${fixture.pathToken}`;
  http.createServer(async (req,res) => {
    const url = new URL(req.url,'http://127.0.0.1:8777');
    const match = url.pathname.match(new RegExp(`^${prefix}/(a|b)(/apply|/submit)?$`));
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
    if (!match) { res.writeHead(404);res.end('Not found');return; }
    const [,role,action=''] = match, title = role==='a'?'Backend Engineer — API Platform':'Backend Engineer — Product Platform';
    if (req.method==='GET') {
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.end(html(action === '/apply' ? `<h1>${title} 지원</h1><p>${isolationNotice}</p><form action="${prefix}/${role}/submit" method="post" enctype="multipart/form-data"><label>이름<input name="name" autocomplete="name" required></label><label>이메일<input name="email" type="email" required></label><label>생년월일<input name="birthDate" type="date" required></label><label>휴대폰 번호<input name="phone" type="tel" required></label><label>병역 이행 여부<select name="military" required><option value="">선택</option><option value="true">예 (true)</option><option value="false">아니오 (false)</option></select></label><label>보훈 대상 여부<select name="veteran" required><option value="">선택</option><option value="true">예 (true)</option><option value="false">아니오 (false)</option></select></label><label>이력서<input name="resume" type="file" accept=".pdf" required></label><label><input name="consent" type="checkbox" value="true" required> 개인정보 공유에 동의합니다</label><small>${consentNotice}</small><br><button type="submit">지원서 제출</button></form>` : `${version === 1 ? "<p>TEST ONLY · 합성 채용 공고</p>" : ""}<h1>${title}</h1><h2>${companyName}</h2><p>Python·TypeScript·PostgreSQL을 활용해 B2B SaaS API와 데이터 처리 기능을 개발합니다. API 설계·운영 경험 3년 이상인 백엔드 엔지니어를 찾습니다.</p><p>서울 · 정규직 · 하이브리드</p><h2>지원 항목</h2><p>이름, 이메일, 생년월일, 휴대폰 번호, 개인정보 공유 동의, 병역 이행 여부, 보훈 대상 여부, PDF 이력서</p><p>${version === 1 ? "이 공고와 회사는 테스트용입니다. 실제 채용이나 연락이 발생하지 않습니다." : isolationNotice}</p><a class="button" href="${prefix}/${role}/apply">지원하기</a>`));return;
    }
    if (req.method!=='POST'||action!=='/submit') {res.writeHead(405);res.end();return;}
    try {
      const chunks=[];let size=0;
      for await (const chunk of req) {size+=chunk.length;if(size>2*1024*1024)throw Error('Fixture accepts files up to 2 MiB');chunks.push(chunk);}
      const request = new Request('http://localhost/submit',{method:'POST',headers:{'content-type':req.headers['content-type']},body:Buffer.concat(chunks)});
      const form=await request.formData(), fields=Object.fromEntries(Object.keys(expected).map(key=>[key,String(form.get(key)??'')]));
      fields.phone=fields.phone.replace(/[^0-9]/g,'');
      for(const [key,value] of Object.entries(expected))if(fields[key]!==value)throw Error(`Only the designated synthetic applicant is accepted (${key})`);
      const file=form.get('resume');if(!file||typeof file.arrayBuffer!=='function')throw Error('PDF resume is required');
      const bytes=Buffer.from(await file.arrayBuffer());
      if(sha(bytes)!==sha(resume.buffer))throw Error('Only the designated synthetic resume is accepted');
      const receiptPath=path.join(dir,`receipt-${role}.json`);
      const receipt=readJson(receiptPath)||{id:crypto.randomUUID(),role,receivedAt:new Date().toISOString(),fields,resume:{name:file.name,size:bytes.length,sha256:sha(bytes)}};
      writeJson(receiptPath,receipt);
      res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html(`<h1>지원서 접수 완료</h1><p>테스트 서버가 모든 항목과 이력서 파일을 수신했습니다.</p><p>접수 번호: ${receipt.id}</p><pre>${escape(JSON.stringify(receipt,null,2))}</pre>`));
    } catch(error) {res.writeHead(400,{'Content-Type':'text/plain; charset=utf-8'});res.end(error.message);}
  }).listen(receiverPort,'127.0.0.1',()=>console.log(`Isolated application form listening on 127.0.0.1:${receiverPort}`));
} else if(command==='app') {
  const {env}=stackEnv();
  for(const key of ['BROWSER_USE_API_KEY','EXA_API_KEY']) env[key]=sourceEnv[key]||'';
  for(const key of ['APP_BASE_URL','NEXT_PUBLIC_APP_URL','NEXT_PUBLIC_SITE_URL','HARPER_LOCAL_APP_ORIGIN'])env[key]=`http://localhost:${appPort}`;
  env.HARPER_E2E_DIST_DIR=`.local/full-stack/next-application-memory${version === 1 ? '' : '-v'+version}`;
  if (version >= 3) {
    env.HARPER_APPLICATION_MEMORY_TRACE_DIR = dir;
    env.NODE_OPTIONS = `--import=${path.join(root, 'scripts/localE2e/applicationMemoryTrace.mjs')}`;
  }
  const child=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port',String(appPort)],{cwd:root,env,stdio:'inherit'});
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>child.kill(signal));
} else if(command==='seed') {
  const origin=process.argv[3];if(!origin||!new URL(origin).hostname.endsWith('.trycloudflare.com'))throw Error('Expected temporary fixture tunnel URL');
  const {env}=stackEnv();const sql=postgres(env.DATABASE_URL,{max:1});
  try {
    if(new URL(env.DATABASE_URL).hostname!=='127.0.0.1'||(await sql`select id from local_e2e.environment`)[0]?.id!=='harper-local-e2e')throw Error('Local DB required');
    const admin=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
    if(!(await admin.auth.admin.getUserById(fixture.userId)).data.user){const {data,error}=await admin.auth.admin.createUser({id:fixture.userId,email:expected.email,password:fixture.password,email_confirm:true,user_metadata:{localE2e:true,full_name:expected.name}});if(error)throw error;fixture.userId=data.user.id;writeJson(fixturePath,fixture);}
    fixture.origin=origin;fixture.urls={a:`${origin}/fixture/${fixture.pathToken}/a`,b:`${origin}/fixture/${fixture.pathToken}/b`};
    const storagePath=`${fixture.userId}/${fixture.documentId}/${resume.name}`;
    const upload=await admin.storage.from('talent-resumes').upload(storagePath,resume.buffer,{contentType:'application/pdf',upsert:true});if(upload.error)throw upload.error;
    await sql.begin(async tx=>{
      await tx`insert into talent_users(user_id,email,name,headline,bio,resume_text) values(${fixture.userId},${expected.email},${expected.name},'Backend Engineer · Python / TypeScript',${version === 1 ? '합성 테스트 지원자입니다.' : 'Python과 TypeScript로 B2B SaaS API를 개발하는 백엔드 엔지니어입니다.'},'Alex Example. Five years of TypeScript and Python experience building reliable API services.') on conflict(user_id) do nothing`;
      await tx`insert into talent_setting(user_id,is_onboarding_done,profile_visibility,get_internal_recommendation,get_external_recommendation,status,preferred_locale) values(${fixture.userId},true,'exceptional_only',false,false,'stopped','ko') on conflict(user_id) do nothing`;
      await tx`insert into company_workspace(company_workspace_id,company_name,published_name,is_internal,company_description,external_roles_enabled) values(${fixture.workspaceId},${companyName},${companyName},true,${version === 1 ? '합성 테스트 회사' : 'B2B SaaS API와 데이터 처리 서비스를 개발합니다.'},false) on conflict do nothing`;
      for(const [key,letter,name] of [['roleA','a','Backend Engineer — API Platform'],['roleB','b','Backend Engineer — Product Platform']]){
        const info={testOnly:true,testFixture:fixture.fixture,testTalentIds:[fixture.userId]};
        await tx`insert into company_roles(role_id,company_workspace_id,name,source_type,source_provider,source_job_id,status,information,description,external_jd_url,location_text,work_mode) values(${fixture[key]},${fixture.workspaceId},${name},'external','local-e2e',${fixture.fixture+'-'+letter},'active',${tx.json(info)},${'Python·TypeScript·PostgreSQL 기반 B2B SaaS API를 설계하고 운영하는 백엔드 엔지니어를 찾습니다.' + (version === 1 ? ' 합성 테스트 공고입니다.' : '')},${fixture.urls[letter]},'서울','hybrid') on conflict(role_id) do update set external_jd_url=excluded.external_jd_url`;
        await tx`insert into talent_opportunity_recommendation(talent_id,role_id,opportunity_type,fit_summary,model_version) select ${fixture.userId},${fixture[key]},'external_jd',${version === 1 ? '백엔드 API 개발 경험과 관련된 테스트 공고입니다.' : 'Python·TypeScript 기반 API 개발 경험과 관련된 공고입니다.'},'manual-test-fixture' where not exists(select 1 from talent_opportunity_recommendation where talent_id=${fixture.userId} and role_id=${fixture[key]})`;
      }
      for(const key of ['conversationA','conversationB'])await tx`insert into talent_conversations(id,user_id,stage) values(${fixture[key]},${fixture.userId},'completed') on conflict do nothing`;
      await tx`insert into talent_documents(id,talent_id,kind,file_name,storage_path,content_type,size_bytes,extracted_text,is_primary,content_sha256) values(${fixture.documentId},${fixture.userId},'resume',${resume.name},${storagePath},'application/pdf',${resume.buffer.length},${resumeText},true,${sha(resume.buffer)}) on conflict do nothing`;
    });
    const auth=await admin.auth.signInWithPassword({email:expected.email,password:fixture.password});if(auth.error)throw auth.error;
    writeJson(path.join(dir,'session.json'),auth.data.session);writeJson(fixturePath,fixture);
    fs.writeFileSync(path.join(dir,resume.name),resume.buffer,{mode:0o600});
    console.log(JSON.stringify({userId:fixture.userId,roleA:fixture.roleA,roleB:fixture.roleB,urls:fixture.urls,app:`http://localhost:${appPort}/career`}));
  } finally {await sql.end();}
} else if(command==='inspect') {
  const {env}=stackEnv();const sql=postgres(env.DATABASE_URL,{max:1});
  try {
    const result={fixture:{userId:fixture.userId,roleA:fixture.roleA,roleB:fixture.roleB},profile:await sql`select name,email,phone_number from talent_users where user_id=${fixture.userId}`,memories:await sql`select ref,collection,content,source_refs,deleted_at from talent_contexts where talent_id=${fixture.userId} order by ref`,messages:await sql`select id,created_at,conversation_id,role,message_type,content,payload from talent_messages where user_id=${fixture.userId} order by id`,operations:await sql`select * from talent_external_operations where user_id=${fixture.userId}`,toolCalls:await sql`select type,created_at from logs where user_id=${fixture.userId} and type like 'career_tool_call%' order by created_at`,recommendations:await sql`select role_id,feedback,saved_stage from talent_opportunity_recommendation where talent_id=${fixture.userId}`};
    writeJson(path.join(dir,`inspection-${Date.now()}.json`),result);console.log(JSON.stringify(result));
  } finally {await sql.end();}
} else throw Error('Usage: applicationMemory.mjs server|app|seed <temporary-origin>|inspect');
