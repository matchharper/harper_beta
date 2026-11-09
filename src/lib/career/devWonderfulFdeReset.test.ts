import assert from 'node:assert/strict';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {prepareWonderfulFdeReset,readWonderfulFdeReset,assertWonderfulFdeResetIdle,deleteWonderfulFdeRows,resetTables} from './devWonderfulFdeReset';
import {WONDERFUL_FDE_TEST_ACCOUNTS,canResetWonderfulFde} from './devWonderfulFdeResetContract';
import {WONDERFUL_KOREA_FDE_ROLE_ID as role,WONDERFUL_KOREA_MARKETING_MANAGER_ROLE_ID as otherRole} from './devWonderfulRoleResetTargets';
const owner=WONDERFUL_FDE_TEST_ACCOUNTS[0];
const other='10000000-0000-4000-8000-000000000099';
const workspace='f2e80aee-fee3-40f5-807f-5f8694c37eee';
// Only columns used by the scope reader are needed. Fixture rows deliberately
// cross account/role boundaries and share conversation/reply IDs.
async function fixture(){
 const db=new PGlite();const q=async(s:string,p:any[]=[]) => (await db.query(s,p)).rows as any[];
 await db.exec(`create schema auth;create table auth.users(id uuid,email text);`);
 for(const a of WONDERFUL_FDE_TEST_ACCOUNTS)await q('insert into auth.users values($1,$2)',[a.id,a.email]);
 const ddl:Record<string,string>={
  company_roles:'role_id uuid,company_workspace_id uuid,source_type text',
  talent_opportunity_recommendation:'id uuid,talent_id uuid,role_id uuid',
  agent_contact_messages:'id uuid,talent_id uuid,role_id uuid,root_id uuid,receiver_job_id uuid,source jsonb',
  company_agent_web_action_jobs:'id uuid,company_workspace_id uuid,role_id uuid,action_context jsonb,anchor_message_id bigint,terminal_message_id bigint,progress_message_id bigint,status text,locked_at timestamptz',
  company_messages:'id bigint,company_workspace_id uuid,role_id uuid,conversation_id uuid,role text,content text,metadata jsonb,slack_message_ts text,slack_thread_id uuid',
  meeting_schedules:'id uuid,role_id uuid,talent_id uuid',
  meeting_schedule_rounds:'schedule_id uuid,source_company_message_id bigint',
  meeting_schedule_calendar_events:'schedule_id uuid,status text',
  talent_messages:'id bigint,user_id uuid,role text,content text,payload jsonb,conversation_id uuid',
  talent_external_operations:'id uuid,user_id uuid,kind text,request jsonb,status text',
  slack_reply_jobs:'id uuid,user_message_id bigint,response_message_id bigint,status text,locked_at timestamptz',
  company_talent_relays:'id uuid,recommendation_id uuid,company_talent_request_id uuid',
  company_decision_events:'id uuid,role_id uuid,subject_id text,intro_candidate_id uuid',
  contact_queue:'id uuid,user_id uuid,role_id uuid,recommendation_id uuid,locked_at timestamptz',
  company_role_board_cards:'recommendation_id text',
  company_conversation_summaries:'id uuid,conversation_id uuid,source_start_message_id bigint,source_end_message_id bigint',
  talent_activity_events:'id uuid,talent_id uuid,message_id bigint',
  talent_conversation_summaries:'id uuid,talent_id uuid,conversation_id uuid,from_message_id bigint,to_message_id bigint',
  talent_agent_runtime:'conversation_id uuid,user_id uuid,state jsonb',
  company_conversations:'id uuid,summary_cursor_message_id bigint,last_message_id bigint',
  company_agent_schedules:'id uuid,role_id uuid,target_refs jsonb',
  talent_agent_schedules:'id uuid,talent_id uuid,target_refs jsonb',
 };
 for(const [name]of resetTables)if(!ddl[name])ddl[name]=['talent_opportunity_fit','talent_opportunity_tag','talent_opportunity_matching_review'].includes(name)?'id uuid,talent_id uuid,opportunity_id uuid':'id uuid,talent_id uuid,role_id uuid';
 for(const [name,cols]of Object.entries(ddl))await db.exec(`create table ${name}(${cols})`);
 await q("insert into company_roles values($1,$2,'internal'),($3,$2,'internal')",[role,workspace,otherRole]);
 for(const [talent,r]of [[owner.id,role],[other,role],[owner.id,otherRole]])await q('insert into talent_opportunity_recommendation values(gen_random_uuid(),$1,$2)',[talent,r]);
 const conv='10000000-0000-4000-8000-000000000001';
 await q("insert into talent_messages values(1,$1,'user','introduce',$2,$3),(2,$1,'assistant','FDE reply',$4,$3),(3,$1,'user','other request','{}',$3),(4,$5,'user','other account',$2,$3)",[owner.id,JSON.stringify({roleId:role,careerCapabilityTurn:{replyId:'reply'}}),conv,JSON.stringify({careerTextReplyId:'reply'}),other]);
 return {db,q,conv};
}

test('only exact ID and verified email pairs may reset all three accounts',()=>{
 assert.equal(canResetWonderfulFde(owner),true);
 assert.equal(canResetWonderfulFde({...owner,id:other}),false);
 assert.equal(canResetWonderfulFde({...owner,email:'different@matchharper.com'}),false);
 assert.equal(canResetWonderfulFde(null),false);
});

test('removes the fixture pair while retaining other accounts, roles and conversation messages',async()=>{
 const {db,q}=await fixture();try{await db.exec('begin');{
 await prepareWonderfulFdeReset(q);await assertWonderfulFdeResetIdle(q);
 const preview=(await readWonderfulFdeReset(q)).preview;
 assert.equal(preview.counts.find(c=>c.table==='talent_opportunity_recommendation')?.count,1);
 await deleteWonderfulFdeRows(q);
 assert.equal((await q('select * from talent_opportunity_recommendation')).length,2);
 assert.deepEqual((await q('select id from talent_messages order by id')).map(x=>x.id),[3,4]);
 await db.exec('commit');}}finally{await db.close();}
});

test('retains a reply and invocation that also contain another role',async()=>{
 const {db,q}=await fixture();try{await db.exec('begin');{
 await q('update talent_messages set content=$1 where id=2',[`Other application [posting](${otherRole})`]);
 await prepareWonderfulFdeReset(q);
 assert.equal((await readWonderfulFdeReset(q)).preview.retainedSharedReplies,1);
 await deleteWonderfulFdeRows(q);
 assert.deepEqual((await q('select id from talent_messages order by id')).map(x=>x.id),[2,3,4]);
 await db.exec('commit');}}finally{await db.close();}
});

test('running work blocks deletion; ready PDF cache does not; preview detects changes',async()=>{
 const {db,q}=await fixture();try{await db.exec('begin');{
 await prepareWonderfulFdeReset(q);
 const first=(await readWonderfulFdeReset(q)).preview.fingerprint;
 await q('update talent_messages set content=$1 where id=1',['changed']);
 assert.notEqual((await readWonderfulFdeReset(q)).preview.fingerprint,first);
 await q("insert into talent_external_operations(id,user_id,kind,status)values(gen_random_uuid(),$1,'pdf_artifact','ready')",[owner.id]);
 await assertWonderfulFdeResetIdle(q);
 await q("insert into talent_external_operations(id,user_id,kind,status)values(gen_random_uuid(),$1,'career_invocation','running')",[owner.id]);
 await assertWonderfulFdeResetIdle(q);
 await q("update talent_external_operations set request='{\"source_message_id\":1}' where kind='career_invocation'");
 await assert.rejects(assertWonderfulFdeResetIdle(q),/FDE/);
 await db.exec('commit');}}finally{await db.close();}
});

test('preserves unrelated active reply state and only removes FDE cache keys',async()=>{
 const {db,q,conv}=await fixture();try{await db.exec('begin');{
 const active={replyId:'other-reply',expiresAt:'2099-01-01T00:00:00Z'};
 await q('insert into talent_agent_runtime values($1,$2,$3)',[conv,owner.id,JSON.stringify({activeReply:active,previous:{replyId:'reply'},checkpoints:{reply:{old:true},'other-reply':{keep:true}},completedReplyIds:{reply:1,other:2},handbooks:['keep']})]);
 await prepareWonderfulFdeReset(q);await assertWonderfulFdeResetIdle(q);await deleteWonderfulFdeRows(q);
 const [row]=await q('select state from talent_agent_runtime');
 assert.deepEqual(row.state.activeReply,active);assert.deepEqual(row.state.checkpoints,{'other-reply':{keep:true}});
 assert.deepEqual(row.state.handbooks,['keep']);assert.equal(row.state.previous,undefined);
 await db.exec('commit');}}finally{await db.close();}
});

test('legacy Slack cleanup distinguishes the candidate email from the deciding team member',async()=>{
 const {db,q}=await fixture();try{await db.exec('begin');{
 await q("insert into company_messages(id,company_workspace_id,role_id,role,content) values(10,$1,$2,'assistant',$3),(11,$1,$2,'assistant',$4)",
 [workspace,role,`*Candidate*: Test (${owner.email})\n*Decided by*: someone`, `*Candidate*: Other (other@example.com)\n*Decided by*: Test (${owner.email})`]);
 await prepareWonderfulFdeReset(q);
 assert.deepEqual((await q('select id from reset_company_messages')).map(x=>x.id),[10]);
 await db.exec('commit');}}finally{await db.close();}
});
