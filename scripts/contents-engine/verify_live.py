"""Read-only verification of the installed scoped API. Does not print credentials or user data."""
import json
from pathlib import Path
import ssl
import time
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import certifi
from client import call_api

c=json.loads((Path.home()/'.config/harper/contents-engine.json').read_text())
context=ssl.create_default_context(cafile=certifi.where())
for path,payload in [('/rest/v1/gtm_creators?select=id&limit=1',None),
                     ('/rest/v1/rpc/gtm_performance',{}),
                     ('/rest/v1/rpc/gtm_api',{'p_token':'invalid','p_action':'list','p_entity':'gtm_creators'})]:
    req=Request(c['supabase_url']+path,data=None if payload is None else json.dumps(payload).encode(),
                headers={'apikey':c['anon_key'],'Content-Type':'application/json'})
    try:
        urlopen(req,context=context,timeout=30)
        raise AssertionError('Unexpected public access: '+path)
    except HTTPError as e:
        assert e.code in (400,401,403,404),e.code
        print('PASS blocked unauthorized endpoint',path.split('?')[0],e.code)

start=time.monotonic()
rows=call_api({'action':'list','entity':'gtm_creators'},c)
assert isinstance(rows['rows'],list)
print('PASS scoped GTM list',round(time.monotonic()-start,2),'seconds')
if rows['rows']:
    required = {
        'activity_regions', 'platforms', 'account_summary', 'total_followers',
        'content_count_365d', 'outreach_status', 'contact_summary',
        'primary_platform', 'primary_handle', 'primary_profile_url',
        'primary_email', 'first_outreach_at', 'current_plan_ref',
        'current_plan_name', 'published_content_count', 'last_published_at',
        'latest_direction_reason', 'data_status', 'refresh_fields',
        'outreach_score',
    }
    assert required <= set(rows['rows'][0]), required-set(rows['rows'][0])
    print('PASS creator operating fields available')
else:
    print('SKIP creator operating field response check: no creator rows')
for entity in ('gtm_formats', 'gtm_outreach_templates'):
    library = call_api({'action':'list','entity':entity,'data':{'limit':1}}, c)
    assert isinstance(library['rows'], list)
    print('PASS scoped reusable library', entity)
start=time.monotonic()
result=call_api({'action':'performance'},c)
def inspect(value):
    if isinstance(value,dict):
        assert not set(value).intersection({'email','user_id','local_id','talent_id'}),'Raw product identity exposed'
        for v in value.values():inspect(v)
    elif isinstance(value,list):
        for v in value:inspect(v)
inspect(result)
assert result['definition_version']=='gtm_observed_utm_v1'
print('PASS aggregate-only product tracking',round(time.monotonic()-start,2),'seconds')
print('PASS product metrics available; no product identity fields returned')

def call_sheet(view):
    payload = json.dumps({
        'p_token': c['token'], 'p_view': view, 'p_limit': 1, 'p_offset': 0,
    }).encode()
    req = Request(c['supabase_url']+'/rest/v1/rpc/gtm_sheet_view', data=payload,
                  headers={'apikey':c['anon_key'],'Content-Type':'application/json'})
    with urlopen(req,context=context,timeout=30) as response:
        return json.load(response)

for view in ('creator_directory','connected_creators','outreach_log','outreach_review'):
    result = call_sheet(view)
    assert isinstance(result['rows'],list)
    print('PASS Sheet operating view',view)
