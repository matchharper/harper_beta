"""Disposable local PostgreSQL integration. No production URL/env is used."""
import json, uuid, sys
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import psycopg
from psycopg.types.json import Jsonb
DSN='postgresql://postgres@127.0.0.1:55489/postgres'
root=Path(__file__).resolve().parents[1]
uid,workspace,role,member,lease=[str(uuid.uuid4()) for _ in range(5)]
with psycopg.connect(DSN,autocommit=True) as c:
 assert c.execute("select current_setting('data_directory')").fetchone()[0]=='/tmp/harper-company-mail-pg', 'Refusing to touch any other database'
 c.execute('drop schema if exists public cascade; create schema public; drop schema if exists auth cascade; create schema auth;')
 c.execute("do $$ begin create role anon; exception when duplicate_object then null; end $$; do $$ begin create role authenticated; exception when duplicate_object then null; end $$; do $$ begin create role service_role; exception when duplicate_object then null; end $$;")
 c.execute('''create table public.company_users(user_id uuid primary key,name text,email text,locale text);
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz);
 create table public.company_workspace(company_workspace_id uuid primary key,company_name text,published_name text,is_internal boolean);
 create table public.company_roles(role_id uuid primary key,company_workspace_id uuid,name text,information jsonb,status text,source_type text,is_expired boolean,expires_at timestamptz);
 create table public.company_internal_roles(role_id uuid primary key,team_id uuid);
 create table public.company_user_workspace(id uuid primary key,company_user_id uuid,company_workspace_id uuid,authority text,access_scope text,team_id uuid);
 create table public.company_workspace_team_members(membership_id uuid,team_id uuid);
 create table public.company_workspace_teams(id uuid,deleted_at timestamptz);
 create table public.company_slack_integrations(company_workspace_id uuid,slack_team_id text,status text,bot_token_ciphertext text);
 create table public.company_slack_channels(id uuid primary key,company_workspace_id uuid,slack_team_id text,is_enabled boolean);
 create table public.company_role_notification_channels(role_id uuid,channel_id uuid);
 create table public.talent_opportunity_tag(id uuid,talent_id uuid,opportunity_id uuid,tag text,updated_at timestamptz,created_at timestamptz);
 create table public.company_intro_candidates(id uuid,role_id uuid,talent_id uuid,status text);
 create table public.company_first_slack_outbox(candidate_ids uuid[],sent_at timestamptz,slack_message_ts text);''')
 c.execute((root/'supabase/migrations/20261015130959_company_connection_email_delivery.sql').read_text())
 c.execute("insert into company_users values(%s,'Fixture','fixture@example.invalid','ko')",(uid,))
 c.execute("insert into auth.users values(%s,'fixture@example.invalid',now(),null,null)",(uid,))
 c.execute("insert into company_workspace values(%s,'Fixture',null,true)",(workspace,))
 c.execute("insert into company_roles values(%s,%s,'Fixture',%s,'active','internal',false,null)",(role,workspace,Jsonb({'testFixture':'local-email-boundary','testOnly':True})))
 c.execute("insert into company_internal_roles values(%s,null)",(role,))
 c.execute("insert into company_user_workspace values(%s,%s,%s,'owner','organization',null)",(member,uid,workspace))
 def scalar(sql,args=()): return c.execute(sql,args).fetchone()[0]
 def claim(t,owner=lease): return scalar('select claim_company_connection_email_v1(%s,%s,%s)',(uid,owner,t))
 def begin(j,t,owner=lease):
  payload={'to':'fixture@example.invalid','subject':'Synthetic','text':'Synthetic','html':'Synthetic','idempotencyKey':'company-notice/'+j['id']}
  return scalar('select prepare_company_email_send_v1(%s,%s,%s,%s)',(j['id'],owner,Jsonb(payload),t))
 def done(j,t,owner=lease): c.execute('select finish_company_email_send_v1(%s,%s,%s,%s)',(j['id'],owner,'fake-provider/'+j['id'],t))
 t='2026-10-16T01:00:00Z'
 assert scalar('select count(*) from company_connection_email_snapshot_v1()')==0
 # Only this isolated, non-network database uses unmarked rows to exercise eligible production-shaped facts.
 c.execute("update company_roles set information='{}'")
 assert scalar('select count(*) from company_connection_email_snapshot_v1()')==1
 assert claim('2026-10-16T00:59:00Z') is None
 def concurrent_claim(_):
  with psycopg.connect(DSN,autocommit=True) as other:
   owner=str(uuid.uuid4());return owner,other.execute('select claim_company_connection_email_v1(%s,%s,%s)',(uid,owner,t)).fetchone()[0]
 with ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(concurrent_claim,range(2)))
 winners=[x for x in results if x[1]]; assert len(winners)==1
 owner,j=winners[0]
 assert scalar('select count(*) from company_email_outbox')==1
 c.execute('select set_company_email_preference_v1(%s,%s,false)',(uid,'slack_connection'))
 assert begin(j,t,owner) is None
 assert claim(t) is None
 c.execute('select set_company_email_preference_v1(%s,%s,true)',(uid,'slack_connection'))
 j=claim(t);assert j and j['ordinal']==1
 # Configuration change after composition cancels before a provider call.
 channel=str(uuid.uuid4())
 c.execute("insert into company_slack_integrations values(%s,'T','active','fake')",(workspace,))
 c.execute("insert into company_slack_channels values(%s,%s,'T',true)",(channel,workspace))
 assert begin(j,t) is None
 assert claim(t) is None
 c.execute('insert into company_role_notification_channels values(%s,%s)',(role,channel))
 j=claim(t); assert j
 assert begin(j,t)
 # A new owner can recover the frozen payload within the provider idempotency window.
 next_owner=str(uuid.uuid4()); retry=claim('2026-10-16T01:15:00Z',next_owner)
 assert retry and retry['delivery']['idempotencyKey']=='company-notice/'+j['id']
 assert begin(retry,'2026-10-16T01:15:00Z',next_owner)
 done(retry,'2026-10-16T01:15:00Z',next_owner)
 assert claim('2026-10-16T01:20:00Z') is None
 j2=claim('2026-10-19T01:15:00Z');assert j2 and j2['ordinal']==2
 assert begin(j2,'2026-10-19T01:15:00Z');done(j2,'2026-10-19T01:15:00Z')
 assert claim('2026-10-21T01:15:00Z') is None
 j3=claim('2026-10-23T01:15:00Z');assert j3 and j3['ordinal']==3
 assert begin(j3,'2026-10-23T01:15:00Z');done(j3,'2026-10-23T01:15:00Z')
 assert claim('2026-10-26T01:15:00Z') is None
 c.execute('select set_company_email_preference_v1(%s,%s,false)',(uid,'all_proactive'))
 c.execute('select set_company_email_preference_v1(%s,%s,true)',(uid,'slack_connection'))
 assert claim('2026-10-26T01:15:00Z') is None
 assert scalar('select count(*) from company_email_outbox')==3
 # Independently verify unknown delivery cannot be replayed after 24h.
 c.execute("delete from company_email_outbox")
 c.execute('select set_company_email_preference_v1(%s,%s,true)',(uid,'all_proactive'))
 j=claim(t);assert begin(j,t)
 assert claim('2026-10-19T01:00:00Z') is None
 assert scalar('select status from company_email_outbox')=='delivery_unknown'
 # Definer functions and raw receipts are unavailable to public users.
 assert not scalar("select has_function_privilege('anon','public.claim_company_connection_email_v1(uuid,uuid,timestamptz)','execute')")
 assert not scalar("select has_table_privilege('authenticated','public.company_email_outbox','select')")
 c.execute("update company_user_workspace set authority='viewer'")
 assert scalar('select count(*) from company_connection_email_snapshot_v1()')==0
 print('PASS: real PostgreSQL snapshot, test isolation, time window, concurrent claim, opt-out race, connection race, frozen retry, cap/gaps, 24h uncertainty, revoked role and privileges; provider calls=0')
