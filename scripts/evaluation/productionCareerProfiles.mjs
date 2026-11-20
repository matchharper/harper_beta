import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

export const root = path.resolve('docs/evaluation/career-agent-autonomy/private/production-profiles');
export const fixture = 'career-scenarios-nov-2026';
const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!['auth.matchharper.com', 'zzojrniuppueizhnmqfd.supabase.co'].includes(new URL(projectUrl).hostname))
  throw Error('Expected Harper production Auth');
const admin = createClient(projectUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
function persistOwner(file, account) {
  const temporary = file + '.' + randomUUID();
  writeFileSync(temporary, JSON.stringify(account), {mode:0o600});
  renameSync(temporary, file);
}
const checked = response => { if (response.error) throw new Error(response.error.message); return response.data };
export async function prepareProfile(number, run, setup) {
  if (!/^(0[1-9]|[12][0-9]|3[0-9]|40)$/.test(number) || !/^[a-z0-9-]+$/.test(run)) throw Error('Invalid case or run');
  const dir = path.join(root, run, number);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, 'owner.json');
  if (!existsSync(file)) {
    const recipient = process.env.CAREER_QA_INBOX;
    if (!recipient || !/^[a-z0-9._-]+@[a-z0-9.-]+$/i.test(recipient)) throw Error('Set CAREER_QA_INBOX to an owned plus-addressable test mailbox');
    const [local, domain] = recipient.split('@');
    const email = `${local}+harperqa-${number}-${randomUUID().slice(0,8)}@${domain}`;
    writeFileSync(file, JSON.stringify({ email, password: randomBytes(32).toString('base64url'), number, run }), { flag: 'wx', mode: 0o600 });
  }
  const account = JSON.parse(readFileSync(file, 'utf8'));
  if (!account.userId) {
    const created = await admin.auth.admin.createUser({email: account.email, password: account.password, email_confirm: true,
      app_metadata: { careerQaFixture: fixture, careerQaCase: number, careerQaRun: run }, user_metadata: { full_name: setup.name }});
    if (created.error) {
      // Only recover this attempt using its own password. Never reset an existing account.
      const login = createClient(projectUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      account.userId = checked(await login.auth.signInWithPassword({email:account.email,password:account.password})).user.id;
    } else account.userId = created.data.user.id;
    persistOwner(file, account);
  }
  const user = checked(await admin.auth.admin.getUserById(account.userId)).user;
  if (user.email !== account.email || user.app_metadata.careerQaFixture !== fixture || user.app_metadata.careerQaCase !== number || user.app_metadata.careerQaRun !== run) throw Error('Fixture identity mismatch');
  if (!existsSync(path.join(dir, 'prepared.json'))) {
    const deadline = new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'short'}).format(Date.now()+4*3600000);
    setup = {...setup,docs:setup.docs?.map(doc=>({...doc,text:doc.text.replaceAll('{DEADLINE}', deadline)})),cards:setup.cards?.map(card=>({...card,body:card.body.replaceAll('{DEADLINE}', deadline)}))};
    checked(await admin.from('talent_users').upsert({ user_id:user.id, email:user.email, name:setup.name, ...setup.profile }, {onConflict:'user_id'}));
    checked(await admin.from('talent_setting').upsert({user_id:user.id, profile_visibility:'dont_share', get_internal_recommendation:false,
      get_external_recommendation:false, status:'stopped', is_onboarding_done:setup.onboarded, preferred_locale:setup.locale??'ko'}, {onConflict:'user_id'}));
    if (setup.onboarded) {
      const conversationId = account.conversationId ?? randomUUID();
      account.conversationId = conversationId;
      persistOwner(file, account);
      checked(await admin.from('talent_conversations').upsert({id:conversationId,user_id:user.id,stage:'completed'}, {onConflict:'id',ignoreDuplicates:true}));
      const prior = checked(await admin.from('talent_messages').select('role,content').eq('user_id',user.id).eq('conversation_id',conversationId).order('id'));
      if (prior.length && !setup.history?.every((msg, i)=>prior[i]?.content===msg.content && prior[i]?.role===msg.role))
        throw Error('An unfinished setup contains a different conversation; use a fresh run name.');
      if (!prior.length && setup.history?.length) {
        checked(await admin.from('talent_messages').insert(setup.history.map(msg=>({...msg,user_id:user.id,conversation_id:conversationId}))));
      }
      for (const doc of setup.docs ?? []) {
        const digest=createHash('sha256').update(doc.text).digest('hex');
        const storagePath=user.id+'/qa-documents/'+digest+'.txt';
        const bytes=Buffer.from(doc.text);
        const upload=await admin.storage.from('talent-resumes').upload(storagePath,bytes,{upsert:true,contentType:'text/plain'});
        checked(upload);
        const existing=checked(await admin.from('talent_documents').select('id').eq('talent_id',user.id).eq('content_sha256',digest).maybeSingle());
        if(!existing) checked(await admin.from('talent_documents').insert({talent_id:user.id,file_name:doc.title.replace(/\.pdf$/i,'')+'.txt',kind:'document',is_public:false,is_primary:false,is_deleted:false,storage_path:storagePath,extracted_text:doc.text,content_type:'text/plain',size_bytes:bytes.length,content_sha256:digest}));
      }
      for (const card of setup.cards ?? []) {
        const source = checked(await admin.from('talent_documents').select('id')
          .eq('talent_id',user.id).eq('file_name',card.doc+'.txt').single());
        const existing = checked(await admin.from('career_opportunities').select('id')
          .eq('talent_id',user.id).contains('primary_ref',{kind:'document',id:source.id}).maybeSingle());
        if (!existing) checked(await admin.rpc('career_write_opportunity_v1',{
          p_user:user.id,p_id:randomUUID(),p_expected_revision:0,p_actor:'user',
          p_patch:{primary_ref:{kind:'document',id:source.id},title:card.doc,body:card.body,saved:true,
            ...(card.stage ? {application_stage:card.stage} : {})}
        }));
      }
      if (setup.interview) {
        const start = new Date();
        // Tomorrow at 11:00 in Seoul. Isolate the date to this account.
        const koreaDate = new Date(Date.now() + 33*3600000).toISOString().slice(0,10);
        start.setTime(Date.parse(koreaDate+'T11:00:00+09:00'));
        const key = fixture+':'+user.id+':interview';
        const existing = checked(await admin.from('meeting_schedules').select('id').eq('talent_id',user.id).eq('source_key',key).maybeSingle());
        if (!existing) checked(await admin.from('meeting_schedules').insert({
          talent_id:user.id,title:setup.interview.title,content:setup.interview.content,source_key:key,idempotency_key:key,
          scheduling_source:'external',status:'confirmed',confirmed_start_at:start.toISOString(),confirmed_end_at:new Date(+start+1800000).toISOString(),
          timezone:'Asia/Seoul',company_attendees:[]
        }));
      }
    }
    writeFileSync(path.join(dir, 'prepared.json'), JSON.stringify({ number, preparedAt:new Date().toISOString(), setup }), { mode:0o600 });
  }
  return {dir,account};
}

export async function portfolioLink(prepared, pdf) {
  const objectPath = prepared.account.userId + '/qa-documents/team-portfolio.pdf';
  checked(await admin.storage.from('talent-resumes').upload(objectPath,readFileSync(pdf),{contentType:'application/pdf',upsert:true}));
  return checked(await admin.storage.from('talent-resumes').createSignedUrl(objectPath,3600)).signedUrl;
}

// Prepare a private bookmark for practicing an interview without contacting the company.
export async function preparePracticeRole(account, roleId) {
  const role = checked(await admin.from('company_roles').select('role_id,name')
    .eq('role_id',roleId).eq('source_type','external').eq('is_expired',false).single());
  const existing = checked(await admin.from('talent_opportunity_recommendation').select('id')
    .eq('talent_id',account.userId).eq('role_id',role.role_id).limit(1).maybeSingle());
  if (!existing) checked(await admin.from('talent_opportunity_recommendation').insert({
    talent_id:account.userId,role_id:role.role_id,opportunity_type:'external_jd',feedback:'like',saved_stage:'saved',
  }));
  return role.name;
}
