"""Archive and clear only this marked local test database between scenarios."""
import json
import os
from pathlib import Path
import subprocess
import sys
from datetime import datetime, timezone
import psycopg
from psycopg import sql

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT.parent/"harper_worker"))
import local_e2e
local_e2e.validate()
if not local_e2e.enabled():raise SystemExit("Local mode required")
private=ROOT/".local/full-stack/private"
stamp=datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
archive=private/"rounds"/stamp;archive.mkdir(parents=True,mode=0o700)
os.umask(0o077)
with psycopg.connect(os.environ["DATABASE_URL"]) as conn,conn.cursor() as cur:
    cur.execute("select id from local_e2e.environment")
    if cur.fetchall()!=[("harper-local-e2e",)]:raise SystemExit("Wrong database marker")
    for table,statuses in [("opportunity_discovery_run",["running"]),("email_reply_jobs",["processing"]),("slack_reply_jobs",["processing"]),("company_agent_web_action_jobs",["processing"]),("contact_queue",["processing"])]:
        cur.execute(sql.SQL("select count(*) from {} where status=any(%s)").format(sql.Identifier(table)),(statuses,))
        if cur.fetchone()[0]:raise SystemExit(f"Cannot reset while {table} has in-flight work")
    target=archive/"database.dump"
    subprocess.run(["pg_dump","--host","127.0.0.1","--port","55432","--username","postgres","--dbname","postgres","--format=custom","--schema=public","--schema=local_e2e","--file",str(target)],env={**os.environ,"PGPASSWORD":"postgres"},check=True)
    subprocess.run(["pg_restore","--list",str(target)],stdout=subprocess.DEVNULL,check=True)
    cur.execute("select tablename from pg_tables where schemaname='public'")
    tables=[sql.Identifier("public",row[0]) for row in cur.fetchall()]
    cur.execute(sql.SQL("truncate {} restart identity cascade").format(sql.SQL(",").join(tables)))
    for name in ["fixture.json","mailbox.json"]:
        file=private/name
        if file.exists(): (archive/name).write_bytes(file.read_bytes())
    # Runtime mailbox mappings are per scenario; old Gmail replies must not
    # enter a new scenario after its DB facts have been cleared.
    (private/"mailbox.json").write_text(json.dumps({"outgoing":{},"incoming":{},"aliases":{},"seen":{},"idempotency":{}}))
    config_file=private/"config.json";config=json.loads(config_file.read_text())
    import secrets
    config["namespace"]=secrets.token_hex(5)
    config["slackStartedAt"]=datetime.now(timezone.utc).timestamp()
    config_file.write_text(json.dumps(config,indent=2))
    print("Previous local DB/mail archived:",archive)
