"""Capture actual team/company rows read-only; restore only to a fresh local clone."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import sys
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
WORKER = ROOT.parent / "harper_worker"
TASK = ROOT / "docs/evaluation/company-agentic-role-search"
sys.path.insert(0, str(WORKER))
from scripts.run_company_matching_local import load_local_environment
from opp.utils.new_runtime import connect_read_only, load_config, fetch_all
import psycopg
from psycopg import sql
from psycopg.types.json import Jsonb


def save(file: Path, value):
    with file.open("x") as output:
        json.dump(value, output, ensure_ascii=False, indent=2, default=str)
        output.write("\n")
    file.chmod(0o600)


def capture(directory: Path, team_id: str):
    if not directory.is_relative_to((TASK / "private").resolve()):
        raise ValueError("Capture belongs only in the ignored private directory")
    directory.mkdir(mode=0o700)
    load_local_environment()
    with connect_read_only(load_config()) as conn:
        barrier = fetch_all(conn, "select current_setting('transaction_read_only') value")[0]["value"]
        assert barrier == "on"
        team = fetch_all(conn, "select * from company_workspace_teams where id=%s and deleted_at is null", (team_id,))
        if len(team) != 1:
            raise ValueError("Exactly one actual active team required")
        workspace = team[0]["company_workspace_id"]
        specs = {
            "company_workspace": ("company_workspace_id=%s", (workspace,)),
            "company_users": ("user_id in (select company_user_id from company_user_workspace where company_workspace_id=%s)", (workspace,)),
            "company_user_workspace": ("company_workspace_id=%s", (workspace,)),
            "company_workspace_teams": ("company_workspace_id=%s", (workspace,)),
            "company_workspace_team_members": ("team_id in (select id from company_workspace_teams where company_workspace_id=%s)", (workspace,)),
            "company_roles": ("company_workspace_id=%s", (workspace,)),
            "company_internal_roles": ("role_id in (select role_id from company_roles where company_workspace_id=%s)", (workspace,)),
            "company_db": ("id in (select company_db_id from company_workspace where company_workspace_id=%s)", (workspace,)),
            "company_data": ("company_workspace_id=%s", (workspace,)),
            "company_memories": ("company_workspace_id=%s", (workspace,)),
            "company_memory_entries": ("company_workspace_id=%s", (workspace,)),
            "company_workspace_slots": ("company_workspace_id=%s", (workspace,)),
            "company_workspace_credit_periods": ("company_workspace_id=%s", (workspace,)),
            "company_conversations": ("company_workspace_id=%s", (workspace,)),
            "company_messages": ("company_workspace_id=%s", (workspace,)),
            "company_conversation_summaries": ("company_workspace_id=%s", (workspace,)),
        }
        omitted = {"email", "phone", "phone_number", "access_token", "refresh_token", "password", "password_hash", "encrypted_password", "bot_token_ciphertext", "stripe_customer_id", "stripe_subscription_id", "stripe_invoice_id", "billing_checkout"}
        tables, schema = {}, {}
        for table, (where, params) in specs.items():
            columns = fetch_all(conn, "select column_name,data_type,udt_name from information_schema.columns where table_schema='public' and table_name=%s order by ordinal_position", (table,))
            kept = [c["column_name"] for c in columns if c["column_name"] not in omitted and c["udt_name"] not in {"vector", "halfvec"}]
            quoted = ",".join('"' + c.replace('"', '""') + '"' for c in kept)
            tables[table] = fetch_all(conn, f'SELECT {quoted} FROM public."{table}" WHERE {where}', params)
            schema[table] = columns
        actor = next(row for row in tables["company_user_workspace"] if row["authority"] == "owner")
        conversation = next((row for row in tables["company_conversations"] if row["role_id"] is None and row.get("team_id") is None and not row.get("team_scope")), None)
        if not conversation:
            raise ValueError("Actual organization conversation required; do not synthesize one")
        save(directory / "tables.json", tables)
        save(directory / "schema.json", schema)
        manifest = {"task": "company-agentic-role-search", "datasetVersion": "team-memory-v1", "capturedAt": datetime.now(timezone.utc).isoformat(), "teamId": team_id, "workspaceId": workspace, "actorId": actor["company_user_id"], "conversationId": conversation["id"], "captureSource": "opp.utils.new_runtime.connect_read_only", "readOnlyBarrier": barrier, "productionWrites": 0, "omittedColumns": sorted(omitted), "tableCounts": {key: len(rows) for key, rows in tables.items()}, "files": {name: hashlib.sha256((directory / name).read_bytes()).hexdigest() for name in ("tables.json", "schema.json")}, "limitations": ["Organization-authorized actor, not a team-restricted actor.", "Real team/company snapshot; no candidate matching or paid-Slot claim.", "Sequential read-only queries, not a historical single MVCC snapshot.", "Current team has no assigned teammate; team-viewer boundary is not observed."]}
        save(directory / "manifest.json", manifest)
        print(json.dumps({"captured": str(directory), "tableCounts": manifest["tableCounts"]}))


def restore(directory: Path, url: str):
    parsed = urlparse(url)
    if parsed.hostname != "127.0.0.1" or parsed.port != 55461 or not parsed.path.startswith("/harper_agentic_run_"):
        raise ValueError("Only a fresh dedicated local evaluation clone may be restored")
    manifest = json.loads((directory / "manifest.json").read_text())
    for file, digest in manifest["files"].items():
        assert hashlib.sha256((directory / file).read_bytes()).hexdigest() == digest
    tables = json.loads((directory / "tables.json").read_text())
    schema = json.loads((directory / "schema.json").read_text())
    with psycopg.connect(url) as conn:
        if conn.execute("select 1 from company_workspace where company_workspace_id=%s", (manifest["workspaceId"],)).fetchone():
            raise ValueError("Refusing to replace an existing workspace; use a fresh clone")
        conn.execute("set local session_replication_role=replica")
        for user in tables["company_users"]:
            conn.execute("insert into auth.users(id) values(%s) on conflict(id) do nothing", (user["user_id"],))
        for table, rows in tables.items():
            if not rows:
                continue
            generated = {row[0] for row in conn.execute("select column_name from information_schema.columns where table_schema='public' and table_name=%s and is_generated<>'NEVER'", (table,))}
            columns = [name for name in rows[0] if name not in generated]
            types = {c["column_name"]: c["data_type"] for c in schema[table]}
            pk = [r[0] for r in conn.execute("select a.attname from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum=any(i.indkey) where i.indrelid=%s::regclass and i.indisprimary", (table,))]
            query = sql.SQL("insert into public.{} ({}) values ({})").format(sql.Identifier(table), sql.SQL(',').join(map(sql.Identifier, columns)), sql.SQL(',').join(sql.Placeholder() for _ in columns))
            if pk:
                updates = [name for name in columns if name not in pk]
                query += sql.SQL(" on conflict ({}) do update set {}").format(sql.SQL(',').join(map(sql.Identifier, pk)), sql.SQL(',').join(sql.SQL('{}=excluded.{}').format(sql.Identifier(name), sql.Identifier(name)) for name in updates))
            for row in rows:
                conn.execute(query, [Jsonb(row[name]) if row.get(name) is not None and types[name] in {"json", "jsonb"} else row.get(name) for name in columns])
        conn.execute("set local session_replication_role=origin")
    from llm_evals.company_agentic_role_search.local_database import align_sequences
    align_sequences(url)
    print(json.dumps({"restoredActualRows": sum(map(len, tables.values())), "productionWrites": 0}))


if __name__ == "__main__":
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["capture", "restore"])
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--team-id")
    parser.add_argument("--database-url")
    args = parser.parse_args()
    if args.mode == "capture":
        capture(args.directory.resolve(), args.team_id)
    else:
        restore(args.directory.resolve(), args.database_url)
