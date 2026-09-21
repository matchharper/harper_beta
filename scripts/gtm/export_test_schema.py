"""Export GTM schema and functions only for isolated workspace tests (never rows).
Uses the existing worker.env DB connection. No writes to the remote database.
"""
from pathlib import Path
import argparse
import os
import shutil
import subprocess
import psycopg
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True, mode=0o700)
url = dotenv_values(ROOT.parent / 'worker.env')['DATABASE_URL']
params = psycopg.conninfo.conninfo_to_dict(url)
env = dict(os.environ)
for param, key in [('host', 'PGHOST'), ('port', 'PGPORT'), ('user', 'PGUSER'), ('password', 'PGPASSWORD'), ('dbname', 'PGDATABASE'), ('sslmode', 'PGSSLMODE')]:
    if param in params:
        env[key] = params[param]
env['PGOPTIONS'] = '-c default_transaction_read_only=on -c statement_timeout=30000'
pg_dump = shutil.which('pg_dump')
if not pg_dump:
    raise SystemExit('pg_dump is required')
with (args.output / 'schema.sql').open('w') as target:
    subprocess.run([pg_dump, '--schema-only', '--no-owner', '--no-privileges', '-t', 'public.gtm_*'], env=env, stdout=target, check=True)
with psycopg.connect(url, options='-c default_transaction_read_only=on -c statement_timeout=30000') as conn:
    rows = conn.execute("select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname like 'gtm_%'").fetchall()
    (args.output / 'functions.sql').write_text('\n'.join(row[0].rstrip(';\n') + ';' for row in rows))
    workspace_rows = conn.execute("""
        select pg_get_functiondef(p.oid)
        from pg_proc p
        join pg_namespace n on n.oid=p.pronamespace
        where (n.nspname='gtm_view' and p.proname in ('prepare_email','creator_conversation','record_workspace'))
           or (n.nspname='public' and p.proname='gtm_workspace')
        order by case when n.nspname='gtm_view' then 0 else 1 end, p.proname
    """).fetchall()
    (args.output / 'workspace-functions.sql').write_text(
        '\n'.join(row[0].rstrip(';\n') + ';' for row in workspace_rows)
    )
print('Exported GTM schema and function definitions. No business rows or credentials exported.')
