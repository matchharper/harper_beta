"""Restore a schema snapshot to a fresh, fixed local Supabase instance only."""
import os
from pathlib import Path
import re
import subprocess
import psycopg
from psycopg import sql

ROOT=Path(__file__).resolve().parents[2]
PRIVATE=ROOT/".local/full-stack/private"
DSN="postgresql://postgres:postgres@127.0.0.1:55432/postgres"
# Superuser of the fixed local Supabase instance (same default password).
ADMIN_DSN="postgresql://supabase_admin:postgres@127.0.0.1:55432/postgres"
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
# A newer snapshot can name roles the fresh instance lacks (e.g. a read-only
# eval role) and pgvector settings on functions (hnsw.*) that local postgres,
# not a superuser, may set only once allowed. Prepare both as the local admin.
script=subprocess.check_output(["pg_restore","--use-list",str(target),"--file","-",str(dump)],text=True)
grantees=set()
for found in re.findall(r"(?m)^GRANT [^;]* TO ([^;]+);",script)+re.findall(r"(?m)^CREATE POLICY .+? ON \S+(?: AS \w+)?(?: FOR \w+)? TO (.+?)(?: USING | WITH CHECK |;)",script):
    found=re.sub(r"\s+(WITH GRANT OPTION|GRANTED BY .*)$","",found)
    grantees|={name.strip().strip('"') for name in found.split(",")}
grantees={name for name in grantees if re.fullmatch(r"[a-z_][a-z0-9_]*",name) and name!="public"}
settings=sorted(set(re.findall(r'(?m)^\s+SET "?([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)"? TO ',script)))
try:
    admin=psycopg.connect(ADMIN_DSN,autocommit=True)
except psycopg.OperationalError as error:
    raise SystemExit(f"Local admin connection failed ({error}); no schema restored.")
with admin, admin.cursor() as cur:
    cur.execute("select rolname from pg_roles where rolname=any(%s)",(sorted(grantees),))
    for name in sorted(grantees-{row[0] for row in cur.fetchall()}):
        cur.execute(sql.SQL("create role {} nologin").format(sql.Identifier(name)))
        print(f"Created local role {name} (no login) for snapshot grants")
    for name in settings:
        cur.execute(sql.SQL("grant set on parameter {} to postgres").format(sql.SQL(".").join(map(sql.Identifier,name.split(".")))))
    if settings: print("Allowed function settings:",", ".join(settings))
with (PRIVATE/"restore.log").open("w") as log:
    result=subprocess.run(["pg_restore","--host","127.0.0.1","--port","55432","--username","postgres","--dbname","postgres","--no-owner","--single-transaction","--use-list",str(target),str(dump)],env={**os.environ,"PGPASSWORD":"postgres"},stdout=log,stderr=log)
if result.returncode: raise SystemExit("Schema restore failed; inspect private/restore.log. No fixture or worker was started.")
with psycopg.connect(DSN) as conn,conn.cursor() as cur:
    cur.execute("notify pgrst, 'reload schema'")
print("Local public schema, RPCs, triggers, ACLs and RLS restored; zero production rows copied.")
