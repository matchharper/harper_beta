"""Apply the reviewed GTM migrations in order and issue scoped credentials.

Run once, after test_db.py passes. No product deployments or source data writes.
Credentials are kept outside the repository; only their hashes enter PostgreSQL.
"""
from pathlib import Path
import hashlib
import json
import os
import secrets
import psycopg
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[2]
VERSIONS = [
    '20260916130000_gtm_contents_engine',
    '20260916131000_gtm_performance',
    '20260916132000_gtm_aggregation_fix',
    '20260917032009_gtm_creator_operating_view',
    '20260917041000_gtm_sheet_operating_views',
    '20260917052200_gtm_creator_overview_sheet_fields',
    '20260917055533_gtm_format_bank_outreach_templates',
    '20260917064500_gtm_creator_outreach_score',
]


def main():
    env = dotenv_values(ROOT / '.env.local')
    config_dir = Path.home() / '.config/harper'
    config_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    outputs = [config_dir / 'contents-engine.json', config_dir / 'contents-engine-sheets.json']
    if any(p.exists() for p in outputs):
        raise RuntimeError('Existing GTM credentials found. Inspect the existing setup instead of reapplying.')
    credentials = [secrets.token_urlsafe(32), secrets.token_urlsafe(32)]
    names = ['Hojin / Contents Engine Agent', 'Contents Engine Google Sheets']
    # Stage owner-only files before committing, so a filesystem error cannot strand credentials.
    staged = []
    for path, token in zip(outputs, credentials):
        temp = path.with_suffix('.pending')
        fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as handle:
            json.dump({'supabase_url': env['NEXT_PUBLIC_SUPABASE_URL'],
                       'anon_key': env['NEXT_PUBLIC_SUPABASE_ANON_KEY'], 'token': token}, handle)
        staged.append(temp)
    committed = False
    try:
        with psycopg.connect(dotenv_values(ROOT.parent / 'worker.env')['DATABASE_URL'],
                             connect_timeout=10, options='-c statement_timeout=30000 -c lock_timeout=3000') as conn:
            if conn.execute("select to_regclass('public.gtm_creators')").fetchone()[0]:
                raise RuntimeError('GTM tables already exist. Do not apply the initial schema again.')
            for version in VERSIONS:
                conn.execute((ROOT / 'supabase/migrations' / (version + '.sql')).read_text())
            for name, token in zip(names, credentials):
                conn.execute("insert into public.gtm_access_tokens(name,token_hash,can_write,expires_at) values(%s,%s,true,now()+interval '90 days')",
                             (name, hashlib.sha256(token.encode()).hexdigest()))
            count = conn.execute("select count(*) from pg_tables where schemaname='public' and tablename like 'gtm_%'").fetchone()[0]
            assert count == 12, count
            conn.commit()
            committed = True
        for pending, output in zip(staged, outputs):
            pending.replace(output)
        print('Created 11 GTM business tables + 1 scoped-access infrastructure table and aggregate RPCs.')
        print('Two 90-day scoped credentials saved in owner-only local configuration files. No secret values printed.')
    finally:
        if not committed:
            for path in staged:
                path.unlink(missing_ok=True)


if __name__ == '__main__':
    main()
