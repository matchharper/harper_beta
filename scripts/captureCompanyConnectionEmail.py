"""Read-only forecast capture; executes ONLY the migration's marked SELECT body."""
import sys, json, os
from pathlib import Path
root = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root.parent/'harper_worker'))
from opp.utils.new_runtime import connect_read_only, fetch_all, load_config
from dotenv import load_dotenv
from opp.utils.tool_agent import to_jsonable
for env in (root.parent/"harper_worker/worker.env",root/".env.local"):
    load_dotenv(env,override=False)
if not os.environ.get("OPPORTUNITY_DATABASE_URL"):
    os.environ["OPPORTUNITY_DATABASE_URL"]=os.environ.get("CAREER_ROLE_SEARCH_DATABASE_URL", "")
output = root/'docs/evaluation/company-email-connection/private'
output.mkdir(parents=True,exist_ok=True,mode=0o700)
os.chmod(output,0o700)
source=(root/'supabase/migrations/20261015130959_company_connection_email_delivery.sql').read_text()
query=source.split('$snapshot$')[1].replace('p_user_id','NULL::uuid')
os.environ["OPPORTUNITY_DB_POOL_MODE"]="session"
with connect_read_only(load_config()) as conn:
    rows=fetch_all(conn,query)
    people=[next(iter(row.values())) for row in rows]
    exists=fetch_all(conn,"select to_regclass('public.company_email_outbox') is not null as present")[0]['present']
    history=fetch_all(conn,"select recipient_id,ordinal,status,sent_at,attempted_at,available_at,id,snapshot->'workspaces' as workspaces from public.company_email_outbox where topic='slack_connection'") if exists else []
    now=fetch_all(conn,"select now() as captured_at")[0]['captured_at']
result={'capturedAt':to_jsonable(now),'readOnly':True,'historyTablePresent':exists,'people':people,'history':to_jsonable(history)}
p=output/'forecast-input.json'
p.write_text(json.dumps(result,ensure_ascii=False,indent=2,default=str));os.chmod(p,0o600)
print(json.dumps({'recipients':len(people),'historyTablePresent':exists,'path':str(p)},ensure_ascii=False))
