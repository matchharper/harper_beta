// User-operated applications against five private, local-only test postings.
// Usage: node scripts/localE2e/manualFiveApplications.mjs setup <existing-local-email>
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { root, privateDir, stackEnv, sourceEnv, readJson, writeJson } from './env.mjs';

const dir = path.join(privateDir, 'manual-five-applications');
const configFile = path.join(dir, 'fixture.json');
const processFile = path.join(dir, 'processes.json');
const self = fileURLToPath(import.meta.url);
const appOrigin = 'http://localhost:3020';
const port = 8786;
const loginPort = 8787;
const command = process.argv[2];
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const html = content => `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Harper 지원 테스트</title><style>body{font:16px system-ui;margin:0;color:#262626;background:#f5f5f3}main{max-width:660px;margin:40px auto;padding:30px;background:white;border-radius:18px}label{display:block;margin:20px 0 8px}input:not([type=checkbox]),textarea{box-sizing:border-box;width:100%;padding:12px;border:1px solid #aaa;border-radius:8px}textarea{min-height:120px}button,a.button{display:inline-block;padding:14px 22px;background:#222;color:white;border:0;border-radius:8px;text-decoration:none;margin-top:20px}small{color:#666}</style><main>${content}</main></html>`;
async function localDatabase() {
  const { env } = stackEnv();
  const sql = postgres(env.DATABASE_URL, { max: 2 });
  if (new URL(env.DATABASE_URL).hostname !== '127.0.0.1' || (await sql`select id from local_e2e.environment`)[0]?.id !== 'harper-local-e2e') throw Error('Marked local database required');
  return { env, sql, admin: createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }) };
}
function alive(p) {
  if (!p) return false;
  try { return execFileSync('ps', ['-p', String(p.pid), '-o', 'command='], { encoding: 'utf8' }).includes(p.identity); } catch { return false; }
}
function start(name, bin, args, env) {
  const processes = readJson(processFile, {});
  if (alive(processes[name])) return;
  const log = path.join(dir, `${name}.log`);
  const fd = fs.openSync(log, 'w', 0o600);
  const child = spawn(bin, args, { cwd: root, env, detached: true, stdio: ['ignore', fd, fd] });
  child.unref(); fs.closeSync(fd);
  processes[name] = { pid: child.pid, identity: name === 'tunnel' ? `127.0.0.1:${port}` : args[0], log };
  writeJson(processFile, processes);
}

if (command === 'setup') {
  const email = process.argv[3]?.trim().toLowerCase();
  if (!email) throw Error('An exact existing local account email is required');
  const { env, sql } = await localDatabase();
  try {
    const users = await sql`select user_id,email from talent_users where lower(email)=${email} and deleted_at is null`;
    if (users.length !== 1) throw Error('Expected one existing local account');
    let f = readJson(configFile);
    if (f && f.userId !== users[0].user_id) throw Error('This fixture belongs to another local account');
    if (!f) {
      const roles = [ ['a','Luma Systems','Backend Engineer','API와 결제 서비스 개발'], ['b','Cedar Labs','Platform Engineer','개발자 플랫폼과 배포 자동화'], ['c','Orbit Data','Backend Engineer','데이터 파이프라인과 API 개발'], ['d','Moss Studio','Fullstack Engineer','B2B SaaS 제품 개발'], ['e','Pine Cloud','Platform Engineer','클라우드 서비스와 PostgreSQL 운영'] ];
      f = { fixture: 'career-manual-five-v1', userId: users[0].user_id, email, pathToken: crypto.randomBytes(24).toString('hex'), createdAt: new Date().toISOString(), roles: roles.map(([slug,company,title,description]) => ({slug,company:`[테스트] ${company}`,title,description,id:crypto.randomUUID(),workspaceId:crypto.randomUUID()})) };
      writeJson(configFile, f);
    }
    start('receiver', process.execPath, [self,'server'], process.env);
    start('tunnel', 'cloudflared', ['tunnel','--url',`http://127.0.0.1:${port}`,'--no-autoupdate'], process.env);
    let origin;
    for (let i=0;i<60;i++) {
      origin = fs.readFileSync(path.join(dir,'tunnel.log'),'utf8').match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
      if (origin) break;
      await new Promise(resolve => setTimeout(resolve,500));
    }
    if (!origin) throw Error('Temporary posting URL did not become ready');
    f.origin=origin;
    f.roles=f.roles.map(role=>({...role,url:`${origin}/fixture/${f.pathToken}/${role.slug}`}));
    writeJson(configFile,f);
    await sql.begin(async tx => {
      for (const r of f.roles) {
        const existing = await tx`select information from company_roles where role_id=${r.id}`;
        if (existing.length && existing[0].information?.testFixture !== f.fixture) throw Error('Role fixture ownership mismatch');
        await tx`insert into company_workspace(company_workspace_id,company_name,published_name,is_internal,company_description,external_roles_enabled) values(${r.workspaceId},${r.company},${r.company},true,${r.description},false) on conflict do nothing`;
        const information={testOnly:true,testFixture:f.fixture,testTalentIds:[f.userId]};
        await tx`insert into company_roles(role_id,company_workspace_id,name,source_type,source_provider,source_job_id,status,information,description,external_jd_url,location_text,work_mode) values(${r.id},${r.workspaceId},${r.title},'external','local-e2e',${f.fixture+'-'+r.slug},'active',${tx.json(information)},${r.description+'. Python, TypeScript, PostgreSQL 기반 서비스 개발. 동시 지원을 직접 확인하는 가상 공고이며 실제 회사에는 전달되지 않습니다.'},${r.url},'서울','hybrid') on conflict(role_id) do update set external_jd_url=excluded.external_jd_url`;
        await tx`insert into talent_opportunity_recommendation(talent_id,role_id,opportunity_type,fit_summary,model_version,feedback,saved_stage) select ${f.userId},${r.id},'external_jd','직접 테스트하도록 추가한 가상 공고입니다. 실제 회사로 전달되지 않습니다.','manual-five-fixture',null,null where not exists(select 1 from talent_opportunity_recommendation where talent_id=${f.userId} and role_id=${r.id})`;
        await tx`insert into talent_opportunity_memberships(talent_id,recommendation_id,role_id,explanation,rank) select ${f.userId},id,${r.id},'사용자가 직접 확인하기 위해 추가한 동시 지원 테스트 공고입니다.',${f.roles.indexOf(r)} from talent_opportunity_recommendation where talent_id=${f.userId} and role_id=${r.id} on conflict do nothing`;
      }
    });
    for(const key of ['BROWSER_USE_API_KEY','EXA_API_KEY'])env[key]=sourceEnv[key]||'';
    for(const key of ['APP_BASE_URL','NEXT_PUBLIC_APP_URL','NEXT_PUBLIC_SITE_URL','HARPER_LOCAL_APP_ORIGIN'])env[key]=appOrigin;
    env.HARPER_E2E_DIST_DIR='.local/full-stack/next-concurrent-applications';
    start('app',process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port','3020'],env);
    const verification=await sql`select count(*)::int as recommendations,count(*) filter(where talent_id<>${f.userId})::int as other_accounts from talent_opportunity_recommendation where role_id in ${sql(f.roles.map(r=>r.id))}`;
    console.log(JSON.stringify({email:f.email,app:appOrigin,login:`http://localhost:${loginPort}/local-login`,roles:f.roles,verification:verification[0]},null,2));
  } finally { await sql.end(); }
} else if (command === 'server') {
  const { admin, sql }=await localDatabase(); await sql.end();
  // A separate loopback listener is never routed through the posting tunnel.
  http.createServer(async(req,res)=>{
    const f=readJson(configFile);
    if(req.method!=="GET"||req.url!=="/local-login"||![`localhost:${loginPort}`,`127.0.0.1:${loginPort}`].includes(req.headers.host)) {res.writeHead(404);res.end();return;}
    res.setHeader("Cache-Control","no-store");res.setHeader("Referrer-Policy","no-referrer");
    try {
      const {data:link,error}=await admin.auth.admin.generateLink({type:"magiclink",email:f.email});if(error)throw error;
      if(link.user.id!==f.userId)throw Error("Local account changed");
      const {data:auth,error:verifyError}=await admin.auth.verifyOtp({token_hash:link.properties.hashed_token,type:"magiclink"});if(verifyError)throw verifyError;
      const fragment=new URLSearchParams({access_token:auth.session.access_token,refresh_token:auth.session.refresh_token,expires_in:String(auth.session.expires_in),token_type:"bearer",type:"magiclink"});
      res.setHeader("Set-Cookie","NEXT_LOCALE=ko; Path=/; SameSite=Lax");
      res.writeHead(303,{location:`${appOrigin}/auths/callback?next=${encodeURIComponent("/career")}&cl=ko#${fragment}`});res.end();
    } catch(error) {res.writeHead(400);res.end(error.message);}
  }).listen(loginPort,"127.0.0.1");
  http.createServer(async(req,res)=>{
    const f=readJson(configFile);
    const pathname=new URL(req.url,`http://127.0.0.1:${port}`).pathname;
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('Referrer-Policy','no-referrer');
    try {
      const prefix=`/fixture/${f.pathToken}/`;
      if(!pathname.startsWith(prefix)){res.writeHead(404);res.end('Not found');return;}
      const [slug,action,...extra]=pathname.slice(prefix.length).split('/');
      const role=f.roles.find(role=>role.slug===slug);
      if(!role||extra.length||action&&!['apply','submit'].includes(action)){res.writeHead(404);res.end('Not found');return;}
      if(req.method==='GET'&&action!=='submit') {
        res.setHeader('Content-Type','text/html; charset=utf-8');
        res.end(html(action==='apply'?`<h1>${escape(role.company)} · ${escape(role.title)}</h1><p>동시 지원 테스트용 페이지입니다. 제출 내용은 이 컴퓨터에만 기록되고 실제 회사로 전달되지 않습니다.</p><form action="${prefix}${slug}/submit" method="post" enctype="multipart/form-data"><label>이름<input name="name" required autocomplete="name"></label><label>이메일<input name="email" type="email" required></label><label>휴대폰 번호<input name="phone" type="tel" required></label>${['c','e'].includes(slug)?'<label>입사 가능일<input name="startDate" type="date" required></label>':''}<label>지원 동기<textarea name="motivation" required></textarea></label><label>이력서 PDF<input name="resume" type="file" accept=".pdf" required></label><small>20 MiB 이하 PDF. 파일 내용은 보관하지 않고 수신 여부와 파일명·크기·해시만 기록합니다.</small><label><input name="consent" type="checkbox" value="yes" required> 이 지원서의 정보를 로컬 테스트에 사용하는 데 동의합니다.</label><button type="submit">테스트 지원서 제출</button></form>`:`<h1>${escape(role.title)}</h1><h2>${escape(role.company)}</h2><p>${escape(role.description)}. Python, TypeScript, PostgreSQL로 안정적인 B2B SaaS 서비스를 개발합니다.</p><p>서울 · 정규직 · 하이브리드</p><p>연락처, 지원 동기, 기존 PDF 이력서${['c','e'].includes(slug)?', 입사 가능일':''}을 제출합니다.</p><p>Harper 동시 지원 테스트를 위해 만든 가상 공고입니다. 실제 채용이나 회사 연락으로 이어지지 않습니다.</p><a class="button" href="${prefix}${slug}/apply">지원하기</a>`));return;
      }
      if(req.method!=='POST'||action!=='submit'){res.writeHead(405);res.end();return;}
      const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>21*1024*1024)throw Error('20 MiB 이하의 PDF를 첨부해주세요.');chunks.push(chunk);}
      const data=await new Request('http://localhost/submit',{method:'POST',headers:{'content-type':req.headers['content-type']},body:Buffer.concat(chunks)}).formData();
      const fields=Object.fromEntries(['name','email','phone','startDate','motivation','consent'].map(key=>[key,String(data.get(key)??'')]));
      if(fields.email.trim().toLowerCase()!==f.email)throw Error('지정된 로컬 테스트 계정의 이메일을 입력해주세요.');
      if(!fields.name.trim()||!fields.phone.trim()||!fields.motivation.trim()||fields.consent!=='yes'||(['c','e'].includes(slug)&&!fields.startDate))throw Error('필수 항목과 동의를 확인해주세요.');
      const attachment=data.get('resume');if(!attachment||typeof attachment.arrayBuffer!=='function')throw Error('PDF 이력서를 첨부해주세요.');
      const bytes=Buffer.from(await attachment.arrayBuffer());if(bytes.length>20*1024*1024||!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))throw Error('20 MiB 이하 PDF 파일이 필요합니다.');
      const receipt={id:crypto.randomUUID(),receivedAt:new Date().toISOString(),roleId:role.id,company:role.company,fields,file:{name:attachment.name,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')}};
      fs.appendFileSync(path.join(dir,'submissions.jsonl'),JSON.stringify(receipt)+'\n',{mode:0o600});
      res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html(`<h1>테스트 지원서 접수 완료</h1><p>${escape(role.company)} · ${escape(role.title)}</p><p>${escape(fields.name)}님의 지원서와 ${escape(attachment.name)}를 수신했습니다.</p><p>접수 번호: ${receipt.id}</p><p>실제 회사에는 전달되지 않았습니다.</p>`));
    } catch(error) {res.writeHead(400,{'Content-Type':'text/plain; charset=utf-8'});res.end(error.message);}
  }).listen(port,'127.0.0.1',()=>console.log(`Local manual application receiver on ${port}`));
} else if(command==='status') {
  const f=readJson(configFile);
  console.log(JSON.stringify({email:f?.email,app:appOrigin,login:`http://localhost:${loginPort}/local-login`,services:Object.fromEntries(Object.entries(readJson(processFile,{})).map(([key,p])=>[key,alive(p)])),roles:f?.roles},null,2));
} else throw Error('Use setup <existing-local-email>|server|status');
