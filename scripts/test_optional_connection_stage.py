"""Isolated PostgreSQL + real Worker delivery guard. Never reads credentials."""
from pathlib import Path
from uuid import uuid4
import getpass
import os
import socket
import subprocess
import tempfile
import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from test_company_first_history import BETA, SCHEMA, MIGRATION, function
from opp.utils.new_delivery import apply_company_intro_live_delivery_guard, persist_recommendations_no_repeats

OPTIONAL = BETA / 'supabase/migrations/20260928095255_optional_connection_process_stage.sql'

def run(dsn):
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as db:
        db.execute(SCHEMA)
        original=(BETA/'supabase/migrations/20260917162551_company_first_talent_search.sql').read_text()
        start=original.index('create table if not exists public.company_intro_candidates (')
        db.execute(original[start:original.index('\n);',start)+3])
        db.execute(function('20260918015954_relax_company_intro_constraints_and_fixture_guards.sql','company_intro_role_allows_talent_v1'))
        db.execute(MIGRATION.read_text())
        db.execute(OPTIONAL.read_text())
        db.execute(function('20260918022746_company_intro_acceptance_handoff.sql','decide_company_intro_request_v1').replace('          and internal_role.is_company_first_search is true\n',''))
        db.execute('''create trigger talent_recommendation_company_intro_guard before insert or update of role_id,talent_id
          on talent_opportunity_recommendation for each row execute function guard_candidate_first_against_company_intro_v1()''')
        workspace,actor,run_id=uuid4(),uuid4(),uuid4()
        db.execute('insert into company_workspace values (%s,%s,null)',(workspace,'Synthetic company'))
        db.execute('insert into company_users values (%s)',(actor,))
        db.execute('insert into company_user_workspace values (%s,%s)',(actor,workspace))
        db.execute('insert into company_first_search_runs values (%s)',(run_id,))
        def one(sql,params=()): return db.execute(sql,params).fetchone()
        def fixture(stage=False):
            talent,role,intro=uuid4(),uuid4(),uuid4()
            db.execute('insert into talent_users(user_id) values (%s)',(talent,))
            db.execute('insert into talent_setting(user_id) values (%s)',(talent,))
            db.execute('insert into company_roles(role_id,company_workspace_id,name,information) values (%s,%s,%s,%s)',
              (role,workspace,'Synthetic role',Jsonb({'testOnly':True,'testFixture':'optional-connection-stage','testTalentIds':[str(talent)]})))
            db.execute('insert into company_internal_roles(role_id) values (%s)',(role,))
            stage_id=uuid4() if stage else None
            if stage_id: db.execute('insert into ops_matching_role_stages values (%s,%s)',(stage_id,role))
            db.execute("insert into company_intro_candidates(id,company_workspace_id,role_id,talent_id,selection_run_id,selection_reason,role_fingerprint,talent_fingerprint) values(%s,%s,%s,%s,%s,'Synthetic reason','r','t')",(intro,workspace,role,talent,run_id))
            return talent,role,intro,stage_id
        def request(f,stage=None,user=actor):
            return one('select request_company_intro_v1(%s,%s,%s,%s,%s,%s) result',
              (f[2],workspace,user,stage,['synthetic@example.invalid'],'Synthetic interest'))['result']
        def plan(f): return {'manualInternalRecommendation':{'type':'company_first_intro_request','companyIntroCandidateId':str(f[2])},'selectedRecommendations':[{'roleId':str(f[1])}]}
        for custom in (False,True):
            f=fixture(custom)
            result=request(f,f[3]); assert result['status']=='requested',result
            assert result['nextStageId']==(str(f[3]) if custom else None)
            assert request(f,f[3])['recommendationId']==result['recommendationId']
            assert apply_company_intro_live_delivery_guard(db,talent_id=str(f[0]),plan=plan(f))==plan(f)
            # Exercise the real guard on the delivery recommendation, preserving
            # the exception only for the exact owning Intro/run/recommendation.
            selected=[{'roleId':str(f[1]),'sourceType':'internal','opportunityType':'intro_request','companyIntroCandidateId':str(f[2]),'fitSummary':'Synthetic final copy'}]
            ids=persist_recommendations_no_repeats(db,run_id=result['deliveryRunId'],talent_id=str(f[0]),selected=selected,allow_repeat_role_ids=[str(f[1])])
            assert ids==[result['recommendationId']],ids
            try:
                db.execute("insert into talent_opportunity_recommendation(talent_id,role_id,opportunity_type) values (%s,%s,'internal_recommendation')",f[:2])
                raise AssertionError('duplicate candidate-first route allowed')
            except psycopg.errors.UniqueViolation: pass
            accepted=one("select decide_company_intro_request_v1(%s,%s,'accept',null,null) result",(f[0],result['recommendationId']))['result']
            assert accepted['status']=='accepted' and accepted['nextStageId']==result['nextStageId'],accepted
            assert one('select status from company_intro_candidates where id=%s',(f[2],))['status']=='connecting'
            assert one('select tag from talent_opportunity_tag where talent_id=%s',(f[0],))['tag']=='내부:연결대기'
            assert one("select decide_company_intro_request_v1(%s,%s,'accept',null,null) result",(f[0],result['recommendationId']))['result']['decisionChanged'] is False
        f=fixture();other=fixture(True)
        for stage,user in [(other[3],actor),(None,uuid4())]:
            try: request(f,stage,user); raise AssertionError('invalid stage or unauthorized actor accepted')
            except (psycopg.errors.InvalidParameterValue,psycopg.errors.InsufficientPrivilege): pass
        assert one('select status from company_intro_candidates where id=%s',(f[2],))['status']=='ready'
        for change in ('privacy','test_allowlist','role_ended'):
            f=fixture();request(f)
            if change=='privacy': db.execute("update talent_setting set profile_visibility='private' where user_id=%s",(f[0],))
            elif change=='test_allowlist': db.execute("update company_roles set information=information-'testTalentIds' where role_id=%s",(f[1],))
            else: db.execute("update company_roles set status='ended' where role_id=%s",(f[1],))
            guarded=apply_company_intro_live_delivery_guard(db,talent_id=str(f[0]),plan=plan(f))
            assert guarded['selectedRecommendations']==[] and guarded['delivery']['shouldSendEmail'] is False
            assert one('select status from company_intro_candidates where id=%s',(f[2],))['status']=='closed'
        assert one("select has_function_privilege('authenticated','request_company_intro_v1(uuid,uuid,uuid,uuid,text[],text)','execute') allowed")['allowed'] is False
        print('PASS: no-stage and saved-stage Intro request, acceptance replay, Worker delivery, duplicate-route guard, wrong-role stage, authorization, privacy/test isolation/closed-role cancellation')

if __name__=='__main__':
    with tempfile.TemporaryDirectory(prefix='harper-stage-pg-',dir='/tmp') as temp:
        root=Path(temp);data=root/'data'
        with socket.socket() as sock: sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
        share=['-L',os.environ['HARPER_TEST_PG_SHARE']] if os.environ.get('HARPER_TEST_PG_SHARE') else []
        subprocess.run(['initdb','-D',str(data),'-A','trust','--no-locale','-E','UTF8',*share],check=True,stdout=subprocess.DEVNULL)
        started=False
        try:
            subprocess.run(['pg_ctl','-D',str(data),'-l',str(root/'server.log'),'-o',f'-h 127.0.0.1 -p {port} -k {root}','-w','start'],check=True,stdout=subprocess.DEVNULL);started=True
            run(f'host=127.0.0.1 port={port} dbname=postgres user={getpass.getuser()}')
        finally:
            if started: subprocess.run(['pg_ctl','-D',str(data),'-m','fast','-w','stop'],check=True,stdout=subprocess.DEVNULL)
