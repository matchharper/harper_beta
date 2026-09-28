"""Isolated native PostgreSQL integration test; never uses configured credentials."""
from __future__ import annotations

import getpass
import os
import socket
import subprocess
import sys
import tempfile
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

BETA = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BETA.parent / 'harper_worker'))
import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from opp.company_first_search.sql_safety import validate_retrieval_sql
from opp.company_first_search.sql_safety import execute_validated_sql
from opp.company_first_search.repository import save_scoring_results
from opp.company_first_search.models import TalentScore, RoleScore
from opp.utils.new_delivery import persist_recommendations_no_repeats, finalize_pre_final_delivery_recommendations

MIGRATION = BETA / 'supabase/migrations/20260928045449_company_first_score_reuse_and_recommendation_history.sql'

def function(filename, name):
    text = (BETA / 'supabase/migrations' / filename).read_text()
    start = text.index(f'create or replace function public.{name}(')
    return text[start:text.index('\n$$;', start) + 4]

SCHEMA = '''
create role anon; create role authenticated; create role service_role bypassrls;
create table talent_users(user_id uuid primary key, deleted_at timestamptz, headline text, created_at timestamptz default now());
create table talent_setting(user_id uuid primary key references talent_users, is_onboarding_done boolean default true, preferred_locale text,
 profile_visibility text default 'open_to_matches', get_internal_recommendation boolean default true, blocked_companies text[] default '{}');
create table company_workspace(company_workspace_id uuid primary key, company_name text, published_name text);
create table company_users(user_id uuid primary key);
create table company_user_workspace(company_user_id uuid, company_workspace_id uuid);
create table company_roles(role_id uuid primary key, company_workspace_id uuid references company_workspace,
 name text, source_provider text, source_job_id text, source_type text default 'internal',status text default 'active',is_expired boolean default false,
 expires_at timestamptz,information jsonb not null);
create table company_internal_roles(role_id uuid primary key references company_roles, is_company_first_search boolean default true);
create table ops_matching_role_stages(id uuid primary key,role_id uuid references company_roles);
create table company_first_search_runs(id uuid primary key);
create table talent_conversations(id uuid primary key,user_id uuid,updated_at timestamptz default now(),created_at timestamptz default now());
create table opportunity_discovery_run(id uuid primary key,talent_id uuid,conversation_id uuid,run_mode text,status text,
 trigger text,target_recommendation_count integer,settings_snapshot jsonb,trigger_payload jsonb,dedupe_key text unique);
create table talent_opportunity_recommendation(id uuid primary key default gen_random_uuid(),talent_id uuid references talent_users,
 role_id uuid references company_roles,discovery_run_id uuid references opportunity_discovery_run,feedback text,feedback_at timestamptz,
feedback_reason text,saved_stage text,email_acceptance_confirmation jsonb,evidence jsonb,fit_reasons jsonb,fit_summary text,score float,
 kind text,opportunity_type text,preference_fit jsonb,rank integer,tradeoffs jsonb,processed_stage text,
created_at timestamptz default now(),recommended_at timestamptz default now(),updated_at timestamptz default now(),dismissed_at timestamptz);
create table talent_opportunity_tag(id uuid primary key default gen_random_uuid(),talent_id uuid,opportunity_id uuid,tag text,
 created_at timestamptz default now(),updated_at timestamptz default now());
create table talent_progress(id uuid primary key default gen_random_uuid(),talent_id uuid,role_id uuid,recommendation_id uuid,
 user_id uuid,kind text,text text not null,metadata jsonb,created_at timestamptz default now());
create table talent_role_activity(id uuid primary key default gen_random_uuid(),recommendation_id uuid,kind text,metadata jsonb);
create table talent_activity_events(talent_id uuid,source text,event_type text,summary text,impact_level text,changed_domains text[],created_at timestamptz);
'''

def run(dsn):
    connect = lambda: psycopg.connect(dsn, autocommit=True, row_factory=dict_row)
    with connect() as db:
        db.execute(SCHEMA)
        original=(BETA/'supabase/migrations/20260917162551_company_first_talent_search.sql').read_text()
        start=original.index('create table if not exists public.company_intro_candidates (')
        db.execute(original[start:original.index('\n);',start)+3])
        db.execute(function('20260918015954_relax_company_intro_constraints_and_fixture_guards.sql','company_intro_role_allows_talent_v1'))
        db.execute(function('20260928013822_allow_company_intro_across_roles.sql','guard_candidate_first_against_company_intro_v1'))
        db.execute('''create trigger talent_recommendation_company_intro_guard before insert or update of role_id,talent_id
          on talent_opportunity_recommendation for each row execute function guard_candidate_first_against_company_intro_v1()''')
        db.execute(MIGRATION.read_text())
        workspace, actor, run_id = uuid4(), uuid4(), uuid4()
        db.execute('insert into company_workspace values (%s,%s,null)',(workspace,'Synthetic company'))
        db.execute('insert into company_users values (%s)',(actor,))
        db.execute('insert into company_user_workspace values (%s,%s)',(actor,workspace))
        db.execute('insert into company_first_search_runs values (%s)',(run_id,))
        def one(sql, params=()): return db.execute(sql,params).fetchone()
        def fixture(*, ready=True, feedback=None):
            talent, role, stage, rec, intro = [uuid4() for _ in range(5)]
            db.execute('insert into talent_users(user_id) values (%s)',(talent,))
            db.execute('insert into talent_setting(user_id) values (%s)',(talent,))
            db.execute('insert into company_roles(role_id,company_workspace_id,name,information) values (%s,%s,%s,%s)',
              (role,workspace,'Synthetic role',Jsonb({'testOnly':True,'testFixture':'company-first-history-v1','testTalentIds':[str(talent)]})))
            db.execute('insert into company_internal_roles(role_id) values (%s)',(role,))
            db.execute('insert into ops_matching_role_stages values (%s,%s)',(stage,role))
            db.execute("insert into talent_opportunity_recommendation(id,talent_id,role_id,opportunity_type,feedback,feedback_reason) values (%s,%s,%s,'internal_recommendation',%s,%s)",
              (rec,talent,role,feedback,'Synthetic prior reason' if feedback else None))
            if ready:
                db.execute("insert into company_intro_candidates(id,company_workspace_id,role_id,talent_id,selection_run_id,selection_reason,role_fingerprint,talent_fingerprint) values(%s,%s,%s,%s,%s,'Synthetic reason','r','t')",(intro,workspace,role,talent,run_id))
            return talent, role, stage, rec, intro
        def accept(conn, f):
            return conn.execute('select accept_talent_internal_role_recommendation_v1(%s,%s) result',(f[0],f[3])).fetchone()['result']
        def request(conn,f):
            return conn.execute('select request_company_intro_v1(%s,%s,%s,%s,%s,%s) result',
              (f[4],workspace,actor,f[2],['synthetic@example.invalid'],'Synthetic interest')).fetchone()['result']
        f=fixture()
        result=accept(db,f)
        assert result['status']=='accepted' and result['companyShared'] is True,result
        assert one('select status,close_reason from company_intro_candidates where id=%s',(f[4],))=={'status':'closed','close_reason':'route_replaced'}
        assert one('select count(*) n from talent_opportunity_tag where talent_id=%s and tag=%s',(f[0],'내부:연결대기'))['n']==1
        assert accept(db,f)['status']=='no_change'
        assert request(db,f)['status']=='already_in_pipeline'
        stale=one('select request_company_intro_v1(%s,%s,%s,null,null,null) result',(f[4],workspace,actor))['result']
        assert stale['status']=='already_in_pipeline' and stale['newIntroCreated'] is False
        assert one('select count(*) n from opportunity_discovery_run')['n']==0
        f2=fixture(ready=False)
        assert accept(db,f2)['companyShared'] is False
        assert one('select count(*) n from talent_opportunity_tag where talent_id=%s',(f2[0],))['n']==0
        f3=fixture(feedback='dislike')
        req=request(db,f3)
        assert req['status']=='requested'
        target=req['recommendationId']
        assert request(db,f3)['recommendationId']==target
        assert one('select count(*) n from talent_opportunity_recommendation where talent_id=%s',(f3[0],))['n']==2
        visible=one('select id,opportunity_type from talent_effective_opportunity_recommendations_v1 where talent_id=%s',(f3[0],))
        assert str(visible['id'])==target and visible['opportunity_type']=='intro_request',visible
        assert one('select feedback_reason from talent_opportunity_recommendation where id=%s',(f3[3],))['feedback_reason']=='Synthetic prior reason'
        selected=[{'roleId':str(f3[1]),'sourceType':'internal','opportunityType':'intro_request','companyIntroCandidateId':str(f3[4]),'fitSummary':'Synthetic final copy'}]
        ids=persist_recommendations_no_repeats(db,run_id=req['deliveryRunId'],talent_id=str(f3[0]),selected=selected,allow_repeat_role_ids=[str(f3[1])])
        assert ids==[target],ids
        assert finalize_pre_final_delivery_recommendations(db,run_id=req['deliveryRunId'],selected=selected)==1
        assert finalize_pre_final_delivery_recommendations(db,run_id=req['deliveryRunId'],selected=selected)==0
        assert one('select fit_summary from talent_opportunity_recommendation where id=%s',(target,))['fit_summary']=='Synthetic final copy'
        assert accept(db,f3)['status']=='superseded'
        assert one('select current_talent_recommendation_for_talent_v1(%s,%s) id',(f3[0],f3[3]))['id']==visible['id']
        assert one('select current_talent_recommendation_for_talent_v1(%s,%s) id',(f2[0],f3[3]))['id'] is None
        try:
            db.execute("select update_talent_role_feedback_v1(%s,%s,'like',null,'connected',now())",(f3[0],f3[3]))
            raise AssertionError('superseded feedback accepted')
        except psycopg.errors.RaiseException as exc:
            assert 'superseded' in str(exc)
        for query, params in [
            ("select update_talent_role_feedback_v1(%s,%s,'dislike','Synthetic prior reason',null,now())",(f3[0],f3[3])),
            ("select move_talent_role_saved_stage_v1(%s,%s,'saved',true)",(f3[0],f3[3])),
        ]:
            try:
                db.execute(query,params)
                raise AssertionError('superseded recommendation mutation accepted')
            except psycopg.errors.RaiseException as exc:
                assert 'superseded' in str(exc)
        db.execute("update company_intro_candidates set status='closed',close_reason='talent_declined' where id=%s",(f3[4],))
        assert one('select count(*) n from talent_effective_opportunity_recommendations_v1 where talent_id=%s',(f3[0],))['n']==1
        db.execute("update company_roles set status='ended' where role_id=%s",(f3[1],))
        assert one('select archive_ended_internal_opportunities_for_talent(%s,null) n',(f3[0],))['n']==1
        assert one("select has_table_privilege('anon','company_first_talent_scores','select') allowed")['allowed'] is False
        assert one("select has_table_privilege('authenticated','talent_effective_opportunity_recommendations_v1','select') allowed")['allowed'] is False
        assert one("select company_first_pair_is_available_v1(%s,%s) allowed",(f2[0],f2[1]))['allowed'] is False
        f_open=fixture(ready=False)
        f_declined=fixture(ready=False,feedback='dislike')
        for f_eligible in (f_open,f_declined):
            assert one("select company_first_pair_is_available_v1(%s,%s) allowed",f_eligible[:2])['allowed'] is True
        # Existing accepted/proposed routes to a sibling role do not block this role.
        assert one("select company_first_pair_is_available_v1(%s,%s) allowed",(f[0],f_open[1]))['allowed'] is True
        # A private account can record its own acceptance, but must not be shared.
        private=fixture()
        db.execute("update talent_setting set profile_visibility='private' where user_id=%s",(private[0],))
        assert accept(db,private)['companyShared'] is False
        assert one('select close_reason from company_intro_candidates where id=%s',(private[4],))['close_reason']=='privacy_withdrawn'
        # Cache stores successful non-fit results too; an older evaluation finishing
        # later cannot overwrite the latest evaluated input.
        scored_at=datetime.now(timezone.utc)
        nonfit=TalentScore(str(f_open[0]),(RoleScore(str(f_open[1]),20,'unfit','unfit','unfit','Synthetic non-fit'),))
        save_scoring_results(db,run_id=str(run_id),evaluated_at=scored_at,scores=[nonfit])
        oldfit=TalentScore(str(f_open[0]),(RoleScore(str(f_open[1]),90,'fit','fit','fit','Outdated input'),))
        save_scoring_results(db,run_id=str(run_id),evaluated_at=scored_at-timedelta(days=1),scores=[oldfit])
        assert one('select score from company_first_talent_scores where talent_id=%s and role_id=%s',f_open[:2])['score']==20
        # Real simultaneous transactions: candidate acceptance wins, then stale request observes it.
        f4=fixture(); entered=threading.Event(); release=threading.Event()
        def accepting():
            with connect() as c, c.transaction():
                result=accept(c,f4); entered.set(); assert release.wait(10); return result
        def requesting():
            with connect() as c: return request(c,f4)
        with ThreadPoolExecutor(max_workers=2) as pool:
            first=pool.submit(accepting); assert entered.wait(10)
            second=pool.submit(requesting)
            assert not second.done(); release.set()
            assert first.result()['companyShared'] is True
            assert second.result()['status']=='already_in_pipeline'
        # In the opposite order, old acceptance must target the newly current Intro.
        f5=fixture(); entered.clear(); release.clear()
        def requesting_first():
            with connect() as c, c.transaction():
                result=request(c,f5); entered.set(); assert release.wait(10); return result
        def accepting_second():
            with connect() as c: return accept(c,f5)
        with ThreadPoolExecutor(max_workers=2) as pool:
            first=pool.submit(requesting_first); assert entered.wait(10)
            second=pool.submit(accepting_second); assert not second.done(); release.set()
            assert first.result()['status']=='requested'
            assert second.result()['status']=='superseded'
        # Execute the actual runtime-normalized SQL; 150 ineligible high-ranked rows
        # must not consume the 150-row budget ahead of eligible matches.
        role=f2[1]; as_of=datetime.now(timezone.utc)
        eligible=[]
        for i in range(155):
            talent=uuid4(); created=as_of-timedelta(seconds=i)
            db.execute('insert into talent_users(user_id,headline,created_at) values (%s,%s,%s)',(talent,'engineer',created))
            if i<150:
                db.execute("insert into company_first_talent_scores values (%s,%s,20,'unfit','unfit','unfit','Synthetic','[]',%s,%s,%s)",(talent,role,as_of,as_of,run_id))
            else: eligible.append(str(talent))
        validated=validate_retrieval_sql("SELECT t.user_id AS talent_id FROM public.talent_users t WHERE t.headline ILIKE '%engineer%' ORDER BY t.created_at DESC, talent_id")
        rows=db.execute(validated.executable+' LIMIT 150',{'role_id':role,'source_cutoff':as_of,'scheduled_slot':as_of}).fetchall()
        executed=execute_validated_sql(dsn,validated,parameters={'role_id':role,'source_cutoff':as_of,'scheduled_slot':as_of},limit=150)
        assert executed==eligible, executed
        assert [str(row['talent_id']) for row in rows]==eligible
        duplicated=validate_retrieval_sql("SELECT t.user_id AS talent_id FROM public.talent_users t CROSS JOIN public.talent_users duplicate WHERE t.headline ILIKE '%engineer%' ORDER BY t.created_at DESC, talent_id")
        assert execute_validated_sql(dsn,duplicated,parameters={'role_id':role,'source_cutoff':as_of,'scheduled_slot':as_of},limit=3)==eligible[:3]
        db.execute("update company_first_talent_scores set scored_at=%s where role_id=%s",(as_of-timedelta(days=30),role))
        assert len(db.execute(validated.executable+' LIMIT 150',{'role_id':role,'source_cutoff':as_of,'scheduled_slot':as_of}).fetchall())==150
        print('PASS: score eligibility before LIMIT, exact 30 days, history supersession, acceptance handoff, idempotency, service-only grants, and both concurrent transaction orders')

if __name__=='__main__':
    with tempfile.TemporaryDirectory(prefix='harper-cf-pg-',dir='/tmp') as temp:
        root=Path(temp); data=root/'data'
        with socket.socket() as sock:
            sock.bind(('127.0.0.1',0)); port=sock.getsockname()[1]
        share_args = ['-L', os.environ['HARPER_TEST_PG_SHARE']] if os.environ.get('HARPER_TEST_PG_SHARE') else []
        subprocess.run(['initdb','-D',str(data),'-A','trust','--no-locale','-E','UTF8', *share_args],check=True,stdout=subprocess.DEVNULL)
        started=False
        try:
            subprocess.run(['pg_ctl','-D',str(data),'-l',str(root/'server.log'),'-o',f'-h 127.0.0.1 -p {port} -k {root}','-w','start'],check=True,stdout=subprocess.DEVNULL)
            started=True
            run(f'host=127.0.0.1 port={port} dbname=postgres user={getpass.getuser()}')
        finally:
            if started:
                subprocess.run(['pg_ctl','-D',str(data),'-m','fast','-w','stop'],check=True,stdout=subprocess.DEVNULL)
