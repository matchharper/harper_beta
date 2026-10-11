"""Exercise signup transactions on the isolated local DB; no roles or messages.

Requires the signup migration. All fixtures, including concurrent transactions,
are removed by exact IDs. No shared company record is modified.
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
domain = f'signup-{uuid4().hex}.com'
domains = [domain, domain, f'other-{domain}', f'last-{domain}']
workspaces, companies = set(), set()

def scalar(sql, args=()):
    return conn.execute(sql, args).fetchone()[0]

def begin(i):
    with psycopg.connect(url) as other:
        other.execute('set local role service_role')
        return other.execute('select workspace_signup_begin_v1(%s,%s,true)', (users[i], domains[i])).fetchone()[0]

def update(i, workspace, action, values=None):
    return scalar('select workspace_signup_update_v1(%s,%s,%s,%s)', (users[i], workspace, action, Jsonb(values or {})))

def fails(fn, message):
    try:
        fn()
    except psycopg.Error as e:
        assert message in str(e), str(e)
    else:
        raise AssertionError(f'Expected {message}')

try:
    for i, user in enumerate(users):
        conn.execute("insert into auth.users(id,email,email_confirmed_at,is_anonymous) values(%s,%s,now(),false)", (user, f'owner{i}@{domains[i]}'))
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(begin, [0, 0]))
    assert sorted(r['status'] for r in results) == ['created', 'member']
    workspace = results[0]['workspaceId']
    workspaces.add(workspace)
    assert results[1]['workspaceId'] == workspace
    assert begin(1)['status'] == 'invite_required'
    summary = scalar('select workspace_billing_summary_v2(%s)', (workspace,))
    assert (summary['model'], summary['capacity'], summary['balance']) == ('free', 1, 5)
    assert scalar('select count(*) from company_roles where company_workspace_id=%s', (workspace,)) == 0
    fails(lambda: scalar('select workspace_signup_begin_v1(%s,%s,true)', (users[0], 'spoofed.com')), 'signup_work_email_required')
    fails(lambda: update(1, workspace, 'company', {'name':'Unauthorized'}), 'signup_forbidden')
    fails(lambda: update(0, workspace, 'plan', {'plan':'free'}), 'signup_company_required')
    assert not scalar("select has_function_privilege('authenticated','workspace_signup_begin_v1(uuid,text,boolean)','execute')")
    assert not scalar("select has_function_privilege('anon','workspace_signup_update_v1(uuid,uuid,text,jsonb)','execute')")
    print('PASS verified domain, same-user concurrency, duplicate company, permissions, Free 1 slot/5 credits, no roles')

    claim = update(0, workspace, 'research_start')
    assert claim['claimed'] and not update(0, workspace, 'research_start')['claimed']
    assert not update(0, workspace, 'research_finish', {'token':'stale'})['applied']
    update(0, workspace, 'research_finish', {'token':claim['token'], 'company':{'name':'Research name','description':'Public company description','totalFundingRaised':'USD 100,000','location':'Seoul','sources':[{'title':'About','url':'https://'+domain+'/about'}]}})
    assert not update(0, workspace, 'research_start')['claimed']
    fails(lambda: update(0, workspace, 'company', {'name':'', 'description':''}), 'signup_invalid_company')
    fails(lambda: update(0, workspace, 'company', {'name':'Signup fixture', 'description':'x' * 8001}), 'signup_invalid_company')
    company = {'name':'Signup fixture', 'description':'', 'linkedinUrl':f'https://www.linkedin.com/company/{domain}'}
    update(0, workspace, 'company', company)
    company_id = scalar('select company_db_id from company_workspace where company_workspace_id=%s', (workspace,))
    companies.add(company_id)
    assert scalar('select company_description from company_workspace where company_workspace_id=%s',(workspace,)) == ''
    assert scalar('select description from company_db where id=%s',(company_id,)) == ''
    assert scalar('select name from company_db where id=%s',(company_id,)) == company['name']
    assert scalar('select location from company_db where id=%s',(company_id,)) == 'Seoul'
    assert scalar('select total_funding_raised from company_data where company_workspace_id=%s',(workspace,)) == 'USD 100,000'
    assert not update(0, workspace, 'research_finish', {'token':claim['token'], 'company':{'name':'Late overwrite'}})['applied']
    assert scalar('select company_name from company_workspace where company_workspace_id=%s',(workspace,)) == company['name']
    fails(lambda: update(0, workspace, 'plan', {'plan':'slot'}), 'signup_payment_pending')
    update(0, workspace, 'plan', {'plan':'free'})
    assert scalar("select signup_state->>'plan' from company_workspace where company_workspace_id=%s",(workspace,)) == 'free'
    print('PASS optional company description, required name, research claim/stale result/manual edits, company records, paid selection blocked without payment, Free selection')

    # Two unrelated email domains must not claim the same LinkedIn company at once.
    for i in (2,3):
        workspaces.add(begin(i)['workspaceId'])
    other_ws = {i: scalar('select company_workspace_id from company_user_workspace where company_user_id=%s',(users[i],)) for i in (2,3)}
    shared = {'name':'Concurrent company', 'description':'Company description', 'linkedinUrl':f'https://www.linkedin.com/company/shared-{domain}'}
    def confirm(i):
        try:
            with psycopg.connect(url) as other:
                company_values = shared | {'linkedinUrl': shared['linkedinUrl'].upper() if i == 3 else shared['linkedinUrl']}
                other.execute('select workspace_signup_update_v1(%s,%s,%s,%s)', (users[i],other_ws[i],'company',Jsonb(company_values)))
            return 'confirmed'
        except psycopg.Error as error:
            assert 'signup_company_exists' in str(error), str(error)
            return 'blocked'
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(confirm,[2,3])) == ['blocked','confirmed']
    print('PASS concurrent LinkedIn company claim')
finally:
    for workspace in workspaces:
        db_id = scalar('select company_db_id from company_workspace where company_workspace_id=%s',(workspace,))
        if db_id: companies.add(db_id)
        conn.execute('delete from company_workspace_credit_periods where company_workspace_id=%s',(workspace,))
        conn.execute('delete from company_data where company_workspace_id=%s',(workspace,))
        conn.execute('delete from company_user_workspace where company_workspace_id=%s',(workspace,))
        conn.execute('delete from company_workspace where company_workspace_id=%s',(workspace,))
    for user in users:
        conn.execute('delete from company_users where user_id=%s',(user,))
        conn.execute('delete from auth.users where id=%s',(user,))
    for company_id in companies:
        conn.execute('delete from company_db where id=%s',(company_id,))
    conn.close()
    print('Local signup fixtures removed.')
