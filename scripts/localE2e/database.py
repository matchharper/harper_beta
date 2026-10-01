"""Local DB identity, fixture seed and queue status. Refuses remote endpoints."""
import json
import os
from pathlib import Path
import sys
from uuid import UUID
import psycopg
from psycopg.types.json import Jsonb
from psycopg.rows import dict_row

ROOT = Path(__file__).resolve().parents[2]
PRIVATE = ROOT / ".local/full-stack/private"
sys.path.insert(0, str(ROOT.parent / "harper_worker"))
import local_e2e
local_e2e.validate()
if not local_e2e.enabled():
    raise SystemExit("Use the local E2E environment")
command = sys.argv[1]
conn = psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row)
with conn, conn.cursor() as cur:
    if command == "mark":
        cur.execute("select count(*) as n from public.company_roles")
        if cur.fetchone()["n"]:
            raise SystemExit("Refusing to initialize a database with existing Roles")
        cur.execute("create schema if not exists local_e2e; create table if not exists local_e2e.environment(id text primary key check(id='harper-local-e2e')); insert into local_e2e.environment values ('harper-local-e2e') on conflict do nothing")
    cur.execute("select id from local_e2e.environment")
    if cur.fetchall() != [{"id": "harper-local-e2e"}]:
        raise SystemExit("Local database marker missing")
    if command == "migrate":
        import hashlib
        name=sys.argv[2]
        file=(ROOT/"supabase/migrations"/name).resolve()
        if file.parent != (ROOT/"supabase/migrations").resolve() or file.suffix!=".sql":
            raise SystemExit("Use an exact migration filename")
        content=file.read_text(); digest=hashlib.sha256(content.encode()).hexdigest()
        cur.execute("create table if not exists local_e2e.migrations(name text primary key,sha256 text not null,applied_at timestamptz not null default now())")
        cur.execute("select sha256 from local_e2e.migrations where name=%s",(name,));previous=cur.fetchone()
        if previous and previous["sha256"]!=digest: raise SystemExit("Previously applied local migration changed; inspect before proceeding")
        if not previous:
            cur.execute(content)
            cur.execute("insert into local_e2e.migrations(name,sha256) values (%s,%s)",(name,digest))
            cur.execute("notify pgrst, 'reload schema'")
        print("Local migration already applied" if previous else "Applied migration to local DB only",name)
    cur.execute("select to_regclass('cron.job') as cron")
    if cur.fetchone()["cron"]:
        cur.execute("select count(*) as n from cron.job")
        if cur.fetchone()["n"]:
            raise SystemExit("Local environment must not have cron schedules")
    cur.execute("select extname from pg_extension where extname in ('pg_net','http')")
    if cur.fetchall():
        raise SystemExit("Local database must not have outbound HTTP extensions")
    if command == "seed":
        f = json.loads((PRIVATE / "fixture.json").read_text())
        candidate, company = f["candidateId"], f["companyUserId"]
        workspace, role = f["workspaceId"], f["roleId"]
        for value in [candidate, company, workspace, role, f["introId"], f["selectionRunId"]]: UUID(value)
        cur.execute("insert into company_db(id,name,description,short_description,website_url) values (900001,'Harper Local','로컬 통합 테스트를 위한 합성 회사 데이터입니다.','로컬 테스트 Workspace','http://localhost:3000') on conflict do nothing")
        cur.execute("insert into company_workspace(company_workspace_id,company_name,is_internal,company_db_id,company_description,brief,published_name) values (%s,'Harper',true,900001,%s,%s,'Harper Local') on conflict do nothing", (workspace,"로컬 테스트용 합성 Workspace. 운영 회사에 영향을 주지 않습니다.","채용 담당자와 후보자의 소통을 돕는 소프트웨어를 만드는 합성 테스트 팀입니다."))
        for user, email, name in [(candidate,"khj605123@gmail.com","김하준"),(company,"daniel@matchharper.com","박서윤")]:
            cur.execute("insert into company_users(user_id,email,name,is_authenticated,onboarding_completed_at) values (%s,%s,%s,true,now()) on conflict do nothing",(user,email,name))
            cur.execute("insert into company_user_workspace(company_user_id,company_workspace_id,authority) values (%s,%s,'owner') on conflict do nothing",(user,workspace))
        cur.execute("insert into talent_users(user_id,email,name,headline,bio,resume_text,location) values (%s,'khj605123@gmail.com','김하준','백엔드 엔지니어 · Python / PostgreSQL',%s,%s,'서울') on conflict do nothing",(candidate,"실제 인물 경력이 아닌 로컬 E2E 합성 프로필입니다.","[로컬 E2E 합성 프로필] 백엔드 개발 5년. Python과 PostgreSQL로 B2B SaaS API와 비동기 작업 처리를 개발했습니다. 중복 작업 방지와 재시도 설계를 담당했고, 고객 피드백에 따라 제품 기능을 개선했습니다."))
        cur.execute("insert into talent_setting(user_id,is_onboarding_done,profile_visibility,get_internal_recommendation,get_external_recommendation,status) values (%s,true,'open_to_matches',true,false,'stopped') on conflict do nothing",(candidate,))
        cur.execute("insert into talent_conversations(id,user_id,stage) values (%s,%s,'completed') on conflict do nothing",(f["conversationId"],candidate))
        cur.execute("insert into talent_experiences(talent_id,role,company_name,description,start_date,months) select %s,'Backend Engineer','Local Fixture SaaS','Python API, PostgreSQL 데이터 모델링, 비동기 처리와 중복 방지 설계. 합성 테스트 경력.',date '2021-01-01',60 where not exists (select 1 from talent_experiences where talent_id=%s)",(candidate,candidate))
        cur.execute("insert into talent_contexts(talent_id,ref,collection,label,content) select %s,1,'brief','다음 역할','고객 문제를 직접 듣고 제품을 개선하는 백엔드 역할을 찾습니다. Python과 PostgreSQL 경험을 활용하고 싶습니다.' where not exists (select 1 from talent_contexts where talent_id=%s)",(candidate,candidate))
        info={"testOnly":True,"testFixture":"local-full-stack-v1","testTalentIds":[candidate]}
        description="로컬 통합 테스트를 위한 합성 Backend Engineer Role입니다. Python API와 PostgreSQL 데이터 모델을 설계하고, 비동기 처리의 안정성을 높이며, 고객 피드백을 제품에 반영하는 업무를 담당합니다."
        brief="## Hard constraints\n추가 필수 조건은 없습니다.\n\n## Preferred criteria\n백엔드 제품을 직접 개발하고 운영한 경험을 선호합니다. API 설계와 데이터 모델링에서 맡은 범위 및 운영 문제를 해결한 사례를 확인합니다.\n\n### 강한 가산점\n비동기 작업의 중복 처리나 재시도 문제를 해결한 경험은 이 합성 테스트 팀의 서비스 안정성 개선 업무와 관련이 있어 가산점으로 봅니다."
        cur.execute("insert into company_roles(role_id,company_workspace_id,name,source_type,status,information,description,location_text,work_mode) values (%s,%s,%s,'internal','active',%s,%s,'서울','hybrid') on conflict do nothing",(role,workspace,f.get("roleName","[Local E2E] Backend Engineer"),Jsonb(info),description))
        # Creating company_roles also creates its internal row through a DB
        # trigger. Fill that row rather than silently losing the fixture brief.
        cur.execute("insert into company_internal_roles(role_id,request,is_auto,is_company_first_search) values (%s,%s,false,false) on conflict(role_id) do update set request=coalesce(company_internal_roles.request,excluded.request),is_auto=false,is_company_first_search=false",(role,brief))
        cur.execute("insert into ops_matching_role_stages(id,role_id,label) values (%s,%s,'첫 대화') on conflict do nothing",(f["stageId"],role))
        cur.execute("insert into company_first_search_runs(id,company_workspace_id,scheduled_slot,status,result,finished_at) values (%s,%s,now(),'completed',%s,now()) on conflict do nothing",(f["selectionRunId"],workspace,Jsonb({"localFixture":True,"note":"Prepared ready proposal; no selection LLM run is claimed."})))
        cur.execute("insert into company_intro_candidates(id,company_workspace_id,role_id,talent_id,selection_run_id,selection_reason,presentation,role_fingerprint,talent_fingerprint) values (%s,%s,%s,%s,%s,%s,%s,'local-fixture-v1','local-fixture-v1') on conflict do nothing",(f["introId"],workspace,role,candidate,f["selectionRunId"],"Python과 PostgreSQL 기반 SaaS 개발 경험, 비동기 작업 안정성 개선 경험이 Role 업무와 연결됩니다. 합성 프로필 기반 테스트 제안입니다.",Jsonb({"headline":"Python · PostgreSQL 백엔드 경험","reason":"API와 데이터 모델링, 비동기 처리 안정성 경험을 확인해 볼 후보자입니다."})))
        s=f["slack"]
        cur.execute("insert into company_slack_integrations(company_workspace_id,slack_team_id,slack_team_name,slack_app_id,slack_bot_user_id,bot_token_ciphertext,status,installed_by_user_id) values (%s,%s,%s,%s,%s,%s,'active',%s) on conflict do nothing",(workspace,s["team_id"],s["team"],s["app_id"],s["user_id"],s["encrypted_token"],company))
        cur.execute("update company_slack_integrations set scopes=%s,bot_token_ciphertext=%s where company_workspace_id=%s and slack_app_id=%s",(s.get("scopes",[]),s["encrypted_token"],workspace,s["app_id"]))
        cur.execute("insert into company_slack_channels(id,company_workspace_id,slack_team_id,slack_channel_id,slack_channel_name,default_role_id,worker_target) values (%s,%s,%s,%s,%s,%s,'local-e2e') on conflict do nothing",(f["channelRowId"],workspace,s["team_id"],s["channel_id"],s["channel_name"],role))
        # company_role_notification_channels stores opt-outs. New fixture
        # Roles receive notifications by leaving that table empty.
        cur.execute("update company_slack_channels set default_role_id=%s where id=%s",(role,f["channelRowId"]))
    cur.execute("select count(*) as n from company_roles where source_type='internal' and (information->>'testOnly') is distinct from 'true'")
    if cur.fetchone()["n"]: raise SystemExit("Unmarked local Role detected")
    cur.execute("select count(*) as n from talent_opportunity_fit f join company_roles r on r.role_id=f.opportunity_id where r.information->>'testOnly'='true'")
    if cur.fetchone()["n"]: raise SystemExit("Test Role leaked into fit rows")
    cur.execute("select count(*) as n from company_slack_channels where worker_target <> 'local-e2e'")
    if cur.fetchone()["n"]: raise SystemExit("Unexpected Slack worker target")
    cur.execute("select status,count(*) as count from opportunity_discovery_run group by status")
    opportunity=cur.fetchall()
    cur.execute("select status,count(*) as count from email_reply_jobs group by status")
    email=cur.fetchall()
    cur.execute("select status,count(*) as count from company_intro_candidates group by status")
    intros=cur.fetchall()
    print(json.dumps({"localMarker":True,"productionQueuesCopied":False,"opportunity":opportunity,"email":email,"intros":intros},default=str))
