// Snapshot only this synthetic fixture. No environment values or auth tokens.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import {stackEnv, privateDir, readJson} from './env.mjs';
import {assertLocalStack} from './isolation.mjs';
const {env}=stackEnv(); assertLocalStack(env);
const f=readJson(path.join(privateDir,'introduction-conversation.json'));
const sql=postgres(env.DATABASE_URL,{max:1});
const destination='docs/evaluation/career-internal-introduction/runs/natural-e2e-v1';
try {
  const messages=await sql`select id,role,content,message_type,payload,created_at from talent_messages where user_id=${f.candidateId} order by id`;
  const recommendations=await sql`select * from talent_opportunity_recommendation where talent_id=${f.candidateId}`;
  const materials=await sql`select * from talent_role_materials where talent_id=${f.candidateId}`;
  const contacts=await sql`select * from agent_contact_messages where talent_id=${f.candidateId} order by created_at`;
  const companyMessages=await sql`select * from company_messages where company_workspace_id=${f.workspaceId} order by id`;
  const jobs=await sql`select * from company_agent_web_action_jobs where company_workspace_id=${f.workspaceId} order by created_at`;
  const runs=await sql`select * from opportunity_discovery_run where talent_id=${f.candidateId} order by created_at`;
  const evaluations=await sql`select * from company_role_candidate_evaluations where talent_id=${f.candidateId}`;
  const companyMail=await sql`select * from company_email_outbox where recipient_id=${f.companyUserId}`;
  const approvals=await sql`select * from company_workspace_credit_events where company_workspace_id=${f.workspaceId} and action_code='connect'`;
  const roles=await sql`select role_id,status,information from company_roles where company_workspace_id=${f.workspaceId}`;
  const mailbox=Object.values(readJson(path.join(privateDir,'mailbox.json')).outgoing).filter(m=>JSON.stringify(m.to).includes('introduction@harper-local.test'));
  const roots=contacts.filter(m=>m.id===m.root_id);
  assert.equal(roots.length,5);
  assert.equal(new Set(roots.map(m=>m.role_id)).size,5);
  assert.equal(companyMail.length,1);
  assert.equal(companyMail[0].status,'sent');
  const material=key=>materials.find(m=>m.id===recommendations.find(r=>r.role_id===f.roles[key]).shared_material_id);
  assert.equal(Number(material('active').profile_revision),2);
  assert.equal(Number(material('prepare').profile_revision),3);
  assert.ok(!JSON.stringify(material('active').profile_snapshot).includes('18분'));
  assert.ok(JSON.stringify(material('prepare').profile_snapshot).includes('45분에서 18분'));
  const receipt={at:new Date().toISOString(),fixture:{...f,password:undefined},roles,messages,recommendations,materials,contacts,companyMessages,jobs,runs,evaluations,companyMail,approvals,mailbox};
  fs.writeFileSync(path.join(destination,'database-receipts.json'),JSON.stringify(receipt,null,2),{mode:0o600});
  console.log({roots:roots.length,agentMessages:contacts.length,materialRevisions:{before:material('active').profile_revision,after:material('prepare').profile_revision},companyMail:companyMail.length,capturedMail:mailbox.length,companyJobs:jobs.map(j=>({id:j.id,status:j.status})),evaluations:evaluations.length,failedRuns:runs.filter(r=>r.status==='failed').map(r=>({id:r.id,error:r.error_message})),approvals:approvals.map(a=>({key:a.business_key,completedAt:a.completed_at}))});
}finally{await sql.end();}
