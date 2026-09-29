"""Restore a schema snapshot to a fresh, fixed local Supabase instance only."""
import os
from pathlib import Path
import subprocess
import psycopg

ROOT=Path(__file__).resolve().parents[2]
PRIVATE=ROOT/".local/full-stack/private"
DSN="postgresql://postgres:postgres@127.0.0.1:55432/postgres"
with psycopg.connect(DSN,autocommit=True) as conn, conn.cursor() as cur:
    cur.execute("select to_regclass('local_e2e.environment'),to_regclass('public.company_roles')")
    marker,roles=cur.fetchone()
    if marker:
        print("Existing local environment retained; schema not reapplied.")
        raise SystemExit(0)
    if roles: raise SystemExit("Refusing to restore over an existing unmarked application schema")
    cur.execute("drop extension if exists pg_net; drop extension if exists http; create extension if not exists vector with schema public; create extension if not exists pg_trgm with schema public;")
    cur.execute("select 1 from pg_roles where rolname='harper_worker'")
    if not cur.fetchone(): cur.execute("create role harper_worker")
dump=PRIVATE/"public-schema.dump"
listing=subprocess.check_output(["pg_restore","--list",str(dump)],text=True)
# Keep existing object ACLs/RLS. Cloud superuser default ACLs for *future*
# objects cannot be altered by local postgres and are not runtime data.
listing="\n".join(line for line in listing.splitlines() if " SCHEMA - public " not in line and " DEFAULT ACL " not in line)
target=PRIVATE/"restore.list";target.write_text(listing);target.chmod(0o600)
with (PRIVATE/"restore.log").open("w") as log:
    result=subprocess.run(["pg_restore","--host","127.0.0.1","--port","55432","--username","postgres","--dbname","postgres","--no-owner","--single-transaction","--use-list",str(target),str(dump)],env={**os.environ,"PGPASSWORD":"postgres"},stdout=log,stderr=log)
if result.returncode: raise SystemExit("Schema restore failed; inspect private/restore.log. No fixture or worker was started.")
with psycopg.connect(DSN) as conn,conn.cursor() as cur:
    cur.execute("notify pgrst, 'reload schema'")
print("Local public schema, RPCs, triggers, ACLs and RLS restored; zero production rows copied.")
