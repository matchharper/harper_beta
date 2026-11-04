// Deletes only the local, synthetic introduction fixture after evidence capture.
import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import {createClient} from '@supabase/supabase-js';
import {stackEnv,privateDir,readJson,writeJson} from './env.mjs';
import {assertLocalStack} from './isolation.mjs';
if(process.argv[2]!=='--apply')throw Error('Use --apply after stopping the task app/mail server.');
const {env}=stackEnv();assertLocalStack(env);
const fixtureFile=path.join(privateDir,'introduction-conversation.json');
const f=readJson(fixtureFile);
if(f?.fixture!=='agent-introduction-natural-v1')throw Error('Unexpected fixture');
const evidence='docs/evaluation/career-internal-introduction/runs/natural-e2e-v1';
if(readJson(path.join(evidence,'database-receipts.json'))?.fixture.workspaceId!==f.workspaceId)throw Error('Capture this fixture before cleanup');
const sql=postgres(env.DATABASE_URL,{max:1});
const admin=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const ids=[f.workspaceId,f.candidateId,f.companyUserId,...Object.values(f.roles)];
try{
  if(!(await sql`select id from local_e2e.environment where id='harper-local-e2e'`).length)throw Error('Not the local database');
  const roles=await sql`select information from company_roles where role_id=any(${Object.values(f.roles)}::uuid[])`;
  if(roles.length!==5||roles.some(r=>r.information?.testOnly!==true||r.information?.testFixture!==f.fixture))throw Error('Fixture identity changed');
  for(const id of [f.candidateId,f.companyUserId]){
    const result=await admin.auth.admin.getUserById(id);
    if(result.error||result.data.user?.app_metadata.localFixture!==f.fixture)throw Error('Auth fixture identity mismatch');
  }
  const deleted=await sql.begin(async tx=>{
    await tx`set local statement_timeout='15s'`;
    const tables=await tx`select c.table_name,array_agg(c.column_name) as columns
      from information_schema.columns c join information_schema.tables t using(table_schema,table_name)
      where c.table_schema='public' and t.table_type='BASE TABLE'
      and c.column_name in ('role_id','opportunity_id','talent_id','company_workspace_id','workspace_id','user_id','company_user_id','recipient_id')
      group by c.table_name`;
    const pending=[...tables];const counts={};
    while(pending.length){
      let progressed=false;
      for(let i=pending.length-1;i>=0;i--){
        const t=pending[i];
        const quote=x=>'"'+x.replaceAll('"','""')+'"';
        const where=t.columns.map(c=>`${quote(c)}::text=any($1::text[])`).join(' OR ');
        try{
          const count=await tx.savepoint(async q=>(await q.unsafe(`delete from public.${quote(t.table_name)} where ${where}`, [ids])).count);
          if(count)counts[t.table_name]=(counts[t.table_name]??0)+count;
          pending.splice(i,1);progressed=true;
        }catch(error){if(error.code!=='23503')throw error;}
      }
      if(!progressed)throw Error('Unresolved fixture references: '+pending.map(t=>t.table_name).join(','));
    }
    return counts;
  });
  for(const id of [f.candidateId,f.companyUserId]){const r=await admin.auth.admin.deleteUser(id);if(r.error)throw r.error;}
  const configFile=path.join(privateDir,'config.json');const config=readJson(configFile);
  const original=readJson(path.join(privateDir,'introduction-mail-config-backup.json'));
  const emails=['candidate-introduction@harper-local.test','team-introduction@harper-local.test'];
  config.recipients=config.recipients.filter(address=>!emails.includes(address)||original?.recipients?.includes(address));writeJson(configFile,config);
  const boxFile=path.join(privateDir,'mailbox.json');const box=readJson(boxFile);
  const mailIds=Object.entries(box.outgoing).filter(([,m])=>JSON.stringify(m.to).includes('introduction@harper-local.test')).map(([id])=>id);
  for(const id of mailIds)delete box.outgoing[id];
  for(const [key,id]of Object.entries(box.idempotency))if(mailIds.includes(id))delete box.idempotency[key];
  writeJson(boxFile,box);
  const receipt={at:new Date().toISOString(),workspaceId:f.workspaceId,rolesDeleted:5,authAccountsDeleted:2,capturedMessagesRemoved:mailIds.length,deleted};
  fs.writeFileSync(path.join(evidence,'cleanup-receipt.json'),JSON.stringify(receipt,null,2),{mode:0o600});
  fs.rmSync(fixtureFile);fs.rmSync(path.join(privateDir,'introduction-replay.json'),{force:true});
  fs.rmSync(path.join(privateDir,'introduction-mail-config-backup.json'),{force:true});
  console.log(receipt);
}finally{await sql.end();}
