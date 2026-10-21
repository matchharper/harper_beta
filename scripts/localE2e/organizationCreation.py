"""Additional Organization transactions on the isolated DB; exact-ID cleanup.

Use stackEnv() and the existing local venv, after applying the organization_add
migration locally. Creates no Roles, sends no messages, and makes no web calls.
"""
import os
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse
from uuid import uuid4
import psycopg
from psycopg.types.json import Jsonb

url = os.environ['DATABASE_URL']
assert os.environ.get('HARPER_LOCAL_E2E') == '1'
assert urlparse(url).hostname in ('127.0.0.1', 'localhost')
conn = psycopg.connect(url, autocommit=True)
assert conn.execute('select id from local_e2e.environment').fetchall() == [('harper-local-e2e',)]
users = [uuid4() for _ in range(4)]
source = uuid4()
workspaces, companies = {source}, set()
domain = f'org-add-{uuid4().hex}.com'
request_id = uuid4()
completed = '2026-10-01T00:00:00+00:00'

def service(sql, values=()):
    with psycopg.connect(url) as other:
        other.execute('set local role service_role')
        return other.execute(sql, values).fetchone()[0]

def create(actor=0, domain=domain, request=request_id, internal=False):
    email = conn.execute('select email from auth.users where id=%s', (users[actor],)).fetchone()[0]
    return service('select workspace_create_additional_v1(%s,null,%s,%s,%s,%s,%s,%s)',
                   (email, users[actor], source, domain, 'https://'+domain, request, internal))

def update(actor, workspace, action, values=None):
    return service('select workspace_signup_update_v1(%s,%s,%s,%s)',
                   (users[actor], workspace, action, Jsonb(values or {})))

def fails(fn, message):
    try:
        fn()
    except psycopg.Error as error:
        assert message in str(error), str(error)
    else:
        raise AssertionError(f'Expected {message}')

try:
    for i, user in enumerate(users):
        conn.execute('insert into auth.users(id,email,email_confirmed_at,is_anonymous) values(%s,%s,now(),false)',
                     (user, f'new@{domain}' if i == 3 else f'org-add-{uuid4().hex}@gmail.com'))
        conn.execute('insert into company_users(user_id,email,name,role,onboarding_completed_at) values(%s,%s,%s,%s,%s)',
                     (user, f'fixture{i}@gmail.com', 'Organization fixture', 'Engineer', completed))
    conn.execute("insert into company_workspace(company_workspace_id,company_name,billing_model) values(%s,'Organization source','standard')", (source,))
    for i in (0, 1):
        conn.execute("insert into company_user_workspace(company_user_id,company_workspace_id,authority,role) values(%s,%s,'viewer','Hiring lead')", (users[i], source))

    fails(lambda: create(2), 'signup_forbidden')
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: create(), range(2)))
    assert sorted(row['status'] for row in results) == ['created', 'resume']
    workspace = results[0]['workspaceId']
    workspaces.add(workspace)
    assert all(row['workspaceId'] == workspace for row in results)
    new_attempt = create(request=uuid4())
    assert new_attempt['status'] == 'created' and new_attempt['workspaceId'] != workspace
    workspaces.add(new_attempt['workspaceId'])
    other_owner = create(1)
    assert other_owner['status'] == 'created' and other_owner['workspaceId'] != workspace
    workspaces.add(other_owner['workspaceId'])
    assert conn.execute('select count(*) from company_user_workspace where company_workspace_id=%s and company_user_id=%s', (workspace, users[1])).fetchone()[0] == 0
    fails(lambda: create(domain='other-'+domain), 'signup_creation_conflict')
    row = conn.execute('select signup_state,billing_model from company_workspace where company_workspace_id=%s', (workspace,)).fetchone()
    assert row[0]['plan'] == 'free' and row[0]['planSelectedAt'] and row[1] == 'standard'
    assert conn.execute('select authority from company_user_workspace where company_workspace_id=%s and company_user_id=%s', (workspace, users[0])).fetchone()[0] == 'owner'
    assert conn.execute('select role from company_user_workspace where company_workspace_id=%s and company_user_id=%s', (workspace, users[0])).fetchone()[0] == 'Hiring lead'
    assert conn.execute('select count(*) from company_roles where company_workspace_id=%s', (workspace,)).fetchone()[0] == 0
    assert conn.execute('select onboarding_completed_at::text from company_users where user_id=%s', (users[0],)).fetchone()[0].startswith('2026-10-01')
    fails(lambda: update(0, workspace, 'complete'), 'signup_setup_required')
    fails(lambda: update(1, workspace, 'company', {'name': 'Unauthorized'}), 'signup_forbidden')
    update(0, workspace, 'company', {'name': 'Organization fixture', 'description': '', 'linkedinUrl': 'https://www.linkedin.com/company/'+domain})
    companies.add(conn.execute('select company_db_id from company_workspace where company_workspace_id=%s', (workspace,)).fetchone()[0])
    finished = update(0, workspace, 'complete')
    assert finished['completedAt'] and update(0, workspace, 'complete') == finished
    assert create()['status'] == 'member'
    assert conn.execute('select onboarding_completed_at::text from company_users where user_id=%s', (users[0],)).fetchone()[0].startswith('2026-10-01')
    print('PASS Viewer creates unrelated company as Owner; retries/concurrency, independent same-company Organizations, Free, no Roles, scoped completion')

    entry = service('select workspace_signup_begin_v1(%s,null,%s,%s,false)', (f'new@{domain}', users[3], domain))
    assert entry == {'status': 'new', 'domain': domain}
    with ThreadPoolExecutor(max_workers=2) as pool:
        first_results = list(pool.map(lambda _: service('select workspace_signup_begin_v1(%s,null,%s,%s,true)', (f'new@{domain}', users[3], domain)), range(2)))
    assert sorted(result['status'] for result in first_results) == ['created', 'member']
    first_workspace = first_results[0]['workspaceId']
    workspaces.add(first_workspace)
    assert all(result['workspaceId'] == first_workspace for result in first_results)
    assert first_workspace != workspace
    assert conn.execute('select count(*) from company_user_workspace where company_workspace_id=%s and company_user_id=%s', (workspace, users[3])).fetchone()[0] == 0
    update(3, first_workspace, 'company', {'name': 'First signup fixture', 'description': 'Independent description', 'linkedinUrl': 'https://www.linkedin.com/company/'+domain})
    shared_company = conn.execute('select company_db_id from company_workspace where company_workspace_id=%s', (first_workspace,)).fetchone()[0]
    assert shared_company in companies
    assert conn.execute('select company_description from company_workspace where company_workspace_id=%s', (workspace,)).fetchone()[0] == ''
    assert conn.execute('select description from company_db where id=%s', (shared_company,)).fetchone()[0] == ''
    assert conn.execute('select company_description from company_workspace where company_workspace_id=%s', (first_workspace,)).fetchone()[0] == 'Independent description'
    print('PASS first signup proceeds when an added Organization already uses its domain and LinkedIn company')

    other_domain = 'other-'+domain
    second = create(1, domain=other_domain, request=uuid4())['workspaceId']
    workspaces.add(second)
    update(1, second, 'company', {'name': 'Independent fixture', 'linkedinUrl': 'https://www.linkedin.com/company/'+domain})
    assert conn.execute('select signup_state from company_workspace where company_workspace_id=%s', (second,)).fetchone()[0].get('companyConfirmedAt')
    third = create(2, domain='internal-'+domain, request=uuid4(), internal=True)['workspaceId']
    workspaces.add(third)
    for role in ('anon', 'authenticated'):
        assert not conn.execute("select has_function_privilege(%s,'workspace_create_additional_v1(text,text,uuid,uuid,text,text,uuid,boolean)','execute')", (role,)).fetchone()[0]
    assert conn.execute("select not prosecdef from pg_proc where oid='workspace_create_additional_v1(text,text,uuid,uuid,text,text,uuid,boolean)'::regprocedure").fetchone()[0]
    print('PASS repeated LinkedIn identity accepted, internal access supported, invoker function restricted to service_role')
finally:
    for workspace in workspaces:
        conn.execute('delete from company_workspace where company_workspace_id=%s', (workspace,))
    for company in companies:
        if company is not None:
            conn.execute('delete from company_db where id=%s', (company,))
    for user in users:
        conn.execute('delete from company_users where user_id=%s', (user,))
        conn.execute('delete from auth.users where id=%s', (user,))
    conn.close()
